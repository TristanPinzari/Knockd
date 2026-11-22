import { useMemo } from "react";
import type { Grade, Lead } from "@knockd/shared";
import { useCrewStore, type CrewMember } from "./stores/crewStore";
import { useLeadsStore } from "./stores/leadsStore";

export interface LeaderboardRow {
  memberId: string;
  name: string;
  colour: string;
  initials: string;
  isMe: boolean;
  counts: Readonly<Record<Grade, number>>;
  total: number;
  /** 1-based; members level on A, B and C leads share a rank. */
  rank: number;
}

/** Ranks the crew by leads (total, then A, then B, then name). Everyone is listed, even with none. */
export function computeLeaderboard(
  members: readonly CrewMember[],
  leads: readonly Lead[],
  myMemberId: string | null,
): LeaderboardRow[] {
  const rows: Omit<LeaderboardRow, "rank">[] = members.map((m) => {
    const counts: Record<Grade, number> = { A: 0, B: 0, C: 0 };
    for (const lead of leads) if (lead.memberId === m.id) counts[lead.grade] += 1;
    return {
      memberId: m.id,
      name: m.name,
      colour: m.colour,
      initials: m.initials,
      isMe: m.id === myMemberId,
      counts,
      total: counts.A + counts.B + counts.C,
    };
  });
  rows.sort(
    (a, b) =>
      b.total - a.total ||
      b.counts.A - a.counts.A ||
      b.counts.B - a.counts.B ||
      a.name.localeCompare(b.name) ||
      a.memberId.localeCompare(b.memberId),
  );
  const ranked: LeaderboardRow[] = [];
  rows.forEach((row, i) => {
    const prev = ranked[i - 1];
    const tied = prev && prev.total === row.total && prev.counts.A === row.counts.A && prev.counts.B === row.counts.B;
    ranked.push({ ...row, rank: prev && tied ? prev.rank : i + 1 });
  });
  return ranked;
}

/** Leads per member by grade, ranked. Recomputes only when the crew or the leads change. */
export function useLeaderboard(): LeaderboardRow[] {
  const members = useCrewStore((s) => s.members);
  const myMemberId = useCrewStore((s) => s.myMemberId);
  const leads = useLeadsStore((s) => s.leads);
  return useMemo(
    () => computeLeaderboard(Object.values(members), Object.values(leads), myMemberId),
    [members, leads, myMemberId],
  );
}
