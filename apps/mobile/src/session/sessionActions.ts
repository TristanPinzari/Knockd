/**
 * The in-session writes (leads, pins, chat) for the active session, wired to the offline queue:
 * each write is queued on the phone first, shown straight away, then sent (MOBILE.md "Offline queue").
 */
import { createSessionActions, type SessionActions } from "../realtime/actions";
import { logger } from "../realtime/logger";
import { getRuntime } from "../realtime/runtime";
import { useActiveSession } from "./activeSessionStore";

async function actionsForActiveSession(): Promise<SessionActions> {
  const active = useActiveSession.getState().active;
  if (!active) throw new Error("You're not in a session.");
  const { outbox, flusher } = await getRuntime();
  return createSessionActions({
    outbox,
    sessionId: active.sessionId,
    kickFlush: () =>
      void flusher.flush(active.sessionId, active.token).catch((error: unknown) => logger.warn("flush failed", error)),
  });
}

/** Stable functions screens can call; each resolves the active session when it runs. */
export const sessionActions: SessionActions = {
  markLead: async (input) => (await actionsForActiveSession()).markLead(input),
  editLead: async (clientId, change) => (await actionsForActiveSession()).editLead(clientId, change),
  undoLead: async (clientId) => (await actionsForActiveSession()).undoLead(clientId),
  sendMessage: async (body) => (await actionsForActiveSession()).sendMessage(body),
  dropPin: async (pin) => (await actionsForActiveSession()).dropPin(pin),
  removePin: async (clientId) => (await actionsForActiveSession()).removePin(clientId),
};
