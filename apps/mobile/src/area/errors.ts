import { ApiRequestError, NetworkError, ResponseShapeError } from "../realtime/errors";

/** Short, user-facing text for a failed area/plan/stats request. */
export function friendlyAreaError(error: unknown): string {
  if (error instanceof NetworkError) return "You're offline. The map will fill in when you reconnect.";
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "Your session expired. Rejoin to keep the map up to date.";
    if (error.status === 404 || error.status === 410) return "This session has ended.";
    if (error.status >= 500) return "The server is having trouble. Retrying shortly.";
    return "Couldn't load the map area.";
  }
  if (error instanceof ResponseShapeError) return "The map data looked wrong. Retrying shortly.";
  return "Couldn't load the map area.";
}
