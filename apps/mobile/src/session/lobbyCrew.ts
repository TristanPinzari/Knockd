/** Rows for the Lobby crew list, from the live roster. */
import { useMemo } from "react";
import { useCrewStore, type CrewMember } from "../realtime/stores/crewStore";
import { useActiveSession, type ActiveSession } from "./activeSessionStore";

export interface LobbyRow {
  id: string;
  name: string;
  initials: string;
  colour: string;
  isHost: boolean;
  isMe: boolean;
  isBot: boolean;
  online: boolean;
}

/** Me first, then everyone else by name. */
export function toLobbyRows(members: readonly CrewMember[], active: ActiveSession): LobbyRow[] {
  const rows = members.map((m) => ({
    id: m.id,
    name: m.name,
    initials: m.initials,
    colour: m.colour,
    isMe: m.id === active.memberId,
    // TODO(session): the snapshot knows createdByMemberId; expose it from the realtime store to mark other hosts.
    isHost: m.id === active.memberId && active.isAdmin,
    isBot: m.isBot,
    online: m.online,
  }));
  return [...rows].sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
}

export function useLobbyCrew(): readonly LobbyRow[] {
  const active = useActiveSession((s) => s.active);
  const members = useCrewStore((s) => s.members);
  return useMemo(() => (active ? toLobbyRows(Object.values(members), active) : []), [active, members]);
}
