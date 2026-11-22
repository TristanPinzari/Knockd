import type { SuggestOption } from "@knockd/shared";
import { suggestForSession } from "@/routes";
import type { SuggestHouseInfo } from "@/routes/suggestForSession";
import { brushHouses, clockLabel, durationLabel, optionToRoutePlan, suggestGeo, swapMembers } from "../suggestView";

const ORIGIN = { lat: 42.955, lng: -81.3425 };
const K = 111_320;
/** [lng, lat] x metres east, y metres north of the origin. */
const m = (x: number, y: number): [number, number] => [
  ORIGIN.lng + x / (K * Math.cos((ORIGIN.lat * Math.PI) / 180)),
  ORIGIN.lat + y / K,
];
const at = (x: number, y: number) => ({ lng: m(x, y)[0], lat: m(x, y)[1] });

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

// A 300 m street along y = 0 with houses on both sides every 25 m.
const streets = { "1": { streetId: "1", line: { coordinates: [m(0, 0), m(300, 0)] } } };
const houses: Record<string, SuggestHouseInfo> = Object.fromEntries(
  Array.from({ length: 24 }, (_, i) => {
    const side = i % 2 === 0 ? 20 : -20;
    const h = {
      houseId: String(100 + i),
      blockId: side > 0 ? "7" : "8",
      streetId: "1",
      centre: m(10 + Math.floor(i / 2) * 25, side),
    };
    return [h.houseId, h];
  }),
);

describe("brushHouses", () => {
  test("adds the houses under the brush, and removes them in unselect mode", () => {
    const path = [at(0, 20), at(60, 20)]; // along the north side, first ~3 houses
    const picked = brushHouses(new Set(), houses, path, 8, "add");
    expect([...picked].sort()).toEqual(["100", "102", "104"]);
    const fewer = brushHouses(picked, houses, [at(35, 20)], 8, "remove");
    expect([...fewer].sort()).toEqual(["100", "104"]);
  });

  test("a wider brush reaches across the street", () => {
    expect(brushHouses(new Set(), houses, [at(10, 0)], 21, "add").size).toBe(2);
  });
});

describe("Suggest on a brushed selection", () => {
  const selected = brushHouses(new Set(), houses, [at(0, 0), at(300, 0)], 25, "add");
  const result = suggestForSession({
    houses,
    streets,
    plannedArea: null,
    selectedHouseIds: selected,
    memberIds: [A, B],
    start: at(0, 0),
    regroup: at(0, 0),
  })!;

  test("every selected house is in the best option, once", () => {
    const doors = result.options[0]!.groups.flatMap((g) => g.knocks.map((k) => String(k.houseId)));
    expect(doors.sort()).toEqual([...selected].sort());
  });

  test("an option previews as route groups with each person's doors in order", () => {
    const option = result.options[0]!;
    const plan = optionToRoutePlan(option, result.start);
    expect(plan.groups).toHaveLength(option.groups.length);
    expect(plan.groups.flatMap((g) => g.knocks).every((k) => k.alongM === Infinity)).toBe(true);
  });

  test("walks to the meeting point and the car show on the map", () => {
    const geo = suggestGeo(result.options[0]!, { [A]: "#E4572E", [B]: "#2E86AB" }, result.start, result.regroup);
    expect(geo.markers.features.map((f) => f.properties.kind)).toEqual(["car", "meet"]);
  });
});

describe("swapMembers", () => {
  const option: SuggestOption = {
    mode: "solo",
    label: "Solo",
    finishS: 600,
    togetherS: 700,
    meetPoint: at(0, 0),
    buddies: [[A, B]],
    groups: [
      {
        memberIds: [A],
        houseIds: [1],
        knocks: [{ houseId: 1, memberId: A }],
        blockIds: [7],
        streetIds: [1],
        doors: 1,
        route: [],
        walkM: 0,
        finishS: 600,
        end: at(0, 0),
        toMeet: [],
        helpAfter: { memberId: B, houseId: 2 },
      },
      {
        memberIds: [B],
        houseIds: [2],
        knocks: [{ houseId: 2, memberId: B }],
        blockIds: [8],
        streetIds: [1],
        doors: 1,
        route: [],
        walkM: 0,
        finishS: 600,
        end: at(0, 0),
        toMeet: [],
      },
    ],
  };

  test("swaps two people's groups, doors, who they help and their buddies", () => {
    const s = swapMembers(option, A, B);
    expect(s.groups.map((g) => g.memberIds)).toEqual([[B], [A]]);
    expect(s.groups[0]!.knocks[0]!.memberId).toBe(B);
    expect(s.groups[0]!.helpAfter!.memberId).toBe(A);
    expect(s.buddies).toEqual([[B, A]]);
  });

  test("swapping with someone not in the plan just moves them in", () => {
    expect(swapMembers(option, A, C).groups[0]!.memberIds).toEqual([C]);
  });
});

describe("labels", () => {
  test("clock time rounds to 5 minutes, 12-hour", () => {
    const fivePm = new Date(2026, 10, 22, 17, 0).getTime();
    expect(clockLabel(fivePm, 35 * 60 + 40)).toBe("5:35 pm");
    expect(clockLabel(fivePm, 7 * 3600)).toBe("12:00 am");
  });

  test("durations", () => {
    expect(durationLabel(30)).toBe("1 min");
    expect(durationLabel(35 * 60)).toBe("35 min");
    expect(durationLabel(65 * 60)).toBe("1 h 5 min");
    expect(durationLabel(120 * 60)).toBe("2 h");
  });
});
