/** User-facing copy for the session lifecycle calls (join, create, simulated crew, end/leave). */
import { ApiRequestError, NetworkError, ResponseShapeError } from "../realtime/errors";

export type SessionAction = "join" | "create" | "startSim" | "end" | "leave";

const OFFLINE = "You're offline. Check your connection and try again.";
const SERVER_SHAPE = "The server sent something unexpected. Try again in a moment.";
const GENERIC: Record<SessionAction, string> = {
  join: "Could not join the session. Try again.",
  create: "Could not create the session. Try again.",
  startSim: "Could not start the simulated crew. Try again.",
  end: "Could not end the session. Try again.",
  leave: "Could not leave the session. Try again.",
};

function apiMessage(action: SessionAction, error: ApiRequestError): string | null {
  if (action === "join") {
    if (error.status === 404) return "No session with that code. Check it with your crew.";
    if (error.status === 409) return "That session is full (8 people max).";
    if (error.status === 410) return "That session has already ended.";
    if (error.status === 400) return "Check the code and your name, then try again.";
  }
  if (action === "startSim") {
    if (error.status === 409) {
      return error.code === "session_full"
        ? "Not enough room: a session holds 8 people, bots included."
        : "The simulated crew is already running.";
    }
    if (error.status === 400) return "No houses in this area yet, so the bots have nowhere to walk.";
    if (error.status === 403) return "Only the host can start the simulated crew.";
  }
  if (action === "create" && error.status === 400) return "That area can't be used. Try a different one.";
  if (action === "end" && error.status === 403) return "Only the host can end the session.";
  if (error.status === 410) return "This session has already ended.";
  if (error.status === 429) return "Too many tries. Wait a moment and try again.";
  return null;
}

export function sessionErrorMessage(action: SessionAction, error: unknown): string {
  if (error instanceof NetworkError) return OFFLINE;
  if (error instanceof ResponseShapeError) return SERVER_SHAPE;
  if (error instanceof ApiRequestError) return apiMessage(action, error) ?? GENERIC[action];
  return GENERIC[action];
}

/** True when the server says the session is gone, so local state can be cleared anyway. */
export function isSessionGone(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 404 || error.status === 410);
}
