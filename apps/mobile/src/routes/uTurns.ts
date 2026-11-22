/**
 * Where a route turns back on itself: the end of a dead end, or the end of a street worked one side
 * then back up the other. These are always marked on the map, so nobody wonders why the route
 * doubles back.
 */
import { distanceM, type LatLng } from "@knockd/shared";

/** A turn sharper than this (degrees) is a U-turn. */
export const U_TURN_MIN_DEG = 150;
/** Direction is measured over at least this much line on each side, so GPS-scale wiggles don't count. */
const LOOK_M = 8;
/** Two U-turns closer than this are one. */
const MERGE_M = 15;

function bearing(a: LatLng, b: LatLng): number {
  const kx = Math.cos((a.lat * Math.PI) / 180);
  return (Math.atan2((b.lng - a.lng) * kx, b.lat - a.lat) * 180) / Math.PI;
}

/** The first point at least LOOK_M from points[i], walking by `step` (-1 back, +1 forward). */
function reach(points: readonly LatLng[], i: number, step: -1 | 1): LatLng | null {
  for (let j = i + step; j >= 0 && j < points.length; j += step)
    if (distanceM(points[i]!, points[j]!) >= LOOK_M) return points[j]!;
  return null;
}

export function uTurnPoints(route: readonly LatLng[]): LatLng[] {
  const found: LatLng[] = [];
  for (let i = 1; i < route.length - 1; i++) {
    const before = reach(route, i, -1);
    const after = reach(route, i, 1);
    if (!before || !after) continue;
    const incoming = bearing(before, route[i]!);
    const outgoing = bearing(route[i]!, after);
    const turn = Math.abs(((((outgoing - incoming) % 360) + 540) % 360) - 180);
    if (turn < U_TURN_MIN_DEG) continue;
    if (found.some((p) => distanceM(p, route[i]!) < MERGE_M)) continue;
    found.push(route[i]!);
  }
  return found;
}
