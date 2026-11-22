import { crew, leadTotal } from "./crew";

export interface LeaderboardRow {
  rank: number;
  memberId: string;
  name: string;
  initials: string;
  colour: string;
  isMe: boolean;
  leads: number;
  detail: string;
  trend: "up" | "down";
}

const LEADS_SHOWN = [9, 8, 5, 3] as const;
const DETAILS = ["112 houses, 3 A / 4 B / 2 C", "104 houses, 2 A / 4 B / 2 C", "86 houses", "61 houses"] as const;
const TRENDS = ["up", "down", "up", "down"] as const;

export const leaderboard: readonly LeaderboardRow[] = [...crew]
  .sort((a, b) => leadTotal(b) - leadTotal(a))
  .map((member, index) => ({
    rank: index + 1,
    memberId: member.id,
    name: member.name,
    initials: member.initials,
    colour: member.colour,
    isMe: member.isMe,
    leads: LEADS_SHOWN[index] ?? 0,
    detail: DETAILS[index] ?? "",
    trend: TRENDS[index] ?? "up",
  }));

export const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "all", label: "All time" },
] as const;

export const METRICS = [
  { value: "leads", label: "Leads" },
  { value: "houses", label: "Houses" },
  { value: "rate", label: "Success rate" },
] as const;

export const HOUSES_PER_DAY = [
  { day: "M", value: 0.55 },
  { day: "T", value: 0.8 },
  { day: "W", value: 0.38 },
  { day: "T", value: 1, highlight: true },
  { day: "F", value: 0.7 },
  { day: "S", value: 0.3 },
  { day: "S", value: 0.78 },
] as const;

export const STATS_TOTALS = { houses: "363", leads: "18", successRate: "5.0%" } as const;
