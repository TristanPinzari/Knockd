import { describe, expect, it } from "vitest";
import { EMPTY_PLAN, type PlanContent } from "./entities";
import { applyPlanEdit } from "./plan";
import { PlanEditOp } from "./socket";
import {
  crewSplits,
  suggestionToPlanOps,
  streetPath,
  suggestRoutes,
  type SuggestHouse,
  type SuggestInput,
  type SuggestStreet,
} from "./suggest";
import { distanceM } from "./trail";

// A street grid with 100 m blocks. Grid point (x, y) is x blocks east and y blocks north of O.
const O = { lat: 42.955, lng: -81.3425 };
const dLat = 100 / 111_320;
const dLng = 100 / (111_320 * Math.cos((O.lat * Math.PI) / 180));
const at = (x: number, y: number) => ({ lat: O.lat + y * dLat, lng: O.lng + x * dLng });
const gridY = (p: { lat: number }) => (p.lat - O.lat) / dLat;

const member = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const crew = (n: number) => Array.from({ length: n }, (_, i) => member(i + 1));
const uuid = (() => {
  let n = 0;
  return () => `00000000-0000-4000-8000-1000000000${String(++n).padStart(2, "0")}`;
})();

/** w × h blocks: every street has 10 houses, 5 on each side (each side is a different block). */
function grid(w: number, h: number) {
  const streets: SuggestStreet[] = [];
  const houses: SuggestHouse[] = [];
  const block = (i: number, j: number) => 1000 + (i + 1) * 100 + (j + 1);
  const add = (x1: number, y1: number, x2: number, y2: number, sides: [number, number]) => {
    const id = streets.length + 1;
    const a = at(x1, y1);
    const b = at(x2, y2);
    streets.push({
      id,
      coordinates: [
        [a.lng, a.lat],
        [b.lng, b.lat],
      ],
    });
    for (let k = 0; k < 10; k++) {
      // Every 20 m along the street, set back 15 m on either side.
      const f = (10 + 20 * (k % 5)) / 100;
      const side = k < 5 ? -0.15 : 0.15;
      const pos = at(x1 + (x2 - x1) * f + (y1 === y2 ? 0 : side), y1 + (y2 - y1) * f + (y1 === y2 ? side : 0));
      houses.push({ id: id * 100 + k, streetId: id, blockId: sides[k < 5 ? 0 : 1], ...pos });
    }
  };
  for (let j = 0; j <= h; j++) for (let i = 0; i < w; i++) add(i, j, i + 1, j, [block(i, j - 1), block(i, j)]);
  for (let i = 0; i <= w; i++) for (let j = 0; j < h; j++) add(i, j, i, j + 1, [block(i - 1, j), block(i, j)]);
  return { streets, houses };
}

const suggest = (input: Omit<SuggestInput, "random">) => suggestRoutes({ ...input, random: () => 0.5 });

