/**
 * Public API of the location module.
 * Call `registerLocationTask()` once at app start (module scope of app/_layout.tsx).
 */
import { getRuntime } from "../realtime/runtime";
import { createBatchProcessor, type BatchProcessor } from "./batchProcessor";
import { secureCredentialStore } from "./credentialStore";
import { useMyLocationStore } from "./myLocationStore";
import { createNativeEngine, defineLocationTask, nativePermissions } from "./nativeLocation";
import { createTracker, type Tracker } from "./tracker";
import type { TrackingMode } from "./types";

let processor: Promise<BatchProcessor> | null = null;
const getProcessor = (): Promise<BatchProcessor> => {
  processor ??= getRuntime().then(({ outbox, flusher }) =>
    createBatchProcessor({
      credentials: secureCredentialStore,
      outbox,
      flusher,
      onFix: (fix) => useMyLocationStore.getState().setFix(fix),
      now: Date.now,
    }),
  );
  return processor;
};

export function registerLocationTask(): void {
  defineLocationTask(getProcessor);
}

let tracker: Tracker | null = null;
async function getTracker(): Promise<Tracker> {
  if (tracker) return tracker;
  const { flusher } = await getRuntime();
  const p = await getProcessor();
  tracker = createTracker({
    permissions: nativePermissions,
    engine: createNativeEngine(getProcessor),
    credentials: secureCredentialStore,
    processor: p,
    flusher,
  });
  return tracker;
}

export async function startTracking(sessionId: string, token: string, mode: TrackingMode) {
  return (await getTracker()).start(sessionId, token, mode);
}

export async function stopTracking(): Promise<void> {
  return (await getTracker()).stop();
}

/** Items (pings, leads, messages, pins) still waiting for the server. For the offline badge. */
export async function pendingOutboxCount(sessionId?: string): Promise<number> {
  return (await getRuntime()).outbox.pending(sessionId);
}

export { useMyLocation } from "./useMyLocation";
export { useMyLocationStore } from "./myLocationStore";
export { TRACKING_MODES } from "./modes";
export type { TrackingMode, TrackingPermission, LocationFix } from "./types";
