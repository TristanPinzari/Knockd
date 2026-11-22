import { applyPlanEdit, EMPTY_PLAN, type PlanContent, type PlanEditOp } from "@knockd/shared";
import {
  claimTapOps,
  cleanStroke,
  drawingsTouched,
  drawOp,
  inverseOfAction,
  MAX_STROKE_POINTS,
  metresPerPixel,
  unclaimBlockOps,
} from "../planOps";

const ME = "11111111-1111-4111-8111-111111111111";
const JAS = "22222222-2222-4222-8222-222222222222";
const ids = (() => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
})();

/** A line going north from Byron, `metres` long, one point per metre. */
const north = (metres: number, lng = -81.3425) =>
  Array.from({ length: metres + 1 }, (_, i) => ({ lat: 42.955 + i / 111_320, lng }));

const apply = (plan: PlanContent, ops: readonly PlanEditOp[], author = ME) =>
  ops.reduce((p, op) => applyPlanEdit(p, op, author), plan);

describe("claims", () => {
  it("claims an unclaimed block, and unclaims it on a second tap", () => {
    const once = apply(EMPTY_PLAN, claimTapOps(EMPTY_PLAN, 7, JAS));
    expect(once.claims).toEqual([{ blockId: 7, memberId: JAS, authorId: ME }]);
    expect(apply(once, claimTapOps(once, 7, JAS)).claims).toEqual([]);
  });

  it("the eraser unclaims everyone on a block", () => {
    const pair = apply(EMPTY_PLAN, [
      { op: "claim", blockId: 7, memberId: ME },
      { op: "claim", blockId: 7, memberId: JAS },
      { op: "claim", blockId: 8, memberId: JAS },
    ]);
    expect(apply(pair, unclaimBlockOps(pair, 7)).claims.map((c) => c.blockId)).toEqual([8]);
  });
});

describe("strokes", () => {
  it("drops points under 2 m apart but keeps both ends", () => {
    const clean = cleanStroke(north(10));
    expect(clean[0]).toEqual(north(10)[0]);
    expect(clean[clean.length - 1]).toEqual(north(10)[10]);
    expect(clean.length).toBe(6);
  });

  it("caps a long stroke at the server limit", () => {
    expect(cleanStroke(north(3000)).length).toBe(MAX_STROKE_POINTS);
  });

  it("a tap is not a drawing", () => {
    expect(drawOp("freehand", north(0), { memberId: ME }, ids)).toBeNull();
  });

  it("a drawing is for a member or in a utility colour, never both", () => {
    const forJas = drawOp("route", north(20), { memberId: JAS }, ids);
    const utility = drawOp("route", north(20), { colour: "#8AC926" }, ids);
    expect(forJas).toMatchObject({ op: "draw", stroke: { kind: "route", memberId: JAS, colour: null } });
    expect(utility).toMatchObject({ op: "draw", stroke: { memberId: null, colour: "#8AC926" } });
  });

  it("the eraser hits lines it passes near, not ones further away", () => {
    const drawings = apply(EMPTY_PLAN, [
      drawOp("freehand", north(50), { memberId: ME }, ids)!,
      drawOp("freehand", north(50, -81.34), { memberId: ME }, ids)!, // ~200 m east
    ]).drawings;
    // A touch ~5 m east of the first line.
    const swipe = [{ lat: 42.9552, lng: -81.34244 }];
    expect(drawingsTouched(drawings, swipe, 8).map((d) => d.id)).toEqual([drawings[0]!.id]);
  });

  it("metres per pixel halves with each zoom level", () => {
    expect(metresPerPixel(43, 16) / metresPerPixel(43, 17)).toBeCloseTo(2);
    expect(metresPerPixel(43, 17)).toBeGreaterThan(0.4);
    expect(metresPerPixel(43, 17)).toBeLessThan(0.7);
  });
});

describe("undo", () => {
  const undoOf = (before: PlanContent, ops: PlanEditOp[]) => inverseOfAction(ops, before, ME, applyPlanEdit);
  const roundTrip = (before: PlanContent, ops: PlanEditOp[]) => apply(apply(before, ops), undoOf(before, ops));

  it("undoes a claim, a drawing and a note", () => {
    const ops: PlanEditOp[] = [
      { op: "claim", blockId: 3, memberId: ME },
      drawOp("route", north(30), { memberId: ME }, ids)!,
      {
        op: "note",
        note: { id: ids(), lat: 42.955, lng: -81.34, text: "Car here", memberId: null, colour: "#8AC926" },
      },
    ];
    expect(roundTrip(EMPTY_PLAN, ops)).toEqual(EMPTY_PLAN);
  });

  it("undoing an erase or unclaim puts back what was there, including a teammate's", () => {
    const theirs = apply(
      EMPTY_PLAN,
      [drawOp("freehand", north(30), { memberId: JAS }, ids)!, { op: "claim", blockId: 9, memberId: JAS }],
      JAS,
    );
    const drawingId = theirs.drawings[0]!.id;
    const after = roundTrip(theirs, [
      { op: "erase", drawingId },
      { op: "unclaim", blockId: 9, memberId: JAS },
    ]);
    expect(after.drawings.map((d) => d.points)).toEqual(theirs.drawings.map((d) => d.points));
    expect(after.claims.map((c) => [c.blockId, c.memberId])).toEqual([[9, JAS]]);
  });

  it("claiming a block someone already has needs no undo", () => {
    const claimed = apply(EMPTY_PLAN, [{ op: "claim", blockId: 4, memberId: JAS }], JAS);
    expect(undoOf(claimed, [{ op: "claim", blockId: 4, memberId: JAS }])).toEqual([]);
  });

  it("undoing clear mine brings back only my items", () => {
    const mixed = apply(
      apply(EMPTY_PLAN, [
        { op: "claim", blockId: 1, memberId: ME },
        drawOp("route", north(20), { memberId: ME }, ids)!,
      ]),
      [{ op: "claim", blockId: 2, memberId: JAS }],
      JAS,
    );
    const after = roundTrip(mixed, [{ op: "clearMine" }]);
    expect(after.claims.map((c) => c.blockId).sort()).toEqual([1, 2]);
    expect(after.drawings).toHaveLength(1);
  });
});
