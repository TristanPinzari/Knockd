/**
 * Sends planning edits over the session socket (`plan:edit` with an acknowledgement, API.md
 * "Planning"). Edits need a connection: they aren't queued offline, so a failure is reported to the
 * caller to show. Everyone (including us) then gets `plan:updated` with the new plan.
 */
import type { PlanEditOp } from "@knockd/shared";

/** How long to wait for the server to acknowledge one edit. */
export const PLAN_EDIT_TIMEOUT_MS = 8000;

type Ack = { ok: true } | { ok: false; error?: string };

export interface PlanSocket {
  readonly connected: boolean;
  emit(event: "plan:edit", op: PlanEditOp, ack: (res: Ack) => void): unknown;
}

export class PlanEditError extends Error {}

let current: PlanSocket | null = null;

/** Called by the session socket hook when it connects (and with null when it closes). */
export function setPlanSocket(socket: PlanSocket | null): void {
  current = socket;
}

function sendOne(socket: PlanSocket, op: PlanEditOp, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new PlanEditError("The server didn't answer. Try again.")), timeoutMs);
    socket.emit("plan:edit", op, (res) => {
      clearTimeout(timer);
      if (res?.ok) resolve();
      else reject(new PlanEditError(res?.error ?? "The plan didn't save. Try again."));
    });
  });
}

/** Sends the edits in order, stopping at the first one that fails. */
export async function sendPlanEdits(
  ops: readonly PlanEditOp[],
  socket: PlanSocket | null = current,
  timeoutMs: number = PLAN_EDIT_TIMEOUT_MS,
): Promise<void> {
  if (!socket || !socket.connected) throw new PlanEditError("You're offline, so the plan can't be changed right now.");
  for (const op of ops) await sendOne(socket, op, timeoutMs);
}
