/**
 * Live trails: classify each stretch of a teammate's GPS trail as knocking, walking or driving,
 * so the map can draw them differently (e.g. thick = knocking, thin = walking, faint = driving).
 *
 * Speed is averaged over a short window around each stretch, because door-to-door is stop-start:
 * a few seconds of walking between doors shouldn't flicker between styles. The walking/driving
 * limit matches end-of-session processing on the server, so live trails and results agree.
 */
import type { FeatureCollection, LineString } from "geojson";

export type TrailMode = "knocking" | "walking" | "driving";

/** A GPS point: t in milliseconds since the epoch. */
export interface TrailPoint {
  t: number;
  lat: number;
  lng: number;
}

export const TRAIL_SPEEDS = {
  /** Averaging slower than this (m/s) = knocking door to door (~3 km/h). */
  knockingMaxMs: 0.9,
  /** Faster than this (m/s) = driving (9 km/h). Same limit as session processing. */
  walkingMaxMs: 2.5,
  /** Speed is averaged over this many seconds around each stretch. */
  windowS: 60,
  /** A gap longer than this breaks the trail (phone asleep, no signal). */
  maxGapS: 120,
} as const;

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

/**
 * The mode of each stretch between consecutive points (length = points.length - 1).
 * `null` marks a gap that shouldn't be drawn. Points must be sorted by time.
 */
export function classifyTrail(points: TrailPoint[], speeds = TRAIL_SPEEDS): (TrailMode | null)[] {
  const half = (speeds.windowS * 1000) / 2;
  const modes: (TrailMode | null)[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (b.t - a.t > speeds.maxGapS * 1000) {
      modes.push(null);
      continue;
    }
    // Average speed over the stretches within ±window/2 of this one, stopping at gaps.
    const mid = (a.t + b.t) / 2;
    let start = i;
    while (
      start > 0 &&
      points[start]!.t > mid - half &&
      points[start]!.t - points[start - 1]!.t <= speeds.maxGapS * 1000
    )
      start--;
    let end = i + 1;
    while (
      end < points.length - 1 &&
      points[end]!.t < mid + half &&
      points[end + 1]!.t - points[end]!.t <= speeds.maxGapS * 1000
    )
      end++;
    let dist = 0;
    for (let j = start; j < end; j++) dist += distanceM(points[j]!, points[j + 1]!);
    const seconds = (points[end]!.t - points[start]!.t) / 1000;
    const speed = seconds > 0 ? dist / seconds : 0;
    modes.push(speed > speeds.walkingMaxMs ? "driving" : speed > speeds.knockingMaxMs ? "walking" : "knocking");
  }
  return modes;
}

/**
 * The trail as GeoJSON for MapLibre: one LineString per run of the same mode, with
 * properties { memberId, mode }. Style it with a `match` on `mode`.
 */
export function trailToGeoJSON(
  memberId: string,
  points: TrailPoint[],
  speeds = TRAIL_SPEEDS,
): FeatureCollection<LineString> {
  const modes = classifyTrail(points, speeds);
  const features: FeatureCollection<LineString>["features"] = [];
  let run: { mode: TrailMode; coords: [number, number][] } | null = null;
  modes.forEach((mode, i) => {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (mode === null) {
      run = null;
      return;
    }
    if (!run || run.mode !== mode) {
      run = { mode, coords: [[a.lng, a.lat]] };
      features.push({
        type: "Feature",
        properties: { memberId, mode },
        geometry: { type: "LineString", coordinates: run.coords },
      });
    }
    run.coords.push([b.lng, b.lat]);
  });
  return { type: "FeatureCollection", features };
}
