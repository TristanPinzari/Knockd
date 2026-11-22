import type { TrailPoint } from "@knockd/shared";

/** Compact tuple from GET /trails: [tMs, lat, lng]. */
export type TrailTuple = readonly [number, number, number];

export function tupleToPoint([t, lat, lng]: TrailTuple): TrailPoint {
  return { t, lat, lng };
}

/**
 * Merges new points into a time-sorted trail. Points with a timestamp already present are ignored
 * (the socket and the catch-up fetch overlap after a reconnect). Returns the SAME array when nothing
 * was added, so callers can skip recomputing.
 */
export function mergePoints(existing: readonly TrailPoint[], incoming: readonly TrailPoint[]): readonly TrailPoint[] {
  if (incoming.length === 0) return existing;
  const sortedIncoming = [...incoming].sort((a, b) => a.t - b.t);
  const lastT = existing.length > 0 ? existing[existing.length - 1]!.t : -Infinity;

  if (sortedIncoming[0]!.t > lastT) return dedupeSorted([...existing, ...sortedIncoming], existing.length);

  const seen = new Set(existing.map((p) => p.t));
  const fresh = sortedIncoming.filter((p) => !seen.has(p.t));
  if (fresh.length === 0) return existing;
  return dedupeSorted(
    [...existing, ...fresh].sort((a, b) => a.t - b.t),
    0,
  );
}

/** Drops consecutive duplicates by t, keeping the first; returns input untouched if there are none. */
function dedupeSorted(points: readonly TrailPoint[], from: number): readonly TrailPoint[] {
  const out: TrailPoint[] = [];
  points.forEach((p, i) => {
    const prev = out[out.length - 1];
    if (i >= from && prev && prev.t === p.t) return;
    out.push(p);
  });
  return out;
}
