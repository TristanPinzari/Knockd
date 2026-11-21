/**
 * Applies one planning edit to a session plan. Pure function, shared by the server (source of
 * truth) and the apps (to update the screen instantly before the server confirms).
 *
 * `authorId` is the member making the edit: it's stamped on new claims, drawings and notes, and
 * "clearMine" removes only that member's items. The server always uses the real sender.
 *
 * Undo/redo and the eraser live on the phone and are built from these ops:
 *   undo claim → unclaim, undo draw → erase, undo note → removeNote (and back again for redo).
 */
import type { Claim, PlanContent } from "./entities";
import type { PlanEditOp } from "./socket";

export const PLAN_LIMITS = { claims: 1000, drawings: 200, notes: 50 } as const;

export class PlanEditError extends Error {}

const sameClaim = (a: Pick<Claim, "blockId" | "memberId">, b: Pick<Claim, "blockId" | "memberId">) =>
  a.blockId === b.blockId && a.memberId === b.memberId;

function limit<T>(items: T[], max: number, what: string): T[] {
  if (items.length > max) throw new PlanEditError(`At most ${max} ${what}`);
  return items;
}

export function applyPlanEdit(plan: PlanContent, op: PlanEditOp, authorId: string): PlanContent {
  switch (op.op) {
    case "claim": {
      if (plan.claims.some((c) => sameClaim(c, op))) return plan;
      const claim = { blockId: op.blockId, memberId: op.memberId, authorId };
      return { ...plan, claims: limit([...plan.claims, claim], PLAN_LIMITS.claims, "claims") };
    }
    case "claimMany": {
      const added = op.blockIds
        .map((blockId) => ({ blockId, memberId: op.memberId, authorId }))
        .filter((claim) => !plan.claims.some((c) => sameClaim(c, claim)));
      return { ...plan, claims: limit([...plan.claims, ...added], PLAN_LIMITS.claims, "claims") };
    }
    case "unclaim":
      return { ...plan, claims: plan.claims.filter((c) => !sameClaim(c, op)) };
    case "draw": {
      const stroke = { ...op.stroke, authorId };
      const drawings = [...plan.drawings.filter((d) => d.id !== stroke.id), stroke];
      return { ...plan, drawings: limit(drawings, PLAN_LIMITS.drawings, "drawings") };
    }
    case "erase":
      return { ...plan, drawings: plan.drawings.filter((d) => d.id !== op.drawingId) };
    case "note": {
      const note = { ...op.note, authorId };
      const notes = [...plan.notes.filter((n) => n.id !== note.id), note];
      return { ...plan, notes: limit(notes, PLAN_LIMITS.notes, "notes") };
    }
    case "removeNote":
      return { ...plan, notes: plan.notes.filter((n) => n.id !== op.noteId) };
    case "clearMine":
      return {
        claims: plan.claims.filter((c) => c.authorId !== authorId),
        drawings: plan.drawings.filter((d) => d.authorId !== authorId),
        notes: plan.notes.filter((n) => n.authorId !== authorId),
      };
  }
}

/** Members who claimed a block, for colouring it (two or more = a pair/group). */
export const claimantsOf = (plan: PlanContent, blockId: number): string[] =>
  plan.claims.filter((c) => c.blockId === blockId).map((c) => c.memberId);

/** Member IDs an op refers to (the server checks they're in the session). */
export function memberIdsIn(op: PlanEditOp): string[] {
  switch (op.op) {
    case "claim":
    case "claimMany":
      return [op.memberId];
    case "draw":
      return op.stroke.memberId ? [op.stroke.memberId] : [];
    case "note":
      return op.note.memberId ? [op.note.memberId] : [];
    default:
      return [];
  }
}
