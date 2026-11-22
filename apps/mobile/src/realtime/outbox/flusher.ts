/**
 * Sends queued items to the server and removes them once acknowledged.
 *
 * - Pings go out in batches of up to MAX_PINGS_PER_BATCH to POST /pings; everything else is sent
 *   one by one, oldest first (a lead is always created before it is patched or deleted).
 * - Network errors, 429 and 5xx: keep the item and retry later with exponential backoff.
 * - 400/403/404/409 (the payload can never succeed): drop it so it cannot block the queue. A bad
 *   ping inside a batch is found by splitting the batch in half.
 * - 401: stop and report `unauthorized` (the token needs replacing; data is kept).
 * - 410 / session not found: the session is over, so its queue is cleared (`ended`).
 * - Only one flush runs at a time; callers during a flush share its result.
 */
import { MAX_PINGS_PER_BATCH } from "@knockd/shared";
import type { ApiClient } from "../api";
import { classifyFailure, type FailureAction } from "../errors";
import { logger } from "../logger";
import { backoffDelayMs } from "./backoff";
import type { OutboxItem, OutboxStore } from "./types";

export type FlushStatus = "ok" | "retry" | "unauthorized" | "ended";

export interface FlushResult {
  status: FlushStatus;
  sent: number;
  dropped: number;
  /** Items still queued for this session after the flush. */
  remaining: number;
}

export interface FlusherDeps {
  store: OutboxStore;
  api: Pick<ApiClient, "postPings" | "postLead" | "patchLead" | "deleteLead" | "postMessage" | "postPin" | "deletePin">;
  now: () => number;
  random?: () => number;
  /** How many due items to load per flush pass. */
  pageSize?: number;
}

export interface OutboxFlusher {
  flush(sessionId: string, token: string): Promise<FlushResult>;
}

const DEFAULT_PAGE_SIZE = 1000;

interface Tally {
  sent: number;
  dropped: number;
  stop: FlushStatus | null;
}

export function createFlusher(deps: FlusherDeps): OutboxFlusher {
  const { store, api, now } = deps;
  const random = deps.random ?? Math.random;
  const pageSize = deps.pageSize ?? DEFAULT_PAGE_SIZE;
  let inFlight: { sessionId: string; promise: Promise<FlushResult> } | null = null;

  async function retryLater(items: readonly OutboxItem[]): Promise<void> {
    const at = now();
    await store.reschedule(
      items.map((i) => ({
        id: i.id,
        attempts: i.attempts + 1,
        nextAttemptAt: at + backoffDelayMs(i.attempts, random),
      })),
    );
  }

  /** Applies a failure to the queue. Returns a status when the whole flush should stop. */
  async function handleFailure(action: FailureAction, items: readonly OutboxItem[], tally: Tally): Promise<void> {
    if (action === "drop") {
      await store.remove(items.map((i) => i.id));
      tally.dropped += items.length;
    } else if (action === "retry") {
      await retryLater(items);
      tally.stop = "retry";
    } else {
      tally.stop = action === "auth" ? "unauthorized" : "ended";
    }
  }

  async function sendPings(sessionId: string, token: string, batch: OutboxItem[], tally: Tally): Promise<void> {
    if (batch.length === 0 || tally.stop) return;
    const pings = batch.flatMap((i) => (i.payload.kind === "ping" ? [i.payload.body] : []));
    try {
      await api.postPings(sessionId, token, pings);
      await store.remove(batch.map((i) => i.id));
      tally.sent += batch.length;
    } catch (error) {
      const action = classifyFailure(error);
      if (action === "drop" && batch.length > 1) {
        const mid = Math.ceil(batch.length / 2);
        await sendPings(sessionId, token, batch.slice(0, mid), tally);
        await sendPings(sessionId, token, batch.slice(mid), tally);
        return;
      }
      logger.warn(`outbox: ping batch failed (${action})`, error);
      await handleFailure(action, batch, tally);
    }
  }

  async function sendOne(sessionId: string, token: string, item: OutboxItem): Promise<void> {
    const p = item.payload;
    switch (p.kind) {
      case "lead":
        await api.postLead(sessionId, token, p.body);
        return;
      case "leadPatch":
        await api.patchLead(sessionId, token, p.leadClientId, p.body);
        return;
      case "leadDelete":
        await api.deleteLead(sessionId, token, p.leadClientId);
        return;
      case "message":
        await api.postMessage(sessionId, token, p.body);
        return;
      case "pin":
        await api.postPin(sessionId, token, p.body);
        return;
      case "pinDelete":
        await api.deletePin(sessionId, token, p.pinClientId);
        return;
      case "ping":
        return; // sent in batches
    }
  }

  async function sendSequentially(sessionId: string, token: string, items: OutboxItem[], tally: Tally): Promise<void> {
    for (const item of items) {
      if (tally.stop) return;
      try {
        await sendOne(sessionId, token, item);
        await store.remove([item.id]);
        tally.sent += 1;
      } catch (error) {
        const action = classifyFailure(error);
        logger.warn(`outbox: ${item.payload.kind} failed (${action})`, error);
        await handleFailure(action, [item], tally);
      }
    }
  }

  async function run(sessionId: string, token: string): Promise<FlushResult> {
    const tally: Tally = { sent: 0, dropped: 0, stop: null };
    // Loop while a full page came back so a long offline backlog drains in one flush.
    for (;;) {
      const due = await store.due(sessionId, now(), pageSize);
      if (due.length === 0) break;
      const pings = due.filter((i) => i.payload.kind === "ping");
      const others = due.filter((i) => i.payload.kind !== "ping");
      for (let i = 0; i < pings.length; i += MAX_PINGS_PER_BATCH) {
        await sendPings(sessionId, token, pings.slice(i, i + MAX_PINGS_PER_BATCH), tally);
      }
      await sendSequentially(sessionId, token, others, tally);
      if (tally.stop || due.length < pageSize) break;
    }
    if (tally.stop === "ended") await store.clearSession(sessionId);
    return {
      status: tally.stop ?? "ok",
      sent: tally.sent,
      dropped: tally.dropped,
      remaining: await store.count(sessionId),
    };
  }

  return {
    flush: (sessionId, token) => {
      if (inFlight && inFlight.sessionId === sessionId) return inFlight.promise;
      const promise = run(sessionId, token).finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
      inFlight = { sessionId, promise };
      return promise;
    },
  };
}
