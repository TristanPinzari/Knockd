import { create } from "zustand";
import { applyPlanEdit, type PlanContent, type PlanEditOp } from "@knockd/shared";

/**
 * The session's single shared plan (claims, drawings, notes), kept in sync by version (API.md,
 * "Staying in sync"): the server adds 1 per edit. An update older than the one we have is ignored;
 * one that skips ahead means we missed an edit, so `needsRefetch` asks for a fresh GET /plan.
 */
interface PlanState {
  /** Null until the snapshot or GET /plan arrives. */
  plan: PlanContent | null;
  /** Version of `plan` (0 = never edited); null until the first plan arrives. */
  version: number | null;
  /** Member id of whoever made the latest edit (null for a snapshot or fetch). */
  editedBy: string | null;
  /** True when a socket update skipped a version; cleared by the next full plan. */
  needsRefetch: boolean;
  /** A full plan (snapshot or GET /plan): applied unless we already have a newer one. */
  setPlan: (plan: PlanContent, version: number) => void;
  /** A `plan:updated` event. */
  applyUpdate: (plan: PlanContent, version: number, editedBy: string | null) => void;
  /**
   * This phone's own edit, shown straight away (the same code the server runs). The version stays
   * the same, so the server's `plan:updated` for it replaces this copy. Throws if the edit is invalid.
   */
  applyLocal: (op: PlanEditOp, authorId: string) => void;
  /** An edit failed: refetch GET /plan to drop anything shown optimistically. */
  markStale: () => void;
  reset: () => void;
}

const initial = { plan: null, version: null, editedBy: null, needsRefetch: false };

export const usePlanStore = create<PlanState>()((set) => ({
  ...initial,
  setPlan: (plan, version) =>
    set((s) =>
      s.version !== null && version < s.version ? s : { plan, version, editedBy: null, needsRefetch: false },
    ),
  applyUpdate: (plan, version, editedBy) =>
    set((s) => {
      if (s.version !== null && version <= s.version) return s;
      const skipped = s.version !== null && version > s.version + 1;
      return { plan, version, editedBy, needsRefetch: skipped };
    }),
  applyLocal: (op, authorId) => set((s) => (s.plan ? { plan: applyPlanEdit(s.plan, op, authorId) } : s)),
  // Off then on, so subscribers always see a fresh false → true change.
  markStale: () => {
    set({ needsRefetch: false });
    set({ needsRefetch: true });
  },
  reset: () => set({ ...initial }),
}));
