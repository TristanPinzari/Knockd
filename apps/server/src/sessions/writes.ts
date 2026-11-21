/**
 * In-session writes: pings, leads, pins, chat. Every create is idempotent on the client's ID,
 * so the phone's offline queue can safely retry. Each write is broadcast to the session.
 */
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import {
  SNAPSHOT_MESSAGE_LIMIT,
  type Lead,
  type Message,
  type PatchLeadBody,
  type Pin,
  type PostLeadBody,
  type PostMessageBody,
  type PostPinBody,
  type PostPingsBody,
} from "@knockd/shared";
import { db } from "../db/client";
import { chatMessages, leads, pings, pins, sessionMembers, sessions } from "../db/schema";
import { HttpError, notFound } from "../http/errors";
import { emitToSession } from "../realtime/io";
import { toLead, toMessage, toPin } from "./dto";

/** Pings more than this far in the future (bad phone clock) are dropped. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

/**
 * Writes are accepted while the session is live and after it ends (late offline uploads),
 * but not once it's been processed, since the results are already computed.
 */
async function assertWritable(sessionId: string): Promise<{ startedAt: Date }> {
  const [s] = await db
    .select({ status: sessions.status, startedAt: sessions.startedAt })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!s) throw new HttpError(404, "session_not_found", "Session not found");
  if (s.status === "processed") throw new HttpError(410, "session_ended", "This session has been finalised");
  return s;
}

const pointSql = (lat: number, lng: number) => sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;

// ============================== Pings ==============================

export async function addPings(sessionId: string, memberId: string, body: PostPingsBody): Promise<number> {
  const { startedAt } = await assertWritable(sessionId);
  const now = Date.now();
  const earliest = startedAt.getTime() - 60 * 60_000; // allow an hour before start (clock drift, early arrival)
  const valid = body.pings.filter((p) => {
    const t = Date.parse(p.t);
    return t >= earliest && t <= now + MAX_CLOCK_SKEW_MS;
  });
  if (!valid.length) return 0;

  const inserted = await db
    .insert(pings)
    .values(
      valid.map((p) => ({
        time: new Date(p.t),
        sessionId,
        memberId,
        clientId: p.clientId,
        location: pointSql(p.lat, p.lng),
        accuracyM: p.accuracy,
      })),
    )
    .onConflictDoNothing({ target: [pings.clientId, pings.time] })
    .returning({ clientId: pings.clientId });

  // Broadcast this member's newest position from the batch. Clients ignore positions older than what they have.
  const latest = valid.reduce((a, b) => (Date.parse(b.t) > Date.parse(a.t) ? b : a));
  emitToSession(sessionId, "positions", { positions: [{ memberId, lat: latest.lat, lng: latest.lng, t: latest.t }] });

  return inserted.length;
}

// ============================== Leads ==============================

