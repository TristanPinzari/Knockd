/** One-off "where am I" for centring a new session. Never throws: null means "use the demo centre". */
import * as Location from "expo-location";
import type { LatLng } from "@knockd/shared";
import { useMyLocationStore } from "../location/myLocationStore";
import { logger } from "../realtime/logger";

const FIX_TIMEOUT_MS = 6_000;
const MAX_LAST_KNOWN_AGE_MS = 5 * 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        logger.warn("location: one-off fix failed", error);
        resolve(null);
      },
    );
  });
}

export async function getCurrentLatLng(): Promise<LatLng | null> {
  const tracked = useMyLocationStore.getState().fix;
  if (tracked) return { lat: tracked.lat, lng: tracked.lng };
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: MAX_LAST_KNOWN_AGE_MS });
    const position =
      last ??
      (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), FIX_TIMEOUT_MS));
    return position ? { lat: position.coords.latitude, lng: position.coords.longitude } : null;
  } catch (error) {
    logger.warn("location: could not get a starting position", error);
    return null;
  }
}
