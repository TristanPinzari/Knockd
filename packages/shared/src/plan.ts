/**
 * Applies one planning edit to a plan. Pure function, shared by the server (source of truth)
 * and the apps (to update the screen instantly before the server confirms).
 */
import type { PlanContent } from "./entities";
import { EMPTY_PLAN } from "./entities";
import type { PlanEditOp } from "./socket";

export const PLAN_LIMITS = { groups: 8, drawings: 200, notes: 50 } as const;

export class PlanEditError extends Error {}

export function applyPlanEdit(plan: PlanContent, op: PlanEditOp): PlanContent {
  const withoutBlock = (blockId: number) =>
    plan.groups.map((g) => ({ ...g, blockIds: g.blockIds.filter((id) => id !== blockId) }));

  switch (op.op) {
    case "assign": {
      if (!plan.groups[op.groupIndex]) throw new PlanEditError(`No group ${op.groupIndex}`);
      const groups = withoutBlock(op.blockId);
      groups[op.groupIndex]!.blockIds.push(op.blockId);
      return { ...plan, groups };
    }
    case "unassign":
      return { ...plan, groups: withoutBlock(op.blockId) };
    case "setGroups":
      if (op.groups.length > PLAN_LIMITS.groups) throw new PlanEditError(`At most ${PLAN_LIMITS.groups} groups`);
      return { ...plan, groups: op.groups };
    case "draw": {
      const drawings = [...plan.drawings.filter((d) => d.id !== op.stroke.id), op.stroke];
      if (drawings.length > PLAN_LIMITS.drawings) throw new PlanEditError(`At most ${PLAN_LIMITS.drawings} drawings`);
      return { ...plan, drawings };
    }
    case "erase":
      return { ...plan, drawings: plan.drawings.filter((d) => d.id !== op.drawingId) };
    case "note": {
      const notes = [...plan.notes.filter((n) => n.id !== op.note.id), op.note];
      if (notes.length > PLAN_LIMITS.notes) throw new PlanEditError(`At most ${PLAN_LIMITS.notes} notes`);
      return { ...plan, notes };
    }
    case "removeNote":
      return { ...plan, notes: plan.notes.filter((n) => n.id !== op.noteId) };
    case "clear":
      return EMPTY_PLAN;
  }
}
