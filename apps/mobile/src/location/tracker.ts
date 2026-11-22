import { ensureTrackingPermission, type PermissionApi } from "./permissions";
import { TRACKING_MODES, type TrackingModeConfig } from "./modes";
import type { BatchProcessor, CredentialStore } from "./batchProcessor";
import { useMyLocationStore } from "./myLocationStore";
import type { TrackingMode, TrackingPermission } from "./types";
import { startFlushLoop, type FlushLoop } from "../realtime/outbox/flushLoop";
import type { OutboxFlusher } from "../realtime/outbox/flusher";
import { logger } from "../realtime/logger";

/** Starts/stops OS location updates. Implemented with expo-location in nativeLocation.ts. */
export interface LocationEngine {
  start(config: TrackingModeConfig, options: { background: boolean }): Promise<void>;
  stop(): Promise<void>;
}

export interface TrackerDeps {
  permissions: PermissionApi;
  engine: LocationEngine;
  credentials: CredentialStore;
  processor: BatchProcessor;
  flusher: OutboxFlusher;
}

export interface StartResult {
  permission: TrackingPermission;
  /** True when updates are running (foreground-only still tracks, but not with the screen off). */
  tracking: boolean;
}

export interface Tracker {
  start(sessionId: string, token: string, mode: TrackingMode): Promise<StartResult>;
  stop(): Promise<void>;
}

export function createTracker(deps: TrackerDeps): Tracker {
  let loop: FlushLoop | null = null;
  const store = useMyLocationStore;

  const stop = async (): Promise<void> => {
    loop?.stop();
    loop = null;
    try {
      await deps.engine.stop();
    } finally {
      await deps.credentials.clear();
      store.getState().setTracking(false, null);
    }
  };

  return {
    stop,
    start: async (sessionId, token, mode) => {
      const permission = await ensureTrackingPermission(deps.permissions);
      store.getState().setPermission(permission);
      if (permission === "denied" || permission === "blocked") return { permission, tracking: false };

      if (loop) await stop(); // switching mode or session: restart cleanly
      const config = TRACKING_MODES[mode];
      try {
        await deps.credentials.save({ sessionId, token, mode });
        deps.processor.reset();
        await deps.engine.start(config, { background: permission === "always" });
      } catch (error) {
        logger.error("location: could not start tracking", error);
        await deps.credentials.clear();
        store.getState().setError(error instanceof Error ? error.message : "Could not start tracking");
        return { permission, tracking: false };
      }
      store.getState().setError(null);
      store.getState().setTracking(true, mode);
      loop = startFlushLoop({ flusher: deps.flusher, sessionId, token, intervalMs: config.flushIntervalMs });
      return { permission, tracking: true };
    },
  };
}
