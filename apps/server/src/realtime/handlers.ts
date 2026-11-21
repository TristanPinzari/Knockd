/** Client → server socket events. Registered for each authenticated socket. */
import { PlanEditOp } from "@knockd/shared";
import { HttpError } from "../http/errors";
import { logger } from "../logger";
import { editDraft } from "../sessions/planning";
import type { KnockdSocket } from "./io";

export function registerHandlers(socket: KnockdSocket): void {
  const { sessionId, memberId } = socket.data;

  socket.on("plan:edit", async (raw, ack) => {
    const op = PlanEditOp.safeParse(raw);
    if (!op.success) {
      ack?.({ ok: false, error: op.error.issues.map((i) => i.message).join("; ") });
      return;
    }
    try {
      await editDraft(sessionId, memberId, op.data);
      ack?.({ ok: true });
    } catch (err) {
      if (!(err instanceof HttpError)) logger.error({ err, sessionId }, "plan:edit failed");
      ack?.({ ok: false, error: err instanceof HttpError ? err.message : "Something went wrong" });
    }
  });
}
