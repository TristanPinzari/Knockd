/**
 * Loads (or reloads) everything a session needs: the snapshot (members, leads, pins, chat) and the
 * trails. On the first connect we fetch all trails; on a reconnect only `?since=` the newest point
 * we already have. Failures retry with backoff.
 */
import type { SessionSnapshotRes } from "@knockd/shared";
import { useTrailsStore } from "../trails/trailsStore";
import type { ApiClient } from "./api";
import { logger } from "./logger";
import { backoffDelayMs } from "./outbox/backoff";
import { useChatStore } from "./stores/chatStore";
import { useCrewStore } from "./stores/crewStore";
import { useLeadsStore } from "./stores/leadsStore";
import { usePinsStore } from "./stores/pinsStore";
import { usePlanStore } from "./stores/planStore";
import { useSessionStore } from "./stores/sessionStore";

export const MAX_SYNC_ATTEMPTS = 6;

export interface SessionSyncDeps {
  api: Pick<ApiClient, "getSnapshot" | "getTrails">;
  sessionId: string;
  token: string;
  random?: () => number;
}

export function applySnapshot(snapshot: SessionSnapshotRes, myMemberId: string | null): void {
  useCrewStore.getState().seed(snapshot.members);
  useLeadsStore.getState().seed(snapshot.leads);
  usePinsStore.getState().seed(snapshot.pins);
  usePlanStore.getState().setPlan(snapshot.plan, snapshot.planVersion);
  useChatStore.getState().seed(snapshot.messages, myMemberId);
  useSessionStore.getState().setStatus(snapshot.session.status);
  useSessionStore.getState().setLoadedMap(snapshot.session.loadedMap);
}

/** One attempt. Throws on failure; stores are only touched after both requests succeed. */
export async function syncOnce({ api, sessionId, token }: SessionSyncDeps): Promise<void> {
  const trails = useTrailsStore.getState();
  const since = trails.lastPointT;
  const [snapshot, trailsRes] = await Promise.all([
    api.getSnapshot(sessionId, token),
    api.getTrails(sessionId, token, since),
  ]);
  applySnapshot(snapshot, useCrewStore.getState().myMemberId);
  if (since === null) trails.setFromResponse(trailsRes.trails);
  else trails.mergeFromResponse(trailsRes.trails);
  useSessionStore.getState().setSynced(true);
  useSessionStore.getState().setSyncError(null);
}

export interface SessionSync {
  /** Start a sync (cancels any pending retry). Resolves true when it succeeded. */
  run(): Promise<boolean>;
  cancel(): void;
}

export function createSessionSync(deps: SessionSyncDeps): SessionSync {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  const cancel = (): void => {
    generation += 1;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const attempt = async (n: number, mine: number): Promise<boolean> => {
    try {
      await syncOnce(deps);
      return true;
    } catch (error) {
      if (mine !== generation) return false;
      const message = error instanceof Error ? error.message : "Sync failed";
      logger.warn(`session sync failed (attempt ${n + 1})`, error);
      useSessionStore.getState().setSyncError(message);
      if (n + 1 >= MAX_SYNC_ATTEMPTS) return false;
      return new Promise<boolean>((resolve) => {
        timer = setTimeout(
          () => {
            timer = null;
            resolve(mine === generation ? attempt(n + 1, mine) : false);
          },
          backoffDelayMs(n, deps.random),
        );
      });
    }
  };

  return {
    run: () => {
      cancel();
      useSessionStore.getState().setSynced(false);
      return attempt(0, generation);
    },
    cancel,
  };
}
