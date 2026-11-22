/**
 * Planning mode state on this phone: the tool, the colour (ink), and undo/redo of my own actions.
 *
 * `run(ops)` is the one way the plan changes from this phone: it shows the edit straight away
 * (applyPlanEdit, the server's own code), sends it over the socket, and records how to undo it.
 * Planning needs a connection (API.md): if sending fails, the message says so and the plan is
 * refetched to drop the unsaved change. Actions run one at a time, in order.
 */
import { create } from "zustand";
import { applyPlanEdit, EMPTY_PLAN, type PlanEditOp } from "@knockd/shared";
import { logger } from "@/realtime/logger";
import { PlanEditError, sendPlanEdits } from "@/realtime/planEdits";
import { usePlanStore } from "@/realtime/stores/planStore";
import { inverseOfAction, type Ink, type PlanTool } from "./planOps";

interface Action {
  readonly ops: readonly PlanEditOp[];
  readonly undo: readonly PlanEditOp[];
}

/** Deepest undo history kept. */
const MAX_HISTORY = 50;

export interface PlanEditorState {
  readonly planning: boolean;
  readonly tool: PlanTool;
  /** Null = me (my own colour). */
  readonly ink: Ink | null;
  readonly undoStack: readonly Action[];
  readonly redoStack: readonly Action[];
  /** Latest problem to show (cleared by the next successful edit or by dismissing it). */
  readonly message: string | null;
  setPlanning(on: boolean): void;
  setTool(tool: PlanTool): void;
  setInk(ink: Ink | null): void;
  setMessage(message: string | null): void;
  /** Applies and sends one user action. Resolves true when the server accepted all of it. */
  run(ops: readonly PlanEditOp[], myId: string): Promise<boolean>;
  undo(myId: string): Promise<void>;
  redo(myId: string): Promise<void>;
  reset(): void;
}

const initial = {
  planning: false,
  tool: "move" as PlanTool,
  ink: null,
  undoStack: [],
  redoStack: [],
  message: null,
};

/** Actions are sent strictly one after another. */
let queue: Promise<unknown> = Promise.resolve();

export const usePlanEditor = create<PlanEditorState>()((set, get) => {
  /** Shows and sends `ops`; returns the ops that undo them, or null if it didn't save. */
  async function send(ops: readonly PlanEditOp[], myId: string): Promise<PlanEditOp[] | null> {
    if (ops.length === 0) return [];
    const store = usePlanStore.getState();
    const before = store.plan ?? EMPTY_PLAN;
    let undo: PlanEditOp[];
    try {
      undo = inverseOfAction(ops, before, myId, applyPlanEdit);
      for (const op of ops) usePlanStore.getState().applyLocal(op, myId);
    } catch (error) {
      // An edit the plan can't take (e.g. over the limit): nothing was sent.
      set({ message: error instanceof Error ? error.message : "That edit isn't possible." });
      usePlanStore.getState().markStale();
      return null;
    }
    try {
      await sendPlanEdits(ops);
      set({ message: null });
      return undo;
    } catch (error) {
      logger.warn("plan: edit failed", error);
      set({ message: error instanceof PlanEditError ? error.message : "The plan didn't save. Try again." });
      usePlanStore.getState().markStale();
      return null;
    }
  }

  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const next = queue.then(job, job);
    queue = next.catch(() => undefined);
    return next;
  };

  return {
    ...initial,
    setPlanning: (planning) => set(planning ? { planning } : { planning, tool: "move" }),
    setTool: (tool) => set({ tool }),
    setInk: (ink) => set({ ink }),
    setMessage: (message) => set({ message }),
    run: (ops, myId) =>
      enqueue(async () => {
        const undo = await send(ops, myId);
        if (!undo) return false;
        if (ops.length > 0)
          set((s) => ({ undoStack: [...s.undoStack, { ops, undo }].slice(-MAX_HISTORY), redoStack: [] }));
        return true;
      }),
    undo: (myId) =>
      enqueue(async () => {
        const action = get().undoStack[get().undoStack.length - 1];
        if (!action) return;
        const redo = await send(action.undo, myId);
        if (!redo) return;
        set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, action] }));
      }),
    redo: (myId) =>
      enqueue(async () => {
        const action = get().redoStack[get().redoStack.length - 1];
        if (!action) return;
        const undo = await send(action.ops, myId);
        if (!undo) return;
        set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, { ops: action.ops, undo }] }));
      }),
    reset: () => set({ ...initial }),
  };
});
