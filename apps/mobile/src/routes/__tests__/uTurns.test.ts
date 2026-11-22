import { uTurnPoints } from "../uTurns";

const ORIGIN = { lat: 42.955, lng: -81.3425 };
const K = 111_320;
/** x metres east, y metres north of the origin. */
const m = (x: number, y: number) => ({
  lat: ORIGIN.lat + y / K,
  lng: ORIGIN.lng + x / (K * Math.cos((ORIGIN.lat * Math.PI) / 180)),
});

describe("uTurnPoints", () => {
  test("marks the end of a dead end walked out and back", () => {
    const route = [m(0, 0), m(0, 50), m(0, 100), m(0, 50), m(0, 0)];
    const turns = uTurnPoints(route);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toEqual(m(0, 100));
  });

  test("ignores ordinary corners and straight lines", () => {
    expect(uTurnPoints([m(0, 0), m(0, 100), m(100, 100), m(100, 200)])).toEqual([]);
    expect(uTurnPoints([m(0, 0), m(0, 50), m(0, 100)])).toEqual([]);
  });

  test("one side of a street, then back up the other, then a second dead end", () => {
    const route = [m(0, 0), m(0, 120), m(0, 0), m(60, 0), m(60, 80), m(60, 0)];
    // Back at the corner it turns east (90°), which is a corner, not a U-turn.
    expect(uTurnPoints(route)).toEqual([m(0, 120), m(60, 80)]);
  });

  test("a wiggle shorter than a few metres isn't a U-turn", () => {
    expect(uTurnPoints([m(0, 0), m(0, 50), m(0, 48), m(0, 100)])).toEqual([]);
  });
});