describe("suggestRoutes", () => {
  it("car at the bottom of a 2×2 square: pairs start knocking right away and finish together at the top", () => {
    // Houses on both sides of every street: a pair works one side each, a solo has to do both.
    const { streets, houses } = grid(2, 2);
    const car = at(1, -0.2);
    const { options } = suggest({ streets, houses, memberIds: crew(4), start: car });
    const best = options[0]!;
    expect(best.mode).toBe("pairs");
    for (const g of best.groups) {
      // The first street starts within about a block of the car: no long walk before the first door.
      const first = streets.find((s) => s.id === g.streetIds[0])!;
      const nearEnd = Math.min(...first.coordinates.map(([lng, lat]) => distanceM(car, { lat, lng })));
      expect(nearEnd).toBeLessThan(150);
      expect(gridY(g.end)).toBeGreaterThan(1.5); // finishes along the top
      expect(g.doors).toBe(60);
    }
    expect(gridY(best.meetPoint)).toBeGreaterThan(1.5);
  });

  it("car in the middle: solos each take a quadrant and loop back to the car", () => {
    const { streets, houses } = grid(2, 2);
    const car = at(1, 1);
    const solo = suggest({ streets, houses, memberIds: crew(4), start: car }).options.find((o) => o.mode === "solo")!;
    expect(distanceM(solo.meetPoint, car)).toBeLessThan(10);
    for (const g of solo.groups) {
      expect(g.doors).toBe(30);
      expect(distanceM(g.end, car)).toBeLessThan(110);
      expect(g.walkM).toBeLessThan(700); // three two-sided streets: each side once, little extra walking
    }
  });

  it("assigns every selected house to exactly one group, in every option", () => {
    const { streets, houses } = grid(4, 4);
    const selected = houses.filter((h) => h.id % 3 !== 0 && h.streetId! % 5 !== 0);
    const { options, unroutedHouseIds } = suggest({
      streets,
      houses: selected,
      memberIds: crew(5),
      start: at(2, -0.1),
    });
    expect(unroutedHouseIds).toEqual([]);
    expect(options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["Solo", "Pairs + 1 solo", "Groups of 3 and 2", "All together"]),
    );
    const want = selected.map((h) => h.id).sort((a, b) => a - b);
    for (const o of options) {
      expect(o.groups.flatMap((g) => g.houseIds).sort((a, b) => a - b)).toEqual(want);
      expect(o.groups.flatMap((g) => g.memberIds).sort()).toEqual(crew(5));
      for (const g of o.groups) {
        expect(g.knocks.map((k) => k.houseId).sort((x, y) => x - y)).toEqual([...g.houseIds].sort((x, y) => x - y));
        expect(g.knocks.every((k) => g.memberIds.includes(k.memberId))).toBe(true);
      }
      for (const g of o.groups) {
        expect(g.route.length).toBeGreaterThanOrEqual(2);
        expect(g.finishS).toBeLessThanOrEqual(o.finishS);
      }
      expect(o.togetherS).toBeGreaterThanOrEqual(o.finishS);
    }
  });

  it("ranks options by when everyone's back together; splitting up beats one big group", () => {
    const { streets, houses } = grid(4, 4);
    const { options } = suggest({ streets, houses, memberIds: crew(8), start: at(2, 2) });
    expect(options.map((o) => o.mode).sort()).toEqual(["half", "pairs", "solo", "together"]);
    const scores = options.map((o) => o.togetherS);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    const by = (mode: string) => options.find((o) => o.mode === mode)!.togetherS;
    expect(by("solo")).toBeLessThan(by("together"));
    expect(by("pairs")).toBeLessThan(by("together"));
  });

  it("time = walking at 1.3 m/s + doors shared within the group", () => {
    const { streets, houses } = grid(1, 1);
    const oneStreet = houses.filter((h) => h.streetId === 1); // 10 doors, 100 m
    const start = at(0, 0);
    const pairOf = (o: { options: { mode: string; finishS: number; groups: unknown[] }[] }) =>
      o.options.find((x) => x.mode === "together")!;
    const together = pairOf(suggest({ streets, houses: oneStreet, memberIds: crew(2), start }));
    expect(together.finishS).toBe(Math.round(100 / 1.3 + (10 * 60) / 2));
    const quick = pairOf(suggest({ streets, houses: oneStreet, memberIds: crew(2), start, secondsPerDoor: 30 }));
    expect(quick.finishS).toBe(Math.round(100 / 1.3 + (10 * 30) / 2));
  });

  it("walks only as far as the selected doors go, then comes back", () => {
    const a = at(0, 0);
    const b = at(3, 0);
    const streets: SuggestStreet[] = [
      {
        id: 1,
        coordinates: [
          [a.lng, a.lat],
          [b.lng, b.lat],
        ],
      },
    ]; // 300 m, no corners
    const houses: SuggestHouse[] = [20, 40, 60].map((m, i) => ({
      id: i + 1,
      streetId: 1,
      blockId: 1,
      ...at(m / 100, 0.15),
    }));
    const [option] = suggest({ streets, houses, memberIds: crew(1), start: at(0, -0.1) }).options;
    const g = option!.groups[0]!;
    expect(g.walkM).toBeGreaterThan(115); // the car snaps onto the street: 60 m out + 60 m back
    expect(g.walkM).toBeLessThan(125);
    expect(Math.max(...g.route.map((p) => distanceM(p, a)))).toBeCloseTo(60, 0);
    expect(distanceM(g.end, a)).toBeLessThan(1);
  });

  describe("sides of the street (crossing the road takes ~15 s)", () => {
    // One 100 m street, 5 houses on each side, the car at its west end.
    const a = at(0, 0);
    const b = at(1, 0);
    const streets: SuggestStreet[] = [
      {
        id: 1,
        coordinates: [
          [a.lng, a.lat],
          [b.lng, b.lat],
        ],
      },
    ];
    const side = (y: number, from: number): SuggestHouse[] =>
      [10, 30, 50, 70, 90].map((m, i) => ({ id: from + i, streetId: 1, blockId: 1, ...at(m / 100, y) }));
    const north = side(0.15, 1);
    const south = side(-0.15, 11);
    const ids = (hs: SuggestHouse[]) => hs.map((h) => h.id);

    it("a solo goes down one side and back up the other, instead of zigzagging", () => {
      const [solo] = suggest({ streets, houses: [...north, ...south], memberIds: crew(1), start: a }).options;
      const g = solo!.groups[0]!;
      const order = g.knocks.map((k) => k.houseId);
      // One side going out (nearest first), the other coming back (furthest first).
      expect([ids(north).concat(ids(south).reverse()), ids(south).concat(ids(north).reverse())]).toContainEqual(order);
      expect(distanceM(g.end, a)).toBeLessThan(1); // back where they started
      expect(g.walkM).toBeGreaterThan(175); // out to the last door (90 m) and back
      expect(g.walkM).toBeLessThan(185);
    });

    it("a pair walks the street once, one person per side", () => {
      const pair = suggest({ streets, houses: [...north, ...south], memberIds: crew(2), start: a }).options.find(
        (o) => o.mode === "together",
      );
      const g = pair!.groups[0]!;
      expect(g.memberIds).toHaveLength(2);
      expect(Math.abs(g.walkM - 100)).toBeLessThan(2);
      const byMember = g.memberIds.map((m) =>
        g.knocks
          .filter((k) => k.memberId === m)
          .map((k) => k.houseId)
          .sort((x, y) => x - y),
      );
      expect(byMember).toEqual(expect.arrayContaining([ids(north), ids(south)]));
    });

    const crossingsBy = (
      g: { memberIds: string[]; knocks: { houseId: number; memberId: string }[] },
      sideOf: (id: number) => string,
    ) =>
      g.memberIds.map((m) => {
        const sides = g.knocks.filter((k) => k.memberId === m).map((k) => sideOf(k.houseId));
        return sides.filter((s, i) => i > 0 && s !== sides[i - 1]).length;
      });

    it("a pair keeps their sides on a two-sided street, even when one side has more doors", () => {
      const fewSouth = south.slice(3, 5); // north 5, south 2
      const pair = suggest({ streets, houses: [...north, ...fewSouth], memberIds: crew(2), start: a }).options.find(
        (o) => o.mode === "together",
      );
      const g = pair!.groups[0]!;
      const sideOf = (id: number) => (fewSouth.some((h) => h.id === id) ? "S" : "N");
      expect(crossingsBy(g, sideOf)).toEqual([0, 0]);
      // The busier side sets the pace: 5 doors, not 7 ÷ 2.
      expect(g.finishS).toBe(Math.round(100 / 1.3 + 5 * 60));
    });

    it("the turning circle at the end of a dead end goes to whoever is behind, in one unbroken run", () => {
      // Dead end: north 4 doors, south 1, and 3 houses round the turning circle past the end.
      const north4 = north.slice(0, 4);
      const south1 = south.slice(0, 1);
      const circle: SuggestHouse[] = [
        { id: 31, streetId: 1, blockId: 1, ...at(1.1, 0.1) }, // left of the walking direction
        { id: 32, streetId: 1, blockId: 1, ...at(1.15, 0) },
        { id: 33, streetId: 1, blockId: 1, ...at(1.1, -0.1) }, // right
      ];
      const pair = suggest({
        streets,
        houses: [...north4, ...south1, ...circle],
        memberIds: crew(2),
        start: a,
      }).options.find((o) => o.mode === "together");
      const g = pair!.groups[0]!;
      const south1Rep = g.knocks.find((k) => k.houseId === south1[0]!.id)!.memberId;
      // The person on the south (right) side is 3 behind, so they take the whole circle, from their side round.
      expect(g.knocks.filter((k) => k.memberId === south1Rep).map((k) => k.houseId)).toEqual([
        south1[0]!.id,
        33,
        32,
        31,
      ]);
      expect(g.finishS).toBe(Math.round(g.walkM / 1.3 + 4 * 60));
    });

    it("two solos on one two-sided street take a side each, with no zigzag (like a busy road)", () => {
      const res = suggest({ streets, houses: [...north, ...south], memberIds: crew(2), start: a });
      const solo = res.options.find((o) => o.mode === "solo")!;
      const sideOf = (id: number) => (north.some((h) => h.id === id) ? "N" : "S");
      const sides = solo.groups.map((g) => [...new Set(g.knocks.map((k) => sideOf(k.houseId)))]);
      expect(sides.map((x) => x.join("")).sort()).toEqual(["N", "S"]);
    });

    it("a pair on a one-sided street leapfrogs: A, B, A, B…", () => {
      const pair = suggest({ streets, houses: north, memberIds: crew(2), start: a }).options.find(
        (o) => o.mode === "together",
      );
      const g = pair!.groups[0]!;
      expect(g.knocks.map((k) => k.houseId)).toEqual(ids(north));
      const who = g.knocks.map((k) => k.memberId);
      for (let i = 1; i < who.length; i++) expect(who[i]).not.toBe(who[i - 1]);
    });

    it("on a two-sided street a solo walks both sides; a zigzag pays for every crossing", () => {
      const solo = (secondsPerCrossing: number) =>
        suggest({ streets, houses: [...north, ...south], memberIds: crew(1), start: a, secondsPerCrossing }).options[0]!
          .groups[0]!;
      // Crossings are ~free: zigzag down the street once.
      expect(Math.abs(solo(0).walkM - 100)).toBeLessThan(2);
      // Crossings cost time: one side, then the other.
      expect(solo(15).walkM).toBeGreaterThan(175);
    });
  });

  it("meets at the regroup pin when there is one", () => {
    const { streets, houses } = grid(2, 2);
    const start = at(1, -0.2);
    const pin = at(0, 2);
    const free = suggest({ streets, houses, memberIds: crew(4), start }).options;
    const pinned = suggest({ streets, houses, memberIds: crew(4), start, regroup: pin }).options;
    for (const o of pinned) {
      expect(o.meetPoint).toEqual(pin);
      for (const g of o.groups) expect(o.togetherS).toBeGreaterThanOrEqual(g.finishS + distanceM(g.end, pin) / 1.3 - 1);
    }
    expect(pinned[0]!.togetherS).toBeGreaterThanOrEqual(free[0]!.togetherS);
  });

  it("snaps the car and the regroup pin onto the street, and every route walks on to the pin", () => {
    const { streets, houses } = grid(2, 2);
    // The car is parked 30 m south of the bottom street; the pin is dropped in the middle of a block.
    const res = suggest({ streets, houses, memberIds: crew(4), start: at(0.5, -0.3), regroup: at(1.5, 1.4) });
    expect(distanceM(res.start, at(0.5, 0))).toBeLessThan(1); // on the bottom street, mid-block
    // The pin snaps to the nearest street: x = 2 (50 m away) or y = 1 (40 m away).
    expect(distanceM(res.regroup!, at(1.5, 1))).toBeLessThan(1);
    for (const o of res.options) {
      expect(o.meetPoint).toEqual(res.regroup);
      for (const g of o.groups) {
        expect(g.route[0]).toEqual(res.start);
        expect(g.toMeet[0]).toEqual(g.end);
        expect(distanceM(g.toMeet[g.toMeet.length - 1]!, res.regroup!)).toBeLessThan(1);
      }
    }
  });

  it("pairs solos into buddies (one trio if the crew is odd), each helping their buddy when done", () => {
    const { streets, houses } = grid(4, 4);
    const solo = suggest({ streets, houses, memberIds: crew(5), start: at(2, 2) }).options.find(
      (o) => o.mode === "solo",
    )!;
    expect(solo.buddies!.map((team) => team.length).sort()).toEqual([2, 3]);
    for (const team of solo.buddies!)
      for (const m of team) {
        const g = solo.groups.find((x) => x.memberIds[0] === m)!;
        expect(team).toContain(g.helpAfter!.memberId);
        expect(g.helpAfter!.memberId).not.toBe(m);
        const buddy = solo.groups.find((x) => x.memberIds[0] === g.helpAfter!.memberId)!;
        expect(g.helpAfter!.houseId).toBe(buddy.houseIds[buddy.houseIds.length - 1]);
      }
  });

  it("reports houses it can't route instead of guessing", () => {
    const { streets, houses } = grid(1, 1);
    const extra: SuggestHouse[] = [
      { id: 1, streetId: null, blockId: 5, ...at(0.5, 0.5) },
      { id: 2, streetId: 9999, blockId: 5, ...at(0.5, 0.5) },
    ];
    const res = suggest({ streets, houses: [...houses, ...extra], memberIds: crew(2), start: at(0, 0) });
    expect(res.unroutedHouseIds).toEqual([1, 2]);
    expect(res.options.length).toBeGreaterThan(0);
    expect(suggest({ streets, houses: extra, memberIds: crew(2), start: at(0, 0) }).options).toEqual([]);
  });
});

