/**
 * Maps every server -> client socket event (packages/shared/src/socket.ts) onto the stores.
 * Payloads are validated with the shared zod schemas; bad payloads are logged and ignored.
 */
import { z } from "zod";
import { Lead, Member, Message, Pin, PlanContent, Position, Uuid, type ServerToClientEvents } from "@knockd/shared";
import { useTrailsStore } from "../trails/trailsStore";
import { logger } from "./logger";
import { useChatStore } from "./stores/chatStore";
import { useCrewStore } from "./stores/crewStore";
import { useLeadsStore } from "./stores/leadsStore";
import { usePinsStore } from "./stores/pinsStore";
import { usePlanStore } from "./stores/planStore";
import { useSessionStore } from "./stores/sessionStore";

const LivePositions = z.array(Position.extend({ memberId: Uuid }));

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown, event: string): z.infer<S> | null {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  logger.warn(`socket: ignoring malformed "${event}" payload`, result.error.issues[0]?.message);
  return null;
}

export function createStoreHandlers(now: () => number = Date.now): ServerToClientEvents {
  const me = (): string | null => useCrewStore.getState().myMemberId;
  return {
    "member:joined": (p) => {
      const member = parse(Member, p?.member, "member:joined");
      if (member) useCrewStore.getState().memberJoined(member);
    },
    "member:left": (p) => useCrewStore.getState().memberLeft(p.memberId),
    "member:status": (p) => useCrewStore.getState().setOnline(p.memberId, p.online, now()),
    positions: (p) => {
      const positions = parse(LivePositions, p?.positions, "positions");
      if (!positions || positions.length === 0) return;
      const timed = positions.map((x) => ({ memberId: x.memberId, lat: x.lat, lng: x.lng, t: Date.parse(x.t) }));
      useCrewStore.getState().applyPositions(timed);
      useTrailsStore.getState().appendPositions(timed);
    },
    "lead:new": (p) => {
      const lead = parse(Lead, p?.lead, "lead:new");
      if (!lead) return;
      const isNew = !useLeadsStore.getState().leads[lead.clientId];
      useLeadsStore.getState().upsert(lead);
      if (isNew && lead.memberId !== me()) useLeadsStore.getState().showAlert({ lead, memberName: p.memberName });
    },
    "lead:updated": (p) => {
      const lead = parse(Lead, p?.lead, "lead:updated");
      if (lead) useLeadsStore.getState().upsert(lead);
    },
    "lead:removed": (p) => useLeadsStore.getState().remove(p.clientId),
    "pin:new": (p) => {
      const pin = parse(Pin, p?.pin, "pin:new");
      if (pin) usePinsStore.getState().upsert(pin);
    },
    "pin:removed": (p) => usePinsStore.getState().remove(p.clientId),
    "message:new": (p) => {
      const message = parse(Message, p?.message, "message:new");
      if (message) useChatStore.getState().receive(message, me());
    },
    "plan:updated": (p) => {
      const plan = parse(PlanContent, p?.plan, "plan:updated");
      const version = typeof p?.version === "number" && Number.isInteger(p.version) ? p.version : null;
      if (plan && version !== null)
        usePlanStore.getState().applyUpdate(plan, version, typeof p.editedBy === "string" ? p.editedBy : null);
    },
    "session:ended": () => useSessionStore.getState().setStatus("ended"),
    "session:processed": () => useSessionStore.getState().setStatus("processed"),
  };
}
