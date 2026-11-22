import type { Polygon } from "geojson";
import { inArea, suggestForSession, type SuggestHouseInfo } from "../suggestForSession";

const ORIGIN = { lat: 42.955, lng: -81.3425 };
const K = 111_320;
/** [lng, lat] metres east (x) / north (y) of the origin. */
const m = (x: number, y: number): [number, number] => [
  ORIGIN.lng + x / (K * Math.cos((ORIGIN.lat * Math.PI) / 180)),
  ORIGIN.lat + y / K,
];
const A = "00000000-0000-4000-8000-00000000000a";

// One 200 m street along y = 0 with houses 20 m north of it every 25 m.
const streets = { "1": { streetId: "1", line: { coordinates: [m(0, 0), m(200, 0)] } } };
const houses: Record<string, SuggestHouseInfo> = Object.fromEntries(
  Array.from({ length: 8 }, (_, i) => {
    const h = { houseId: String(100 + i), blockId: "7", streetId: "1", centre: m(10 + i * 25, 20) };
    return [h.houseId, h];
  }),
);
const square = (x0: number, x1: number): Polygon => ({
  type: "Polygon",
  coordinates: [[m(x0, -50), m(x1, -50), m(x1, 50), m(x0, 50), m(x0, -50)]],
});

describe("inArea", () => {
  test("is true inside the polygon and false outside or in a hole", () => {
    const withHole: Polygon = {
      type: "Polygon",
      coordinates: [square(0, 100).coordinates[0]!, square(40, 60).coordinates[0]!],
    };
    expect(inArea(withHole, m(20, 0))).toBe(true);
    expect(inArea(withHole, m(50, 0))).toBe(false);
    expect(inArea(withHole, m(150, 0))).toBe(false);
  });
});

describe("suggestForSession", () => {
  test("plans routes for the crew over the houses in the planned area", () => {
    const result = suggestForSession({
      houses,
      streets,
      plannedArea: square(0, 100),
      memberIds: [A],
      start: { lng: m(0, 0)[0], lat: m(0, 0)[1] },
    });
    const best = result!.options[0]!;
    const doors = best.groups.flatMap((g) => g.knocks.map((k) => String(k.houseId)));
    expect(doors.sort()).toEqual(["100", "101", "102", "103"]);
    expect(best.groups[0]!.route.length).toBeGreaterThanOrEqual(2);
  });

  test("returns null with no crew or no houses in the area", () => {
    const start = { lng: m(0, 0)[0], lat: m(0, 0)[1] };
    expect(suggestForSession({ houses, streets, plannedArea: square(500, 600), memberIds: [A], start })).toBeNull();
    expect(suggestForSession({ houses, streets, plannedArea: null, memberIds: [], start })).toBeNull();
  });
});
