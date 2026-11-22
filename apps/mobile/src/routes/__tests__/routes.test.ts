import type { LatLng, PlanContent } from "@knockd/shared";
import { buildRouteProgress, doorsFor } from "../progressView";
import { measure, pointAt, project, slice } from "../polyline";
import { routeProgressM } from "../progress";
import { routePlanFromSharedPlan, type PlanHouse } from "../fromSharedPlan";

const ORIGIN = { lat: 42.955, lng: -81.3425 };
/** Metres east (x) / north (y) of the origin. */
const m = (x: number, y: number): LatLng => ({
  lat: ORIGIN.lat + y / 111_320,
  lng: ORIGIN.lng + x / (111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180)),
});
const near = (a: number, b: number, tol = 0.5) => expect(Math.abs(a - b)).toBeLessThan(tol);

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

describe("polyline", () => {
  const line = measure([m(0, 0), m(100, 0), m(100, 50)]);

  test("measures length along the points", () => {
    near(line.lengthM, 150);
  });

  test("projects a point onto the nearest segment with its side", () => {
    const left = project(line, m(40, 10))!;
    near(left.alongM, 40);
    near(left.offM, 10);
    expect(left.side).toBeGreaterThan(0);
    expect(project(line, m(40, -10))!.side).toBeLessThan(0);
  });

  test("limits projection to a window", () => {
    const p = project(line, m(40, 0), 90, 150)!;
    near(p.alongM, 90);
  });

  test("finds the point at a distance and slices between distances", () => {
    const p = pointAt(line, 120);
    near(p.lat, m(100, 20).lat, 1e-6);
    const part = slice(line, 50, 120);
    expect(part).toHaveLength(3);
    near(part[0]!.lng, m(50, 0).lng, 1e-6);
    expect(slice(line, 80, 80)).toEqual([]);
  });
});

describe("routeProgressM", () => {
  const street = measure([m(0, 0), m(200, 0)]);

  test("follows a walker along the route", () => {
    const trail = [m(0, 3), m(30, -4), m(60, 2), m(90, 1)];
    near(routeProgressM(street, trail), 90, 1);
  });

  test("never moves backwards", () => {
    near(routeProgressM(street, [m(80, 0), m(40, 0)]), 80, 1);
  });

  test("ignores points far from the route", () => {
    expect(routeProgressM(street, [m(50, 60), m(120, 60)])).toBe(0);
  });

  test("needs several points in a row before jumping far ahead", () => {
    expect(routeProgressM(street, [m(180, 0)])).toBe(0);
    near(routeProgressM(street, [m(170, 0), m(175, 0), m(180, 0)]), 180, 1);
  });

  test("fills the outbound leg of a U-turn before the way back", () => {
    // Down a 100 m dead end and back: the walker at 60 m on the way out is at 60, not 140.
    const deadEnd = measure([m(0, 0), m(100, 0), m(0, 0)]);
    near(routeProgressM(deadEnd, [m(0, 0), m(30, 0), m(60, 0)]), 60, 1);
    near(routeProgressM(deadEnd, [m(30, 0), m(60, 0), m(95, 0), m(70, 0), m(40, 0)]), 160, 1);
  });
});

describe("routePlanFromSharedPlan", () => {
  const house = (houseId: string, blockId: string, at: LatLng): PlanHouse => ({
    houseId,
    blockId,
    centre: [at.lng, at.lat],
  });
  const houses = Object.fromEntries(
    [
      house("h1", "1", m(20, 20)),
      house("h2", "1", m(60, -20)),
      house("h3", "1", m(100, 20)),
      house("far", "1", m(60, 200)),
      house("other", "9", m(40, 20)),
    ].map((h) => [h.houseId, h]),
  );
  const route = [m(0, 0), m(120, 0)];
  const planWith = (claims: [number, string][]): PlanContent => ({
    claims: claims.map(([blockId, memberId]) => ({ blockId, memberId, authorId: A })),
    drawings: [{ id: C, kind: "route", points: route, memberId: A, colour: null, authorId: A }],
    notes: [],
  });

  test("returns an empty plan without routes", () => {
    expect(routePlanFromSharedPlan(null, houses).groups).toEqual([]);
  });

  test("a solo knocks every claimed house near the route, in walking order", () => {
    const plan = routePlanFromSharedPlan(planWith([[1, A]]), houses);
    expect(plan.start).toEqual(route[0]);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]!.memberIds).toEqual([A]);
    expect(plan.groups[0]!.knocks.map((k) => k.houseId)).toEqual(["h1", "h2", "h3"]);
  });

  test("a pair claiming the same blocks splits the doors by side of the street", () => {
    const plan = routePlanFromSharedPlan(
      planWith([
        [1, A],
        [1, B],
      ]),
      houses,
    );
    expect(plan.groups[0]!.memberIds).toEqual([A, B]);
    const who = Object.fromEntries(plan.groups[0]!.knocks.map((k) => [k.houseId, k.memberId]));
    expect(who).toEqual({ h1: A, h2: B, h3: A });
  });
});

describe("buildRouteProgress", () => {
  const plan = {
    start: m(0, 0),
    groups: [
      {
        memberIds: [A],
        route: [m(0, 0), m(120, 0)],
        knocks: [
          { houseId: "h1", memberId: A, alongM: 20 },
          { houseId: "h2", memberId: A, alongM: 60 },
          { houseId: "h3", memberId: A, alongM: 100 },
        ],
      },
    ],
  };

  test("numbers each person's doors and marks the ones they've passed", () => {
    const view = buildRouteProgress(plan, { [A]: [m(0, 0), m(30, 0), m(65, 0)] });
    near(view.groups[0]!.progressM, 65, 1);
    expect(view.houses).toEqual({
      h1: { memberId: A, n: 1, knocked: true },
      h2: { memberId: A, n: 2, knocked: true },
      h3: { memberId: A, n: 3, knocked: false },
    });
    expect(doorsFor(view, A)).toEqual({ knocked: 2, total: 3 });
  });

  test("with no trail nothing is knocked", () => {
    const view = buildRouteProgress(plan, {});
    expect(view.groups[0]!.progressM).toBe(0);
    expect(doorsFor(view, A)).toEqual({ knocked: 0, total: 3 });
  });
});
