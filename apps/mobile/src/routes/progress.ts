/**
 * How far along their planned route someone has walked, from their GPS trail. Progress only moves
 * forward. Each GPS point is snapped onto the route near the current progress, so a route that
 * walks down a street and back up it (a U-turn) fills in one leg at a time instead of jumping to
 * the return leg.
 */
import type { LatLng } from "@knockd/shared";
import { project, type MeasuredLine } from "./polyline";

/** A GPS point further than this from the route doesn't count (they're off the plan). */
export const SNAP_DISTANCE_M = 25;
/** How far behind the current progress a point may snap (GPS jitter). */
export const LOOK_BACK_M = 15;
/** How far ahead of the current progress a point may snap in one step. */
export const LOOK_AHEAD_M = 80;
/**
 * Points in a row that snap further ahead than LOOK_AHEAD_M before progress jumps there (e.g. the
 * app was closed for a stretch, or they cut across). One stray point never causes a jump.
 */
export const JUMP_CONFIRM_POINTS = 3;

export function routeProgressM(line: MeasuredLine, trail: readonly LatLng[]): number {
  let progress = 0;
  let farHits = 0;
  for (const p of trail) {
    const near = project(line, p, progress - LOOK_BACK_M, progress + LOOK_AHEAD_M);
    if (near && near.offM <= SNAP_DISTANCE_M) {
      progress = Math.max(progress, near.alongM);
      farHits = 0;
      continue;
    }
    const far = project(line, p, progress, line.lengthM);
    if (!far || far.offM > SNAP_DISTANCE_M) continue;
    farHits += 1;
    if (farHits >= JUMP_CONFIRM_POINTS) {
      progress = far.alongM;
      farHits = 0;
    }
  }
  return progress;
}
