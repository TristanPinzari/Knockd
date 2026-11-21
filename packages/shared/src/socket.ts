/**
 * Socket.io event contract. Use as generics:
 *   server: new Server<ClientToServerEvents, ServerToClientEvents>()
 *   client: io(url) as Socket<ServerToClientEvents, ClientToServerEvents>
 */
import { z } from "zod";
import { RefId, Uuid } from "./common";
import type { Lead, Member, Message, Pin, PlanContent, Position } from "./entities";
import { DrawingInput, NoteInput } from "./entities";

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
  /** The session plan changed (anyone's edit). Replace your copy. */
  "plan:updated": (p: { plan: PlanContent; editedBy: string }) => void;
  "session:ended": () => void;
  /** The upload prompt can show now. */
  "session:processed": () => void;
}

// ---------- Client → server ----------

export const PlanEditOp = z.discriminatedUnion("op", [
  /** Claim a block for a member (yourself or a teammate). Two members on one block = a pair. */
  z.object({ op: z.literal("claim"), blockId: RefId, memberId: Uuid }),
  /** Claim several blocks at once for one member. */
  z.object({ op: z.literal("claimMany"), blockIds: z.array(RefId).min(1).max(200), memberId: Uuid }),
  z.object({ op: z.literal("unclaim"), blockId: RefId, memberId: Uuid }),
  /** Add or replace (same id) a route or freehand line. */
  z.object({ op: z.literal("draw"), stroke: DrawingInput }),
  z.object({ op: z.literal("erase"), drawingId: Uuid }),
  /** Add or replace (same id) a note. */
  z.object({ op: z.literal("note"), note: NoteInput }),
  z.object({ op: z.literal("removeNote"), noteId: Uuid }),
  /** Remove everything you made: your claims, drawings and notes. Teammates' items stay. */
  z.object({ op: z.literal("clearMine") }),
]);
export type PlanEditOp = z.infer<typeof PlanEditOp>;

export type Ack = (res: { ok: true } | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  "plan:edit": (op: PlanEditOp, ack?: Ack) => void;
}
