import type { TrailCollection } from "@/map/types";
import { EMPTY_AREA, mergeAreaCells } from "@/area/areaModel";
import { blockFeature, cell, houseFeature, lead, MEMBER_A, plan, rect } from "@/area/testing/fixtures";
import { DEMO_CENTRE } from "@/mock/crew";
import { buildDemoMapData, DEMO_MAP_DATA, demoProgressAt } from "../liveMap/demoMapData";
import { buildSessionMapData, sessionCentre, toMapMembers } from "../liveMap/liveMapData";
import type { LiveCrewMember } from "../liveMap/types";

const noTrails: TrailCollection = { type: "FeatureCollection", features: [] };

const member = (id: string, position: LiveCrewMember["position"], speedKmh: number | null = null): LiveCrewMember => ({
  id,
  name: `Member ${id}`,
  colour: "#1F6FD6",
  initials: "MM",
  position,
  speedKmh,
});

describe("DEMO_MAP_DATA", () => {
  it("has one member marked as me and a route for each of the four crew, partly walked", () => {
    expect(DEMO_MAP_DATA.members.filter((m) => m.isMe)).toHaveLength(1);
    expect(DEMO_MAP_DATA.routes.groups).toHaveLength(4);
    for (const g of DEMO_MAP_DATA.routes.groups) {
      expect(g.progressM).toBeGreaterThan(0);
      expect(g.progressM).toBeLessThan(g.line.lengthM);
      expect(DEMO_MAP_DATA.colours[g.group.memberIds[0]!]).toBeDefined();
    }
  });

  it("numbers every planned door on a drawn house, with some knocked and some not", () => {
    const ids = new Set(DEMO_MAP_DATA.houses.features.map((f) => f.properties.houseId));
    const marks = Object.entries(DEMO_MAP_DATA.routes.houses);
    expect(marks.length).toBeGreaterThan(40);
    for (const [houseId] of marks) expect(ids.has(houseId)).toBe(true);
    expect(marks.some(([, m]) => m.knocked)).toBe(true);
    expect(marks.some(([, m]) => !m.knocked)).toBe(true);
    expect(DEMO_MAP_DATA.leads.length).toBeGreaterThan(0);
  });

  it("starts the animated demo fresh at the car and ends with every door knocked", () => {
    const fresh = buildDemoMapData(demoProgressAt(0));
    expect(Object.values(fresh.routes.houses).every((h) => !h.knocked)).toBe(true);
    expect(fresh.routes.groups.every((g) => g.progressM === 0)).toBe(true);
    const done = buildDemoMapData(Object.fromEntries(fresh.crew.map((m) => [m.memberId, 1])));
    expect(Object.values(done.routes.houses).every((h) => h.knocked)).toBe(true);
  });

  it("keeps every demo member inside the work area bounds", () => {
    const ring = DEMO_MAP_DATA.workArea!.coordinates[0]!;
    const lngs = ring.map((p) => p[0]!);
    const lats = ring.map((p) => p[1]!);
    for (const m of DEMO_MAP_DATA.members) {
      expect(m.lng).toBeGreaterThan(Math.min(...lngs));
      expect(m.lng).toBeLessThan(Math.max(...lngs));
      expect(m.lat).toBeGreaterThan(Math.min(...lats));
      expect(m.lat).toBeLessThan(Math.max(...lats));
    }
  });
});

describe("toMapMembers", () => {
  it("maps positioned members, flags me and carries speed", () => {
    const result = toMapMembers(
      {
        a: member("a", { lat: 42.95, lng: -81.34 }, 2.5),
        b: member("b", { lat: 42.951, lng: -81.341 }),
        c: member("c", null),
      },
      "b",
    );
    expect(result.map((m) => m.memberId)).toEqual(["a", "b"]);
    expect(result.find((m) => m.memberId === "b")?.isMe).toBe(true);
    expect(result.find((m) => m.memberId === "a")?.speedKmh).toBe(2.5);
    expect(result.find((m) => m.memberId === "b")?.speedKmh).toBeUndefined();
  });
});

describe("buildSessionMapData", () => {
  const area = mergeAreaCells(EMPTY_AREA, {
    cells: [
      cell("1_1", {
        blocks: [blockFeature(1, 4, rect(0, 0, 1, 1))],
        houses: [houseFeature(9, 1, rect(0.4, 0.4, 0.6, 0.6))],
      }),
    ],
  }).data;
  const base = {
    crew: { [MEMBER_A]: { ...member(MEMBER_A, { lat: 0.5, lng: 0.5 }), colour: "#7C4DDB" } },
    myMemberId: MEMBER_A,
    trails: noTrails,
    trailPoints: {},
    area,
    plannedArea: null,
    plan: plan([[MEMBER_A, 1]]),
    leads: { l1: lead("l1", 9) },
  };

  it("uses only backend data, never demo geometry", () => {
    const data = buildSessionMapData(base);
    expect(data.houses).toBe(area.housesGeoJSON);
    expect(data.colours).toEqual({ [MEMBER_A]: "#7C4DDB" });
    expect(data.routes.groups).toEqual([]); // claims but no route drawing yet
    expect(data.leads).toEqual([expect.objectContaining({ id: "l1", grade: "A" })]);
    expect(data.workArea?.coordinates[0]).toEqual(rect(0, 0, 1, 1));
    expect(data.members).toHaveLength(1);
    expect(data.trails).toBe(noTrails);
  });

  it("is empty but valid before anything has loaded", () => {
    const data = buildSessionMapData({ ...base, area: EMPTY_AREA, plan: null, leads: {}, crew: {} });
    expect(data.workArea).toBeUndefined();
    expect(data.routes.groups).toEqual([]);
    expect(data.houses.features).toEqual([]);
    expect(data.center).toEqual(DEMO_CENTRE);
  });

  it("centres on the planned area first, then the work area", () => {
    const planned = { type: "Polygon" as const, coordinates: [rect(10, 20, 12, 22)] };
    expect(sessionCentre(planned, undefined)).toEqual([11, 21]);
    expect(sessionCentre(null, { type: "Polygon", coordinates: [rect(0, 0, 2, 2)] })).toEqual([1, 1]);
    expect(sessionCentre(null, undefined)).toBeNull();
  });
});
