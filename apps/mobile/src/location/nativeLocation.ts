/**
 * expo-location + expo-task-manager adapters. This is the only file that touches the native
 * location modules, so everything else runs in unit tests without a device.
 * Real background behaviour (screen off, iOS/Android battery policies) can only be verified on a
 * physical phone with a dev build.
 */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { logger } from "../realtime/logger";
import { FOREGROUND_NOTIFICATION, type TrackingModeConfig } from "./modes";
import type { PermissionApi, PermissionResponse } from "./permissions";
import type { LocationEngine } from "./tracker";
import type { LocationFix } from "./types";
import type { BatchProcessor } from "./batchProcessor";

export const LOCATION_TASK_NAME = "knockd-background-location";

const toResponse = (r: Location.PermissionResponse): PermissionResponse => ({
  status:
    r.status === Location.PermissionStatus.GRANTED
      ? "granted"
      : r.status === Location.PermissionStatus.DENIED
        ? "denied"
        : "undetermined",
  canAskAgain: r.canAskAgain,
});

export const nativePermissions: PermissionApi = {
  getForeground: async () => toResponse(await Location.getForegroundPermissionsAsync()),
  requestForeground: async () => toResponse(await Location.requestForegroundPermissionsAsync()),
  getBackground: async () => toResponse(await Location.getBackgroundPermissionsAsync()),
  requestBackground: async () => toResponse(await Location.requestBackgroundPermissionsAsync()),
};

export function toFix(l: Location.LocationObject): LocationFix {
  return { lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy, t: l.timestamp };
}

const ACCURACY = { high: Location.Accuracy.High, balanced: Location.Accuracy.Balanced } as const;

/**
 * Registers the headless task. MUST be called at module scope on app start (e.g. from app/_layout.tsx
 * imports), otherwise the OS cannot wake the app's JS to deliver background updates.
 */
export function defineLocationTask(getProcessor: () => Promise<BatchProcessor>): void {
  if (TaskManager.isTaskDefined(LOCATION_TASK_NAME)) return;
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      logger.warn("location task error", error.message);
      return;
    }
    const locations = data?.locations ?? [];
    if (locations.length === 0) return;
    try {
      await (await getProcessor()).process(locations.map(toFix));
    } catch (e) {
      logger.warn("location task failed", e);
    }
  });
}

export function createNativeEngine(getProcessor: () => Promise<BatchProcessor>): LocationEngine {
  let watcher: Location.LocationSubscription | null = null;

  const stopWatcher = (): void => {
    watcher?.remove();
    watcher = null;
  };

  return {
    start: async (config: TrackingModeConfig, { background }) => {
      const accuracy = ACCURACY[config.accuracy];
      if (!background) {
        // Foreground-only fallback: same rules, but only while the app is open.
        stopWatcher();
        watcher = await Location.watchPositionAsync(
          { accuracy, distanceInterval: config.minMoveM, timeInterval: config.minIntervalMs },
          (l) => void getProcessor().then((p) => p.process([toFix(l)])),
        );
        return;
      }
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy,
        distanceInterval: config.minMoveM, // the OS only wakes us after ~10 m of movement
        timeInterval: config.minIntervalMs, // Android only
        deferredUpdatesInterval: config.flushIntervalMs, // iOS: batch deliveries
        deferredUpdatesDistance: config.minMoveM,
        pausesUpdatesAutomatically: true, // iOS: let the OS pause GPS when standing still
        activityType: Location.ActivityType.Fitness,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: FOREGROUND_NOTIFICATION.title,
          notificationBody: FOREGROUND_NOTIFICATION.body,
          notificationColor: FOREGROUND_NOTIFICATION.colour,
        },
      });
    },
    stop: async () => {
      stopWatcher();
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    },
  };
}
