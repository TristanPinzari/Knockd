import { beforeEach, describe, expect, it } from "vitest";
import type { TrailPoint } from "@knockd/shared";
import { mergePoints, tupleToPoint } from "./mergePoints";
import { useTrailsStore } from "./trailsStore";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const LNG_PER_M = 1 / 81_600;
/** Walks east at `speed` m/s, one point every 5 s, starting at t0. */
const walk = (speed: number, n: number, t0 = 0): TrailPoint[] =>
  Array.from({ length: n }, (_, i) => ({ t: t0 + i * 5000, lat: 42.955, lng: -81.3425 + speed * i * 5 * LNG_PER_M }));
const tuples = (pts: TrailPoint[]) => pts.map((p): [number, number, number] => [p.t, p.lat, p.lng]);

describe("mergePoints", () => {
  it("returns the same array when nothing new", () => {
    const base = walk(1, 3);
    expect(mergePoints(base, [])).toBe(base);
    expect(mergePoints(base, [base[1]!])).toBe(base);
  });
  it("appends in order and dedupes overlap with the tail", () => {
    const base = walk(1, 3);
    const merged = mergePoints(base, [...walk(1, 5)].slice(2));
    expect(merged.map((p) => p.t)).toEqual([0, 5000, 10000, 15000, 20000]);
  });
  it("sorts late-arriving older points into place", () => {
    const merged = mergePoints(
      [
        { t: 0, lat: 1, lng: 1 },
        { t: 20, lat: 1, lng: 1 },
      ],
      [
        { t: 10, lat: 2, lng: 2 },
        { t: 0, lat: 9, lng: 9 },
      ],
    );
    expect(merged.map((p) => p.t)).toEqual([0, 10, 20]);
  });
  it("dedupes within an incoming batch and converts tuples", () => {
    expect(
      mergePoints(
        [],
        [
          { t: 1, lat: 0, lng: 0 },
          { t: 1, lat: 0, lng: 0 },
        ],
      ),
    ).toHaveLength(1);
    expect(tupleToPoint([5, 6, 7])).toEqual({ t: 5, lat: 6, lng: 7 });
  });
});

describe("trails store", () => {
  beforeEach(() => useTrailsStore.getState().reset());

  it("loads GET /trails then derives GeoJSON with a mode per stretch", () => {
    useTrailsStore.getState().setFromResponse([{ memberId: A, points: tuples(walk(0.4, 30)) }]);
    const { trailsGeoJSON, lastPointT } = useTrailsStore.getState();
    expect(lastPointT).toBe(29 * 5000);
    expect(trailsGeoJSON.features[0]?.properties).toEqual({ memberId: A, mode: "knocking" });
  });

  it("appends live positions and keeps trailsGeoJSON memoised when nothing changes", () => {
    const s = useTrailsStore.getState();
    const pts = walk(1.4, 10);
    s.setFromResponse([{ memberId: A, points: tuples(pts.slice(0, 5)) }]);
    const before = useTrailsStore.getState().trailsGeoJSON;
    s.appendPositions(pts.slice(0, 5).map((p) => ({ memberId: A, ...p }))); // duplicates only
    expect(useTrailsStore.getState().trailsGeoJSON).toBe(before);
    s.appendPositions(pts.slice(5).map((p) => ({ memberId: A, ...p })));
    const after = useTrailsStore.getState();
    expect(after.trailsGeoJSON).not.toBe(before);
    expect(after.pointsByMember[A]).toHaveLength(10);
    expect(after.trailsGeoJSON.features[0]?.properties?.mode).toBe("walking");
  });

  it("recomputes only the member that changed and merges since-catch-ups", () => {
    const s = useTrailsStore.getState();
    s.setFromResponse([
      { memberId: A, points: tuples(walk(0.4, 10)) },
      { memberId: B, points: tuples(walk(12, 10)) },
    ]);
    const geoB = useTrailsStore.getState().geoByMember[B];
    s.mergeFromResponse([{ memberId: A, points: tuples(walk(0.4, 14).slice(9)) }]);
    const after = useTrailsStore.getState();
    expect(after.geoByMember[B]).toBe(geoB);
    expect(after.pointsByMember[A]).toHaveLength(14);
    expect(after.trailsGeoJSON.features.map((f) => f.properties.memberId)).toEqual([A, B]);
  });

  it("empty data yields an empty collection", () => {
    useTrailsStore.getState().setFromResponse([]);
    expect(useTrailsStore.getState().trailsGeoJSON.features).toEqual([]);
    expect(useTrailsStore.getState().lastPointT).toBeNull();
  });
});