describe("streetPath", () => {
  it("walks along the streets through the stops in order", () => {
    const { streets } = grid(2, 2);
    const path = streetPath(streets, [at(0, -0.1), at(2, 1)]); // snaps to (0,0), then 2 blocks east, 1 north
    let m = 0;
    for (let i = 1; i < path.length; i++) m += distanceM(path[i - 1]!, path[i]!);
    expect(m).toBeCloseTo(300, 0);
  });

  it("snaps a house onto its own street, even if another street is nearer", () => {
    const { streets } = grid(2, 2);
    // 45 m from the street at y = 0 but it belongs to street 3 (y = 1, from x = 0 to 1).
    const [snapped] = streetPath(streets, [{ ...at(0.5, 0.45), streetId: 3 }]);
    expect(gridY(snapped!)).toBeCloseTo(1, 3);
  });
});

describe("crewSplits", () => {
  const labels = (n: number) => crewSplits(n).map((s) => `${s.label} [${s.sizes.join(",")}]`);
  it("solo, pairs, half the crew, everyone together (odd crews get one solo)", () => {
    expect(labels(1)).toEqual(["Solo [1]"]);
    expect(labels(2)).toEqual(["Solo [1,1]", "All together [2]"]);
    expect(labels(3)).toEqual(["Solo [1,1,1]", "Pairs + 1 solo [2,1]", "All together [3]"]);
    expect(labels(4)).toEqual(["Solo [1,1,1,1]", "Pairs [2,2]", "All together [4]"]);
    expect(labels(5)).toEqual([
      "Solo [1,1,1,1,1]",
      "Pairs + 1 solo [2,2,1]",
      "Groups of 3 and 2 [3,2]",
      "All together [5]",
    ]);
    expect(labels(8)).toEqual(["Solo [1,1,1,1,1,1,1,1]", "Pairs [2,2,2,2]", "2 groups of 4 [4,4]", "All together [8]"]);
  });
});

