/**
 * Socket.io: one room per session. Clients connect with `auth: { token }` (their session token).
 * Mostly server → client broadcasts; routes call emitToSession() after writing to the database.
 */
import type { Server as HttpServer } from "node:http";
import { and, eq, isNull } from "drizzle-orm";
import { Server } from "socket.io";
import { SocketAuth, type ClientToServerEvents, type ServerToClientEvents } from "@knockd/shared";
import { verifySessionToken, type SessionClaims } from "../auth/session-token";
import { db } from "../db/client";
import { sessionMembers } from "../db/schema";
import { corsOrigin } from "../http/cors";
import { logger } from "../logger";

type SocketData = SessionClaims;
type KnockdServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

let io: KnockdServer | null = null;

/** sessionId → memberId → number of open sockets (a member can have more than one device/tab). */
const presence = new Map<string, Map<string, number>>();

const room = (sessionId: string) => `session:${sessionId}`;

export function isOnline(sessionId: string, memberId: string): boolean {
  return (presence.get(sessionId)?.get(memberId) ?? 0) > 0;
}

/** Broadcast to everyone in a session. */
export function emitToSession<E extends keyof ServerToClientEvents>(
  sessionId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  io?.to(room(sessionId)).emit(event, ...args);
}

/** Force-disconnect a member's sockets (used when they're removed from a session). */
export async function disconnectMember(sessionId: string, memberId: string): Promise<void> {
  if (!io) return;
  const sockets = await io.in(room(sessionId)).fetchSockets();
  for (const s of sockets) if (s.data.memberId === memberId) s.disconnect(true);
}

export function createRealtime(server: HttpServer): KnockdServer {
  io = new Server(server, { cors: { origin: corsOrigin }, serveClient: false });

  io.use(async (socket, next) => {
    const auth = SocketAuth.safeParse(socket.handshake.auth);
    const claims = auth.success ? await verifySessionToken(auth.data.token) : null;
    if (!claims) return next(new Error("unauthorized"));
    const [member] = await db
      .select({ id: sessionMembers.id })
      .from(sessionMembers)
      .where(
        and(
          eq(sessionMembers.id, claims.memberId),
          eq(sessionMembers.sessionId, claims.sessionId),
          isNull(sessionMembers.removedAt),
        ),
      );
    if (!member) return next(new Error("unauthorized"));
    socket.data = claims;
    next();
  });

  io.on("connection", (socket) => {
    const { sessionId, memberId } = socket.data;
    void socket.join(room(sessionId));

    const members = presence.get(sessionId) ?? new Map<string, number>();
    presence.set(sessionId, members);
    const count = (members.get(memberId) ?? 0) + 1;
    members.set(memberId, count);
    if (count === 1) emitToSession(sessionId, "member:status", { memberId, online: true });
    logger.debug({ sessionId, memberId }, "socket connected");

    socket.on("disconnect", () => {
      const remaining = (members.get(memberId) ?? 1) - 1;
      if (remaining > 0) {
        members.set(memberId, remaining);
        return;
      }
      members.delete(memberId);
      if (members.size === 0) presence.delete(sessionId);
      emitToSession(sessionId, "member:status", { memberId, online: false });
      logger.debug({ sessionId, memberId }, "socket disconnected");
    });
  });

  return io;
}

export async function closeRealtime(): Promise<void> {
  await io?.close();
  io = null;
}
