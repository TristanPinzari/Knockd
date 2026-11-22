import type { LocationFix } from "./types";
import type { TrackingModeConfig } from "./modes";
import { distanceM } from "@knockd/shared";

export interface RecordResult {
  recorded: LocationFix[];
  /** Pass back in on the next call. */
  last: LocationFix | null;
}

/**
 * Battery rule from the README: record a point only after moving about 10 m. Drops poor-accuracy
 * readings and out-of-order/duplicate timestamps. The first good reading always counts.
 * Pure: never mutates its inputs.
 */
export function selectFixesToRecord(
  last: LocationFix | null,
  fixes: readonly LocationFix[],
  config: Pick<TrackingModeConfig, "minMoveM" | "maxAccuracyM">,
): RecordResult {
  const recorded: LocationFix[] = [];
  let anchor = last;
  const ordered = [...fixes].sort((a, b) => a.t - b.t);
  for (const fix of ordered) {
    if (fix.accuracy !== null && fix.accuracy > config.maxAccuracyM) continue;
    if (anchor && fix.t <= anchor.t) continue;
    if (anchor && distanceM(anchor, fix) < config.minMoveM) continue;
    recorded.push(fix);
    anchor = fix;
  }
  return { recorded, last: anchor };
}
