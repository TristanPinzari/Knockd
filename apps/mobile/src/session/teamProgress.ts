/**
 * Team progress (MOBILE.md screen 9): the in-session leaderboard and coverage so far. Pure helpers;
 * the sheet is src/ui/progress/TeamProgressSheet.tsx.
 */
import type { SessionStatsRes } from "@knockd/shared";
import type { LeaderboardRow } from "../realtime/leaderboard";
import type { OvertakeEvent } from "../realtime/stores/overtakeStore";
import { ordinal } from "../ui/format";

/** "Sam passed you" / "You're now 2nd in leads. 2 leads to take it back." */
export function passedCopy(event: OvertakeEvent, rows: readonly LeaderboardRow[]): { title: string; detail: string } {
  const mine = rows.find((r) => r.isMe);
  const need = Math.max(1, event.theirLeads - event.myLeads + 1);
  const place = mine ? `You're now ${ordinal(mine.rank)} in leads. ` : "";
  return {
    title: `${event.name} passed you`,
    detail: `${place}${need} lead${need === 1 ? "" : "s"} to take it back.`,
  };
}

/** Houses each person has covered so far (from GET /stats, refreshed every 30 s and on new leads). */
export function housesByMember(stats: SessionStatsRes | null): Readonly<Record<string, number>> {
  return Object.fromEntries((stats?.members ?? []).map((m) => [m.memberId, m.housesCovered]));
}
