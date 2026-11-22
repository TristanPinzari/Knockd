import { describe, expect, test } from "vitest";
import type { Position } from "geojson";
import { buildStreetIndex, cleanLine, cleanTrails, PIN_SNAP_M, snapToStreet } from "../cleanTrails";

// A local grid in metres around Byron: x metres east, y metres north.
const O = { lat: 42.955, lng: -81.3425 };
const M = 111_320;
const K = Math.cos((O.lat * Math.PI) / 180);
const at = (x: number, y: number): Position => [O.lng + x / (M * K), O.lat + y / M];
const toXY = ([lng, lat]: Position): [number, number] => [(lng! - O.lng) * M * K, (lat! - O.lat) * M];

// An east-west street along y = 0, and a north-south one along x = 200.
const streets = {
  "1": { streetId: "1", line: { type: "LineString" as const, coordinates: [at(0, 0), at(200, 0)] } },
  "2": { streetId: "2", line: { type: "LineString" as const, coordinates: [at(200, 0), at(200, 200)] } },
};
const index = buildStreetIndex(streets);

describe("cleanLine", () => {
  test("snaps a wobbly walk along a street onto the street, as one straight line", () => {
    const wobbly = [at(10, 4), at(30, -5), at(50, 6), at(70, -3), at(90, 5), at(110, -4)];
    const clean = cleanLine(wobbly, index);
    expect(clean).toHaveLength(2);
    for (const p of clean) expect(Math.abs(toXY(p)[1])).toBeLessThan(0.01);
    expect(toXY(clean[0]!)[0]).toBeCloseTo(10, 0);
    expect(toXY(clean[1]!)[0]).toBeCloseTo(110, 0);
  });

  test("keeps the corner when the walk turns onto another street", () => {
    const walk = [at(150, 3), at(180, -4), at(197, 2), at(203, 20), at(196, 60), at(204, 100)];
    const clean = cleanLine(walk, index).map(toXY);
    expect(clean[0]![1]).toBeCloseTo(0, 1);
    expect(clean[clean.length - 1]![0]).toBeCloseTo(200, 1);
    expect(clean.length).toBeLessThanOrEqual(4);
  });

  test("leaves points far from any street where they are, just smoothed", () => {
    const offRoad = [at(50, 100), at(60, 101), at(70, 99), at(80, 100)];
    const clean = cleanLine(offRoad, index).map(toXY);
    expect(clean[0]![1]).toBeCloseTo(100, 0);
    expect(clean.length).toBeLessThan(offRoad.length);
  });

  test("keeps lines too short to clean", () => {
    expect(cleanLine([at(5, 3)], index)).toHaveLength(1);
  });
});

describe("cleanTrails", () => {
  test("cleans every trail and keeps each one's member and mode", () => {
    const trails = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: { memberId: "a", mode: "knocking" as const },
          geometry: { type: "LineString" as const, coordinates: [at(10, 4), at(40, -4), at(80, 5)] },
        },
      ],
    };
    const out = cleanTrails(trails, index);
    expect(out.features[0]!.properties).toEqual({ memberId: "a", mode: "knocking" });
    expect(out.features[0]!.geometry.coordinates).toHaveLength(2);
  });

  test("returns the trails untouched when no streets are loaded", () => {
    const trails = { type: "FeatureCollection" as const, features: [] };
    expect(cleanTrails(trails, buildStreetIndex({}))).toBe(trails);
  });
});

describe("snapToStreet", () => {
  test("moves someone standing back from the road onto the nearest street", () => {
    const [x, y] = toXY(snapToStreet(at(60, 45), index));
    expect(x).toBeCloseTo(60, 0);
    expect(y).toBeCloseTo(0, 1);
  });

  test("picks the closer of two streets", () => {
    const [x, y] = toXY(snapToStreet(at(170, 50), index));
    expect(x).toBeCloseTo(200, 1);
    expect(y).toBeCloseTo(50, 0);
  });

  test("leaves people far from every street where they are", () => {
    const far = at(60, PIN_SNAP_M + 30);
    expect(snapToStreet(far, index)).toEqual(far);
  });
});