export async function addLead(sessionId: string, memberId: string, body: PostLeadBody): Promise<Lead> {
  await assertWritable(sessionId);
  const at = new Date(body.t);
  let inserted: (typeof leads.$inferSelect)[];
  try {
    inserted = await db
      .insert(leads)
      .values({
        id: body.clientId,
        sessionId,
        memberId,
        houseId: body.houseId,
        grade: body.grade,
        note: body.note || null,
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoNothing()
      .returning();
  } catch (err) {
    if (pgCode(err) === "23503") throw new HttpError(400, "invalid_request", `Unknown house ${body.houseId}`);
    throw err;
  }

  if (inserted[0]) {
    const lead = toLead(inserted[0]);
    emitToSession(sessionId, "lead:new", { lead, memberName: await memberName(memberId) });
    return lead;
  }
  // Retry of a lead we already have: return it unchanged.
  const [existing] = await db.select().from(leads).where(eq(leads.id, body.clientId));
  if (!existing || existing.sessionId !== sessionId) throw new HttpError(409, "conflict", "Lead ID already used");
  return toLead(existing);
}

export async function updateLead(sessionId: string, clientId: string, body: PatchLeadBody): Promise<Lead> {
  await assertWritable(sessionId);
  const [updated] = await db
    .update(leads)
    .set({
      ...(body.grade !== undefined && { grade: body.grade }),
      ...(body.note !== undefined && { note: body.note || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, clientId), eq(leads.sessionId, sessionId), isNull(leads.deletedAt)))
    .returning();
  if (!updated) throw notFound("No such lead");
  const lead = toLead(updated);
  emitToSession(sessionId, "lead:updated", { lead });
  return lead;
}

/** Undo. Idempotent: deleting an already-deleted lead is fine. */
export async function removeLead(sessionId: string, clientId: string): Promise<void> {
  await assertWritable(sessionId);
  const [row] = await db
    .update(leads)
    .set({ deletedAt: sql`coalesce(${leads.deletedAt}, now())` })
    .where(and(eq(leads.id, clientId), eq(leads.sessionId, sessionId)))
    .returning({ wasDeleted: sql<boolean>`${leads.deletedAt} < now()` });
  if (!row) throw notFound("No such lead");
  if (!row.wasDeleted) emitToSession(sessionId, "lead:removed", { clientId });
}

// ============================== Pins ==============================

export async function addPin(sessionId: string, memberId: string, body: PostPinBody): Promise<Pin> {
  await assertWritable(sessionId);
  const columns = {
    id: pins.id,
    memberId: pins.memberId,
    createdAt: pins.createdAt,
    lat: sql<number>`ST_Y(${pins.location})`,
    lng: sql<number>`ST_X(${pins.location})`,
  };
  const [row] = await db
    .insert(pins)
    .values({ id: body.clientId, sessionId, memberId, location: pointSql(body.lat, body.lng) })
    .onConflictDoNothing()
    .returning(columns);
  if (row) {
    const pin = toPin(row);
    emitToSession(sessionId, "pin:new", { pin });
    return pin;
  }
  const [existing] = await db
    .select(columns)
    .from(pins)
    .where(and(eq(pins.id, body.clientId), eq(pins.sessionId, sessionId)));
  if (!existing) throw new HttpError(409, "conflict", "Pin ID already used");
  return toPin(existing);
}

export async function removePin(sessionId: string, clientId: string): Promise<void> {
  const [row] = await db
    .update(pins)
    .set({ deletedAt: sql`coalesce(${pins.deletedAt}, now())` })
    .where(and(eq(pins.id, clientId), eq(pins.sessionId, sessionId)))
    .returning({ wasDeleted: sql<boolean>`${pins.deletedAt} < now()` });
  if (!row) throw notFound("No such pin");
  if (!row.wasDeleted) emitToSession(sessionId, "pin:removed", { clientId });
}

// ============================== Chat ==============================

export async function addMessage(sessionId: string, memberId: string, body: PostMessageBody): Promise<Message> {
  await assertWritable(sessionId);
  const [row] = await db
    .insert(chatMessages)
    .values({ id: body.clientId, sessionId, memberId, body: body.body })
    .onConflictDoNothing()
    .returning();
  if (row) {
    const message = toMessage(row);
    emitToSession(sessionId, "message:new", { message });
    return message;
  }
  const [existing] = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.id, body.clientId), eq(chatMessages.sessionId, sessionId)));
  if (!existing) throw new HttpError(409, "conflict", "Message ID already used");
  return toMessage(existing);
}

/** Messages after `after` (oldest first), or the latest page if `after` is omitted. */
export async function getMessages(sessionId: string, after?: string): Promise<Message[]> {
  if (!after) {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(SNAPSHOT_MESSAGE_LIMIT);
    return rows.reverse().map(toMessage);
  }
  const [anchor] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(and(eq(chatMessages.id, after), eq(chatMessages.sessionId, sessionId)));
  if (!anchor) throw notFound("No such message");
  // Compare inside SQL: Postgres keeps microseconds, JS Dates only milliseconds, so passing the
  // anchor's time through JS would round it down and return the anchor message itself.
  const anchorTime = sql`(SELECT ${chatMessages.createdAt} FROM ${chatMessages} WHERE ${chatMessages.id} = ${after})`;
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.sessionId, sessionId), gt(chatMessages.createdAt, anchorTime)))
    .orderBy(asc(chatMessages.createdAt))
    .limit(500);
  return rows.map(toMessage);
}

// ============================== Helpers ==============================

async function memberName(memberId: string): Promise<string> {
  const [m] = await db
    .select({ name: sessionMembers.displayName })
    .from(sessionMembers)
    .where(eq(sessionMembers.id, memberId));
  return m?.name ?? "Someone";
}

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}
