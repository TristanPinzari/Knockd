import type { Feature, LineString, Polygon } from "geojson";
import type { SessionLayersRes } from "@knockd/shared";
import { EMPTY_AREA, mergeTeamLayers } from "@/area/areaModel";
import { buildTeamLayersGeo, pathOpacity, rateColours } from "../geo/teamLayers";

const NOW = Date.parse("2026-11-22T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const path = (sessionId: string, streetId: number, props: Record<string, unknown> = {}): Feature<LineString> => ({
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: [
      [-81.34, 42.95],
      [-81.33, 42.95],
    ],
  },
  properties: {
    sessionId,
    memberName: "Sam",
    streetId,
    classification: "worked",
    durationS: 1800,
    workedAt: daysAgo(1),
    ...props,
  },
});
const square: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

describe("mergeTeamLayers", () => {
  it("keeps a street that came in two cells once, and adds lead rates, highlights and notes", () => {
    const layers = {
      coverage: { type: "FeatureCollection", features: [path("s1", 7), path("s1", 7), path("s1", 8)] },
      leadRate: [{ blockId: 3, rate: 0.05, housesWorked: 20 }],
      highlights: [
        {
          id: "h1",
          teamId: "t",
          geometry: square,
          colour: "#22C55E",
          createdBy: { id: "u", displayName: "T" },
          createdAt: daysAgo(2),
        },
      ],
      notes: [
        {
          id: "n1",
          teamId: "t",
          lat: 42.95,
          lng: -81.34,
          text: "New owners",
          createdBy: { id: "u", displayName: "T" },
          createdAt: daysAgo(2),
        },
      ],
    } as unknown as SessionLayersRes;
    const team = mergeTeamLayers(mergeTeamLayers(EMPTY_AREA, layers), layers).team;
    expect(Object.keys(team.coverage)).toHaveLength(2);
    expect(team.leadRate["3"]).toEqual({ rate: 0.05, housesWorked: 20 });
    expect(Object.keys(team.highlights)).toEqual(["h1"]);
    expect(Object.keys(team.notes)).toEqual(["n1"]);
  });
});

describe("buildTeamLayersGeo", () => {
  const team = mergeTeamLayers(EMPTY_AREA, {
    coverage: { type: "FeatureCollection", features: [path("s1", 7)] },
    leadRate: [{ blockId: 3, rate: 0.05, housesWorked: 20 }],
  } as unknown as SessionLayersRes).team;

  it("draws only the layers that are switched on", () => {
    const geo = buildTeamLayersGeo(team, { "3": { polygon: square } }, new Set(["coverage"]), NOW);
    expect(geo.coverage.features).toHaveLength(1);
    expect(geo.leadRate.features).toHaveLength(0);
    const both = buildTeamLayersGeo(team, { "3": { polygon: square } }, new Set(["coverage", "leadRate"]), NOW);
    expect(both.leadRate.features).toHaveLength(1);
  });
});

describe("pathOpacity", () => {
  it("fades with age and is faint for a quick pass", () => {
    const fresh = pathOpacity({ classification: "worked", durationS: 1800, workedAt: daysAgo(1) }, NOW);
    const old = pathOpacity({ classification: "worked", durationS: 1800, workedAt: daysAgo(100) }, NOW);
    const driveBy = pathOpacity({ classification: "passed", durationS: 30, workedAt: daysAgo(1) }, NOW);
    expect(fresh).toBeGreaterThan(old);
    expect(old).toBeGreaterThan(0);
    expect(driveBy).toBeLessThan(0.1);
  });
});

describe("rateColours", () => {
  it("weakest red, best green, unknown grey", () => {
    const colour = rateColours([0.01, 0.02, 0.03, 0.04, 0.05, null]);
    expect(colour(0.01)).toBe("#ef4444");
    expect(colour(0.05)).toBe("#22c55e");
    expect(colour(null)).toBe("#9AA3AD");
  });
});
