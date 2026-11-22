import { cellIdFor, cellsAround } from "@knockd/shared";
import { cellsToLoad, plannedAreaCentre, pointsOfInterest, RETRY_FAILED_CELL_MS, wantedCells } from "../cellPlanner";
import { rect } from "../testing/fixtures";

const BYRON = { lat: 42.955, lng: -81.3425 };
const empty = { loaded: {}, inFlight: new Set<string>(), failedAt: {} };

describe("wantedCells", () => {
  it("covers the cell of every point and dedupes overlaps", () => {
    const cells = wantedCells([BYRON, { lat: 42.9551, lng: -81.3426 }]);
    expect(cells).toContain(cellIdFor(BYRON));
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells).toEqual(cellsAround(BYRON));
  });
});

describe("cellsToLoad", () => {
  it("never requests loaded or in-flight cells", () => {
    const all = wantedCells([BYRON]);
    const [loaded, flying, ...rest] = all;
    const result = cellsToLoad([BYRON], { loaded: { [loaded!]: true }, inFlight: new Set([flying!]), failedAt: {} }, 0);
    expect(result).toEqual(rest);
  });

  it("returns nothing when everything near the crew is loaded", () => {
    const loaded = Object.fromEntries(wantedCells([BYRON]).map((c) => [c, true as const]));
    expect(cellsToLoad([BYRON], { ...empty, loaded }, 0)).toEqual([]);
  });

  it("loads a new cell when someone walks within 500 m of it", () => {
    const loaded = Object.fromEntries(wantedCells([BYRON]).map((c) => [c, true as const]));
    const walker = { lat: BYRON.lat, lng: BYRON.lng + 0.02 };
    const next = cellsToLoad([BYRON, walker], { ...empty, loaded }, 0);
    expect(next).toContain(cellIdFor(walker));
    expect(next.every((c) => !loaded[c])).toBe(true);
  });

  it("waits before retrying a failed cell", () => {
    const [failed] = wantedCells([BYRON]);
    const state = { ...empty, failedAt: { [failed!]: 1_000 } };
    expect(cellsToLoad([BYRON], state, 1_000 + RETRY_FAILED_CELL_MS - 1)).not.toContain(failed);
    expect(cellsToLoad([BYRON], state, 1_000 + RETRY_FAILED_CELL_MS)).toContain(failed);
  });
});

describe("pointsOfInterest", () => {
  it("puts the planned area centre first and drops members without a position", () => {
    const area = { type: "Polygon" as const, coordinates: [rect(-81.35, 42.95, -81.33, 42.96)] };
    const points = pointsOfInterest(area, [null, { lat: 1, lng: 2 }]);
    expect(points[0]?.lat).toBeCloseTo(42.955);
    expect(points[0]?.lng).toBeCloseTo(-81.34);
    expect(points).toHaveLength(2);
  });

  it("handles multipolygons and no planned area", () => {
    const multi = {
      type: "MultiPolygon" as const,
      coordinates: [
        [rect(0, 0, 1, 1)],
        [
          [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 2],
          ],
        ],
      ],
    };
    expect(plannedAreaCentre(multi)).toEqual({ lat: 1.5, lng: 1.5 });
    expect(pointsOfInterest(null, [])).toEqual([]);
  });
});
