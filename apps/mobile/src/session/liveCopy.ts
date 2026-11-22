/** Copy for the Session tab's sync line and "passed you" banner. */
import type { OvertakeEvent } from "../realtime/stores/overtakeStore";

/** "3 items waiting to sync" style copy; null when nothing is waiting. */
export function pendingLabel(pending: number): string | null {
  if (pending <= 0) return null;
  return pending === 1 ? "1 update waiting to sync" : `${pending} updates waiting to sync`;
}

export function overtakeCopy(event: OvertakeEvent): { title: string; detail: string } {
  const behind = Math.max(0, event.theirLeads - event.myLeads);
  const detail =
    behind === 0
      ? "You're level on leads. One more puts you ahead."
      : `${behind} ${behind === 1 ? "lead" : "leads"} behind. Keep knocking to take it back.`;
  return { title: `${event.name} passed you`, detail };
}
