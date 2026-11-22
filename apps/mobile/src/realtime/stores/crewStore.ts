import { create } from "zustand";
import { distanceM, type Member } from "@knockd/shared";

export interface CrewPosition {
  lat: number;
  lng: number;
  /** ms since epoch */
  t: number;
}

export interface CrewMember {
  id: string;
  name: string;
  colour: string;
  initials: string;
  isBot: boolean;
  online: boolean;
  position: CrewPosition | null;
  /** From the last two points; null until there are two. */
  speedKmh: number | null;
  /** ms since epoch of the newest sign of life (position or going online). */
  lastSeenMs: number | null;
}

export interface LivePosition {
  memberId: string;
  lat: number;
  lng: number;
  t: number;
}

/** Longest gap between two points that still gives a meaningful speed. */
const MAX_SPEED_GAP_MS = 120_000;

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function speedKmhBetween(a: CrewPosition, b: CrewPosition): number | null {
  const dt = (b.t - a.t) / 1000;
  if (dt <= 0 || dt * 1000 > MAX_SPEED_GAP_MS) return null;
  return Math.round((distanceM(a, b) / dt) * 3.6 * 10) / 10;
}

export function memberFromApi(m: Member): CrewMember {
  const position = m.lastPosition
    ? { lat: m.lastPosition.lat, lng: m.lastPosition.lng, t: Date.parse(m.lastPosition.t) }
    : null;
  return {
    id: m.id,
    name: m.displayName,
    colour: m.colour,
    initials: initialsOf(m.displayName),
    isBot: m.isBot,
    online: m.online,
    position,
    speedKmh: null,
    lastSeenMs: position?.t ?? null,
  };
}

interface CrewState {
  myMemberId: string | null;
  members: Readonly<Record<string, CrewMember>>;
  setMe: (memberId: string | null) => void;
  /** Snapshot: replaces the roster but keeps live speed for members we already track. */
  seed: (members: readonly Member[]) => void;
  memberJoined: (member: Member) => void;
  memberLeft: (memberId: string) => void;
  setOnline: (memberId: string, online: boolean, nowMs: number) => void;
  applyPositions: (positions: readonly LivePosition[]) => void;
  reset: () => void;
}

export const useCrewStore = create<CrewState>()((set) => ({
  myMemberId: null,
  members: {},
  setMe: (myMemberId) => set({ myMemberId }),
  seed: (incoming) =>
    set((s) => ({
      members: Object.fromEntries(
        incoming.map((m) => {
          const fresh = memberFromApi(m);
          const known = s.members[m.id];
          const keepLive = known?.position && fresh.position && known.position.t > fresh.position.t;
          return [
            m.id,
            keepLive
              ? { ...fresh, position: known.position, speedKmh: known.speedKmh, lastSeenMs: known.lastSeenMs }
              : fresh,
          ];
        }),
      ),
    })),
  memberJoined: (member) => set((s) => ({ members: { ...s.members, [member.id]: memberFromApi(member) } })),
  memberLeft: (memberId) =>
    set((s) => {
      const { [memberId]: _gone, ...rest } = s.members;
      return { members: rest };
    }),
  setOnline: (memberId, online, nowMs) =>
    set((s) => {
      const m = s.members[memberId];
      if (!m) return s;
      return { members: { ...s.members, [memberId]: { ...m, online, lastSeenMs: online ? nowMs : m.lastSeenMs } } };
    }),
  applyPositions: (positions) =>
    set((s) => {
      const sorted = [...positions].sort((a, b) => a.t - b.t);
      let members = s.members;
      for (const p of sorted) {
        const m = members[p.memberId];
        if (!m) continue;
        if (m.position && p.t <= m.position.t) continue; // stale or duplicate
        const position = { lat: p.lat, lng: p.lng, t: p.t };
        const speedKmh = m.position ? speedKmhBetween(m.position, position) : null;
        members = { ...members, [p.memberId]: { ...m, position, speedKmh, lastSeenMs: p.t } };
      }
      return members === s.members ? s : { members };
    }),
  reset: () => set({ myMemberId: null, members: {} }),
}));
