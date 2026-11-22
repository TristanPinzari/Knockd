import { colors } from "@/theme";

export interface MockMember {
  id: string;
  name: string;
  initials: string;
  colour: string;
  isHost: boolean;
  isMe: boolean;
  houses: number;
  leads: { a: number; b: number; c: number };
  progress: number;
  successRate: number;
}

export const DEMO_CENTRE: [number, number] = [-81.3425, 42.955];
export const TEAM_NAME = "London Painters";
export const JOIN_CODE = "KNK-4821";

export const crew: readonly MockMember[] = [
  {
    id: "m-jas",
    name: "Jas K.",
    initials: "JK",
    colour: colors.crew.blue,
    isHost: true,
    isMe: true,
    houses: 104,
    leads: { a: 2, b: 4, c: 2 },
    progress: 0.64,
    successRate: 0.058,
  },
  {
    id: "m-sam",
    name: "Sam M.",
    initials: "SM",
    colour: colors.crew.green,
    isHost: false,
    isMe: false,
    houses: 112,
    leads: { a: 3, b: 4, c: 2 },
    progress: 0.48,
    successRate: 0.063,
  },
  {
    id: "m-ava",
    name: "Ava V.",
    initials: "AV",
    colour: colors.crew.purple,
    isHost: false,
    isMe: false,
    houses: 86,
    leads: { a: 1, b: 2, c: 2 },
    progress: 0.3,
    successRate: 0.035,
  },
  {
    id: "m-leo",
    name: "Leo P.",
    initials: "LP",
    colour: colors.crew.pink,
    isHost: false,
    isMe: false,
    houses: 61,
    leads: { a: 1, b: 1, c: 1 },
    progress: 0.12,
    successRate: 0.033,
  },
];

export const leadTotal = (member: MockMember): number => member.leads.a + member.leads.b + member.leads.c;
