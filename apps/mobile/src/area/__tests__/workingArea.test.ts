import { distanceM } from "@knockd/shared";
import { useAreaStore } from "../areaStore";
import { AREA_PADDING_M, circlePolygon, growRadiusM, MIN_AREA_RADIUS_M, startingArea } from "../workingArea";

const centre = { lat: 42.955, lng: -81.3425 };
/** A point `m` metres north of the centre. */
const north = (m: number) => ({ lat: centre.lat + m / 111_320, lng: centre.lng });

describe("startingArea", () => {
  test("is a minimum-radius circle around where the host is standing", () => {
    expect(startingArea(centre)).toEqual({
      location: centre,
      area: { kind: "circle", center: centre, radiusM: MIN_AREA_RADIUS_M },
    });
  });
});

describe("growRadiusM", () => {
  test("stays at the current radius while everyone is inside the padding", () => {
    const inside = north(MIN_AREA_RADIUS_M - AREA_PADDING_M - 10);
    expect(growRadiusM(centre, MIN_AREA_RADIUS_M, [inside])).toBe(MIN_AREA_RADIUS_M);
  });

  test("grows so someone pushing into the padding keeps a full padding ahead of them", () => {
    const pushing = north(MIN_AREA_RADIUS_M - 20);
    const grown = growRadiusM(centre, MIN_AREA_RADIUS_M, [pushing]);
    expect(grown).toBeCloseTo(distanceM(centre, pushing) + AREA_PADDING_M, 0);
  });

  test("never shrinks when people walk back towards the centre", () => {
    expect(growRadiusM(centre, 1200, [centre])).toBe(1200);
  });

  test("uses the furthest person", () => {
    const near = north(300);
    const far = north(900);
    expect(growRadiusM(centre, MIN_AREA_RADIUS_M, [near, far])).toBeCloseTo(distanceM(centre, far) + AREA_PADDING_M, 0);
  });

  test("never goes below the minimum", () => {
    expect(growRadiusM(centre, 0, [])).toBe(MIN_AREA_RADIUS_M);
  });
});

describe("circlePolygon", () => {
  test("is a closed ring whose points sit at the radius", () => {
    const ring = circlePolygon(centre, 500).coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lng, lat] of ring) expect(distanceM(centre, { lat: lat!, lng: lng! })).toBeCloseTo(500, -1);
  });
});

describe("useAreaStore.growArea", () => {
  beforeEach(() => useAreaStore.getState().reset());

  test("waits for the session centre before growing", () => {
    useAreaStore.getState().start("s1");
    useAreaStore.getState().growArea("s1", [north(2000)]);
    expect(useAreaStore.getState().areaRadiusM).toBe(MIN_AREA_RADIUS_M);
  });

  test("grows around the session centre and ignores other sessions", () => {
    const store = useAreaStore.getState();
    store.start("s1");
    store.setPlannedArea("s1", circlePolygon(centre, MIN_AREA_RADIUS_M));
    store.growArea("other", [north(2000)]);
    expect(useAreaStore.getState().areaRadiusM).toBe(MIN_AREA_RADIUS_M);
    store.growArea("s1", [north(1000)]);
    expect(useAreaStore.getState().areaRadiusM).toBeCloseTo(1000 + AREA_PADDING_M, -1);
  });
});
