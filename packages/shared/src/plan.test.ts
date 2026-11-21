import { describe, expect, it } from "vitest";
import { EMPTY_PLAN, PALETTE, utilityColours, type PlanContent } from "./entities";
import { applyPlanEdit, claimantsOf, memberIdsIn, PLAN_LIMITS, PlanEditError } from "./plan";
import { PlanEditOp } from "./socket";

const TRISTAN = "00000000-0000-4000-8000-000000000001";
const JAS = "00000000-0000-4000-8000-000000000002";
const id = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
const line = [
  { lat: 42.955, lng: -81.34 },
  { lat: 42.956, lng: -81.341 },
];

const run = (ops: [PlanEditOp, string][], start: PlanContent = EMPTY_PLAN) =>
  ops.reduce((plan, [op, author]) => applyPlanEdit(plan, op, author), start);

describe("claims", () => {
  it("you can claim for yourself or a teammate, and two people on one block is a pair", () => {
    const plan = run([
      [{ op: "claim", blockId: 1, memberId: TRISTAN }, TRISTAN],
      [{ op: "claim", blockId: 1, memberId: JAS }, TRISTAN], // organiser claims for Jas
      [{ op: "claim", blockId: 1, memberId: JAS }, JAS], // duplicate: ignored
    ]);
    expect(claimantsOf(plan, 1)).toEqual([TRISTAN, JAS]);
    expect(plan.claims.find((c) => c.memberId === JAS)?.authorId).toBe(TRISTAN);
  });

  it("claimMany and unclaim", () => {
    const plan = run([
      [{ op: "claimMany", blockIds: [1, 2, 3], memberId: JAS }, JAS],
      [{ op: "unclaim", blockId: 2, memberId: JAS }, TRISTAN],
    ]);
    expect(plan.claims.map((c) => c.blockId)).toEqual([1, 3]);
  });

  it("enforces the claim limit", () => {
    const full: PlanContent = {
      ...EMPTY_PLAN,
      claims: Array.from({ length: PLAN_LIMITS.claims }, (_, i) => ({ blockId: i + 1, memberId: JAS, authorId: JAS })),
    };
    expect(() => applyPlanEdit(full, { op: "claim", blockId: 999_999, memberId: JAS }, JAS)).toThrow(PlanEditError);
  });
});

describe("drawings and notes", () => {
  it("a route for Jas (her colour) or a utility-colour line; same id replaces", () => {
    const plan = run([
      [{ op: "draw", stroke: { id: id(1), kind: "route", points: line, memberId: JAS, colour: null } }, TRISTAN],
      [{ op: "draw", stroke: { id: id(2), kind: "freehand", points: line, memberId: null, colour: PALETTE[11] } }, JAS],
      [{ op: "draw", stroke: { id: id(1), kind: "freehand", points: line, memberId: JAS, colour: null } }, TRISTAN],
    ]);
    expect(plan.drawings.map((d) => [d.id, d.kind, d.authorId])).toEqual([
      [id(2), "freehand", JAS],
      [id(1), "freehand", TRISTAN],
    ]);
  });

  it("erase and removeNote remove by id", () => {
    const plan = run([
      [{ op: "draw", stroke: { id: id(1), kind: "route", points: line, memberId: JAS, colour: null } }, JAS],
      [
        {
          op: "note",
          note: { id: id(2), lat: 42.95, lng: -81.34, text: "dog at #42", memberId: null, colour: PALETTE[10] },
        },
        JAS,
      ],
      [{ op: "erase", drawingId: id(1) }, TRISTAN],
      [{ op: "removeNote", noteId: id(2) }, TRISTAN],
    ]);
    expect(plan.drawings).toEqual([]);
    expect(plan.notes).toEqual([]);
  });

  it("a drawing must be for a member or in a utility colour, not both or neither", () => {
    const both = { op: "draw", stroke: { id: id(1), kind: "route", points: line, memberId: JAS, colour: PALETTE[9] } };
    const neither = { op: "draw", stroke: { id: id(1), kind: "route", points: line, memberId: null, colour: null } };
    expect(PlanEditOp.safeParse(both).success).toBe(false);
    expect(PlanEditOp.safeParse(neither).success).toBe(false);
    expect(PlanEditOp.safeParse({ ...both, stroke: { ...both.stroke, colour: null } }).success).toBe(true);
  });
});

describe("clearMine", () => {
  it("removes only your own claims, drawings and notes", () => {
    const plan = run([
      [{ op: "claim", blockId: 1, memberId: TRISTAN }, TRISTAN],
      [{ op: "claim", blockId: 2, memberId: JAS }, JAS],
      [{ op: "draw", stroke: { id: id(1), kind: "route", points: line, memberId: JAS, colour: null } }, TRISTAN],
      [
        { op: "note", note: { id: id(2), lat: 42.95, lng: -81.34, text: "start here", memberId: JAS, colour: null } },
        JAS,
      ],
      [{ op: "clearMine" }, TRISTAN],
    ]);
    expect(plan.claims.map((c) => c.memberId)).toEqual([JAS]);
    expect(plan.drawings).toEqual([]); // Tristan drew it (for Jas), so it's his to clear
    expect(plan.notes).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("utility colours are the palette minus members' colours", () => {
    expect(utilityColours([PALETTE[0], PALETTE[1]])).toHaveLength(10);
  });

  it("memberIdsIn lists who an op refers to", () => {
    expect(memberIdsIn({ op: "claim", blockId: 1, memberId: JAS })).toEqual([JAS]);
    expect(memberIdsIn({ op: "clearMine" })).toEqual([]);
  });
});
