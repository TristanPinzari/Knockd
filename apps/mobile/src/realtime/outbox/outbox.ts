/**
 * The write side of the offline queue. Every ping, lead, message and pin gets a client UUID and is
 * stored until the server acknowledges it (see flusher.ts), so nothing is lost offline and retries
 * are harmless (the server dedupes on clientId).
 */
import type { Grade, Ping } from "@knockd/shared";
import type { OutboxItem, OutboxPayload, OutboxStore } from "./types";

export const UNKNOWN_ACCURACY_M = 50;

export interface PingFix {
  lat: number;
  lng: number;
  /** Metres, or null when the OS gave none. */
  accuracy: number | null;
  /** ms since epoch */
  t: number;
}

export interface NewLead {
  houseId: number;
  grade: Grade;
  note?: string;
  /** ms since epoch; defaults to now. */
  t?: number;
}

export interface OutboxDeps {
  store: OutboxStore;
  newId: () => string;
  now: () => number;
}

export interface Outbox {
  enqueuePings(sessionId: string, fixes: readonly PingFix[]): Promise<Ping[]>;
  /** Returns the clientId so the UI can show the lead immediately. */
  enqueueLead(sessionId: string, lead: NewLead): Promise<string>;
  enqueueLeadPatch(
    sessionId: string,
    leadClientId: string,
    change: { grade?: Grade; note?: string | null },
  ): Promise<void>;
  enqueueLeadDelete(sessionId: string, leadClientId: string): Promise<void>;
  enqueueMessage(sessionId: string, body: string): Promise<string>;
  enqueuePin(sessionId: string, pin: { lat: number; lng: number; label?: string }): Promise<string>;
  enqueuePinDelete(sessionId: string, pinClientId: string): Promise<void>;
  /** Items still waiting for the server, for one session or all. */
  pending(sessionId?: string): Promise<number>;
}

export function fixToPing(fix: PingFix, clientId: string): Ping {
  return {
    clientId,
    t: new Date(fix.t).toISOString(),
    lat: fix.lat,
    lng: fix.lng,
    accuracy: Math.max(0, fix.accuracy ?? UNKNOWN_ACCURACY_M),
  };
}

export function createOutbox({ store, newId, now }: OutboxDeps): Outbox {
  const item = (sessionId: string, id: string, payload: OutboxPayload): OutboxItem => ({
    id,
    sessionId,
    createdAt: now(),
    attempts: 0,
    nextAttemptAt: 0,
    payload,
  });

  const put = async (sessionId: string, id: string, payload: OutboxPayload): Promise<string> => {
    await store.enqueue([item(sessionId, id, payload)]);
    return id;
  };

  return {
    enqueuePings: async (sessionId, fixes) => {
      const pings = fixes.map((fix) => fixToPing(fix, newId()));
      await store.enqueue(pings.map((body) => item(sessionId, body.clientId, { kind: "ping", body })));
      return pings;
    },
    enqueueLead: (sessionId, lead) => {
      const clientId = newId();
      return put(sessionId, clientId, {
        kind: "lead",
        body: {
          clientId,
          t: new Date(lead.t ?? now()).toISOString(),
          houseId: lead.houseId,
          grade: lead.grade,
          ...(lead.note ? { note: lead.note } : {}),
        },
      });
    },
    enqueueLeadPatch: async (sessionId, leadClientId, change) => {
      await put(sessionId, newId(), { kind: "leadPatch", leadClientId, body: change });
    },
    enqueueLeadDelete: async (sessionId, leadClientId) => {
      await put(sessionId, newId(), { kind: "leadDelete", leadClientId });
    },
    enqueueMessage: (sessionId, body) => {
      const clientId = newId();
      return put(sessionId, clientId, { kind: "message", body: { clientId, body } });
    },
    enqueuePin: (sessionId, pin) => {
      const clientId = newId();
      return put(sessionId, clientId, {
        kind: "pin",
        body: { clientId, lat: pin.lat, lng: pin.lng, ...(pin.label ? { label: pin.label } : {}) },
      });
    },
    enqueuePinDelete: async (sessionId, pinClientId) => {
      await put(sessionId, newId(), { kind: "pinDelete", pinClientId });
    },
    pending: (sessionId) => store.count(sessionId),
  };
}