describe("suggestionToPlanOps", () => {
  it("replaces the plan for those blocks: claims per member, one dashed route per group", () => {
    const { streets, houses } = grid(2, 2);
    const option = suggest({ streets, houses, memberIds: crew(4), start: at(1, 1) }).options.find(
      (o) => o.mode === "pairs",
    )!;
    const outsider = member(99);
    const before: PlanContent = {
      ...EMPTY_PLAN,
      claims: [
        { blockId: 1101, memberId: outsider, authorId: outsider }, // inside: replaced
        { blockId: 7777, memberId: outsider, authorId: outsider }, // elsewhere: kept
      ],
      drawings: [
        {
          id: uuid(),
          kind: "route",
          points: [at(0, 0), at(1, 0)],
          memberId: member(1),
          colour: null,
          authorId: outsider,
        },
        {
          id: uuid(),
          kind: "freehand",
          points: [at(0, 0), at(1, 0)],
          memberId: member(1),
          colour: null,
          authorId: outsider,
        },
      ],
    };
    const ops = suggestionToPlanOps(option, before, uuid);
    for (const op of ops) expect(PlanEditOp.safeParse(op).success).toBe(true);

    const after = ops.reduce((plan, op) => applyPlanEdit(plan, op, member(1)), before);
    expect(after.claims.some((c) => c.memberId === outsider && c.blockId === 1101)).toBe(false);
    expect(after.claims.some((c) => c.memberId === outsider && c.blockId === 7777)).toBe(true);
    for (const g of option.groups)
      for (const m of g.memberIds)
        expect(
          after.claims
            .filter((c) => c.memberId === m)
            .map((c) => c.blockId)
            .sort(),
        ).toEqual([...new Set(option.groups.filter((x) => x.memberIds.includes(m)).flatMap((x) => x.blockIds))].sort());
    const routes = after.drawings.filter((d) => d.kind === "route");
    expect(routes.map((d) => d.memberId).sort()).toEqual(option.groups.map((g) => g.memberIds[0]).sort());
    expect(after.drawings.filter((d) => d.kind === "freehand")).toHaveLength(1); // freehand lines stay
  });

  it("clears the crew's claims from an earlier plan elsewhere, so the old area isn't left marked", () => {
    const { streets, houses } = grid(2, 2);
    const option = suggest({ streets, houses, memberIds: crew(2), start: at(1, 1) }).options[0]!;
    const outsider = member(99);
    const before: PlanContent = {
      ...EMPTY_PLAN,
      claims: [
        { blockId: 8888, memberId: member(1), authorId: member(1) }, // the crew's old plan: cleared
        { blockId: 7777, memberId: outsider, authorId: outsider }, // someone else's: kept
      ],
    };
    const after = suggestionToPlanOps(option, before, uuid).reduce(
      (plan, op) => applyPlanEdit(plan, op, member(1)),
      before,
    );
    expect(after.claims.some((c) => c.blockId === 8888)).toBe(false);
    expect(after.claims.some((c) => c.blockId === 7777 && c.memberId === outsider)).toBe(true);
  });
});
