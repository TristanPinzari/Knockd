/**
 * What happens to each batch of readings the OS hands us (foreground or from the background task):
 * apply the 10 m rule, queue the kept points in the outbox, update the "me" dot, and flush to the
 * server when the mode's interval has passed. Runs headless, so it reads its credentials from a
 * CredentialStore instead of relying on app state.
 */
import type { Outbox } from "../realtime/outbox/outbox";
import type { OutboxFlusher } from "../realtime/outbox/flusher";
import { logger } from "../realtime/logger";
import { selectFixesToRecord } from "./filter";
import { TRACKING_MODES } from "./modes";
import type { LocationFix, TrackingMode } from "./types";

export interface TrackingCredentials {
  sessionId: string;
  token: string;
  mode: TrackingMode;
}

export interface CredentialStore {
  save(credentials: TrackingCredentials): Promise<void>;
  load(): Promise<TrackingCredentials | null>;
  clear(): Promise<void>;
}

export interface BatchProcessorDeps {
  credentials: CredentialStore;
  outbox: Pick<Outbox, "enqueuePings">;
  flusher: OutboxFlusher;
  onFix: (fix: LocationFix) => void;
  /** The points just queued for upload, so this phone can draw them on its own trail right away. */
  onRecorded?: (sessionId: string, fixes: readonly LocationFix[]) => void;
  now: () => number;
}

export interface BatchProcessor {
  process(fixes: readonly LocationFix[]): Promise<void>;
  /** Forget the last recorded point and flush time (call when tracking starts). */
  reset(): void;
}

export function createBatchProcessor(deps: BatchProcessorDeps): BatchProcessor {
  let last: LocationFix | null = null;
  let lastFlushAt = 0;

  return {
    reset: () => {
      last = null;
      lastFlushAt = 0;
    },
    process: async (fixes) => {
      const creds = await deps.credentials.load();
      if (!creds) return; // tracking was stopped; ignore stragglers
      const config = TRACKING_MODES[creds.mode];
      const newest = fixes.reduce<LocationFix | null>((acc, f) => (acc && acc.t >= f.t ? acc : f), null);
      if (newest) deps.onFix(newest); // the dot follows every reading, even ones we do not record

      const result = selectFixesToRecord(last, fixes, config);
      last = result.last;
      if (result.recorded.length > 0) {
        await deps.outbox.enqueuePings(creds.sessionId, result.recorded);
        deps.onRecorded?.(creds.sessionId, result.recorded);
      }

      const at = deps.now();
      if (at - lastFlushAt < config.flushIntervalMs) return;
      lastFlushAt = at;
      try {
        await deps.flusher.flush(creds.sessionId, creds.token);
      } catch (error) {
        logger.warn("location: flush failed, will retry", error);
      }
    },
  };
}
