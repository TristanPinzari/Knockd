import { cameraClamp, clampPoint, fitBounds, padBounds } from "../geo/bounds";
import { buildHouseLayers, houseIdOf, roundedSquare } from "../geo/houses";
import { leadsToGeoJSON } from "../geo/leads";
import { outskirtsPolygon } from "../geo/outskirts";
import { styleTrails } from "../geo/trails";
import type { MapMember, TrailCollection } from "../types";
import { BYRON, square } from "../testing/fixtures";

describe("outskirtsPolygon", () => {
  it("is the world rectangle with the work area as a hole", () => {
    const wa = square(-81.36, 42.94, 0.04);
    const f = outskirtsPolygon(wa);
    expect(f.geometry.coordinates).toHaveLength(2);
    expect(f.geometry.coordinates[0]![0]).toEqual([-180, -85]);
    expect(f.geometry.coordinates[1]).toEqual(wa.coordinates[0]);
  });
});

describe("houses", () => {
  it("reads the house id from houseId, id or feature id", () => {
    const f = (props: object, id?: number) => ({
      type: "Feature" as const,
      id,
      properties: props,
      geometry: { type: "Point" as const, coordinates: [0, 0] },
    });
    expect(houseIdOf(f({ houseId: 7 }))).toBe("7");
    expect(houseIdOf(f({ id: "a" }))).toBe("a");
    expect(houseIdOf(f({}, 9))).toBe("9");
    expect(houseIdOf(f({}))).toBeNull();
  });
  it("builds a small closed rounded square around the centre", () => {
    const sq = roundedSquare(BYRON);
    const ring = sq.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const lngs = ring.map((p) => p[0]!);
    const widthM = (Math.max(...lngs) - Math.min(...lngs)) * 111_320 * Math.cos((BYRON[1] * Math.PI) / 180);
    expect(widthM).toBeGreaterThan(6.5);
    expect(widthM).toBeLessThan(7.5);
    expect(ring.length).toBeGreaterThan(8); // rounded, not a plain 5-point box
  });
  it("turns points and polygons into squares and hit centres, skipping bad features", () => {
    const d = buildHouseLayers({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { houseId: 1 }, geometry: { type: "Point", coordinates: BYRON } },
        { type: "Feature", properties: { houseId: 2 }, geometry: square(-81.34, 42.95, 0.0002) },
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: BYRON } },
      ],
    });
    expect(d.squares.features.map((f) => f.properties.houseId)).toEqual(["1", "2"]);
    expect(d.centres.features).toHaveLength(2);
    expect(buildHouseLayers(undefined).squares.features).toEqual([]);
  });
});

describe("trails", () => {
  const members: MapMember[] = [
    { memberId: "me", name: "Me", colour: "#1F6FD6", initials: "ME", lng: 0, lat: 0, isMe: true },
    { memberId: "sam", name: "Sam", colour: "#0E8A5B", initials: "SA", lng: 0, lat: 0, isMe: false },
  ];
  const line = (memberId: string, mode: "knocking" | "walking" | "driving") => ({
    type: "Feature" as const,
    properties: { memberId, mode },
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [0, 0],
        [1, 1],
      ],
    },
  });
  const trails: TrailCollection = {
    type: "FeatureCollection",
    features: [line("me", "knocking"), line("sam", "walking"), line("ghost", "driving")],
  };

  it("ghosts teammates (grey) unless showCrewPaths", () => {
    const f = styleTrails(trails, members, false).features;
    expect(f[0]!.properties).toMatchObject({ ghost: false, colour: "#1F6FD6" });
    expect(f[1]!.properties).toMatchObject({ ghost: true, colour: "#B9C0C8" });
  });
  it("uses crew colours when showCrewPaths", () => {
    const f = styleTrails(trails, members, true).features;
    expect(f[1]!.properties).toMatchObject({ ghost: false, colour: "#0E8A5B" });
    expect(f[2]!.properties.colour).toBe("#B9C0C8"); // unknown member
  });
});

describe("bounds and leads", () => {
  const wa = square(-81.36, 42.94, 0.04);
  it("pads the clamp beyond the work area and fits tighter than the clamp", () => {
    const c = cameraClamp(wa)!;
    const f = fitBounds(wa)!;
    expect(c.sw[0]).toBeLessThan(-81.36);
    expect(c.ne[1]).toBeGreaterThan(42.98);
    expect(f.sw[0]).toBeGreaterThan(c.sw[0]);
    expect(cameraClamp(undefined)).toBeUndefined();
    expect(fitBounds(undefined)).toBeUndefined();
  });
  it("clamps points and pads by ratio", () => {
    const b = padBounds({ sw: [0, 0], ne: [10, 10] }, 0.1);
    expect(b).toEqual({ sw: [-1, -1], ne: [11, 11] });
    expect(clampPoint([20, -5], b)).toEqual([11, -1]);
  });
  it("maps leads to points", () => {
    const d = leadsToGeoJSON([{ id: "l1", lng: 1, lat: 2, grade: "A" }]);
    expect(d.features[0]!.geometry.coordinates).toEqual([1, 2]);
    expect(d.features[0]!.properties).toEqual({ id: "l1", grade: "A", past: false });
  });
});

describe("performance", () => {
  it("builds 150 houses in well under 100ms", () => {
    const houses = {
      type: "FeatureCollection" as const,
      features: Array.from({ length: 150 }, (_, i) => ({
        type: "Feature" as const,
        properties: { houseId: i },
        geometry: { type: "Point" as const, coordinates: [BYRON[0] + i * 1e-4, BYRON[1]] },
      })),
    };
    const t = Date.now();
    buildHouseLayers(houses);
    expect(Date.now() - t).toBeLessThan(100);
  });
});
