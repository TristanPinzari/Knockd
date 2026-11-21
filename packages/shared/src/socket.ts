/**
 * Socket.io event contract. Use as generics:
 *   server: new Server<ClientToServerEvents, ServerToClientEvents>()
 *   client: io(url) as Socket<ServerToClientEvents, ClientToServerEvents>
 */
import { z } from "zod";
import { RefId, Uuid } from "./common";
import type { Lead, Member, Message, Pin, PlanContent, Position } from "./entities";
import { Drawing, Note, PlanGroup } from "./entities";

/** Sent as `io(url, { auth: SocketAuth })` */
export const SocketAuth = z.object({ token: z.string() });
export type SocketAuth = z.infer<typeof SocketAuth>;

// ---------- Server → client ----------

export interface ServerToClientEvents {
  "member:joined": (p: { member: Member }) => void;
  "member:left": (p: { memberId: string }) => void;
  "member:status": (p: { memberId: string; online: boolean }) => void;
  positions: (p: { positions: (Position & { memberId: string })[] }) => void;
  "lead:new": (p: { lead: Lead; memberName: string }) => void;
  "lead:updated": (p: { lead: Lead }) => void;
  "lead:removed": (p: { clientId: string }) => void;
  "pin:new": (p: { pin: Pin }) => void;
  "pin:removed": (p: { clientId: string }) => void;
  "message:new": (p: { message: Message }) => void;
  "plan:draft": (p: { draft: PlanContent; editedBy: string }) => void;
  "plan:applied": (p: { plan: PlanContent }) => void;
  "session:ended": () => void;
  /** The upload prompt can show now. */
  "session:processed": () => void;
}

// ---------- Client → server ----------

export const PlanEditOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("assign"), blockId: RefId, groupIndex: z.number().int().nonnegative() }),
  z.object({ op: z.literal("unassign"), blockId: RefId }),
  z.object({ op: z.literal("setGroups"), groups: z.array(PlanGroup) }),
  z.object({ op: z.literal("draw"), stroke: Drawing }),
  z.object({ op: z.literal("erase"), drawingId: Uuid }),
  z.object({ op: z.literal("note"), note: Note }),
  z.object({ op: z.literal("removeNote"), noteId: Uuid }),
  z.object({ op: z.literal("clear") }),
]);
export type PlanEditOp = z.infer<typeof PlanEditOp>;

export type Ack = (res: { ok: true } | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  "plan:edit": (op: PlanEditOp, ack?: Ack) => void;
}
