import type { Feature } from "geojson";
import { houseIdOf } from "./geo/houses";

/** First house id in a hit-test result, or null. Pure so it is unit-testable. */
export function firstHouseId(features: Feature[]): string | null {
  for (const f of features) {
    const id = houseIdOf(f);
    if (id !== null) return id;
  }
  return null;
}

/**
 * Single switch for the lead gesture (backend README: long press; Figma hint says tap).
 * TODO(product): confirm with Tristan; flipping this one constant swaps the gesture.
 */
export const LEAD_GESTURE: "longPress" | "tap" = "longPress";

export interface HouseCallbacks {
  onHousePress?: (id: string) => void;
  onHouseLongPress?: (id: string) => void;
}

/** Route a hit house id to the callbacks. `kind` is the gesture that happened. */
export function dispatchHouseGesture(kind: "tap" | "longPress", id: string | null, cb: HouseCallbacks): boolean {
  if (id === null) return false;
  const handler = kind === "tap" ? cb.onHousePress : cb.onHouseLongPress;
  handler?.(id);
  return handler !== undefined;
}

/** Zoom value worth reporting: rounded to 2 decimals, null if unchanged since `previous`. */
export function nextZoom(previous: number | null, zoom: number): number | null {
  const rounded = Math.round(zoom * 100) / 100;
  return previous !== null && Math.abs(previous - rounded) < 0.01 ? null : rounded;
}
