/**
 * End of day (README "End-of-day stats"): plain stats per person and for the crew. Pure helpers
 * for the End of day screen; the loading lives in useEndOfDay.
 */
import type { Member, SessionStatsRes, Stats } from "@knockd/shared";

export interface PersonStats {
  readonly memberId: string;
  readonly name: string;
  readonly colour: string;
  readonly isMe: boolean;
  readonly isBot: boolean;
  readonly stats: Stats;
}

/** Score for the order: A leads count most, then B, then C, then houses covered. */
const rank = (s: Stats) => s.leads.A * 1e6 + s.leads.B * 1e4 + s.leads.C * 1e2 + s.housesCovered / 1e3;

/**
 * Everyone's stats with their name and colour, best first. People who left the session (not in
 * `members` any more) still count, as "A teammate".
 */
export function personRows(stats: SessionStatsRes, members: readonly Member[], myId: string): PersonStats[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  return stats.members
    .map((s) => {
      const { memberId, ...rest } = s;
      const m = byId.get(memberId);
      return {
        memberId,
        name: m?.displayName ?? "A teammate",
        colour: m?.colour ?? "#9AA3AD",
        isMe: memberId === myId,
        isBot: m?.isBot ?? false,
        stats: rest,
      };
    })
    .sort((a, b) => rank(b.stats) - rank(a.stats) || a.name.localeCompare(b.name));
}

export const totalLeads = (s: Stats) => s.leads.A + s.leads.B + s.leads.C;

/** "2.4 km" / "850 m". */
export function distanceLabel(metres: number): string {
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}

/** "2 h 15 min" / "40 min". */
export function activeLabel(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

/** "3 A · 1 B" (only the grades that happened), or "No leads". */
export function leadsLabel(s: Stats): string {
  const parts = (["A", "B", "C"] as const).filter((g) => s.leads[g] > 0).map((g) => `${s.leads[g]} ${g}`);
  return parts.length ? parts.join(" · ") : "No leads";
}
