/**
 * Session lifecycle: create, join, snapshot, map area, end, leave, remove.
 * Routes validate input and handle auth; this module talks to the database and broadcasts.
 */
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  cellBounds,
  EMPTY_PLAN,
  JOIN_CODE_ALPHABET,
  MAX_SESSION_MEMBERS,
  SNAPSHOT_MESSAGE_LIMIT,
  type CellId,
  type CreateSessionBody,
  type JoinSessionBody,
  type Member,
  type Session,
  type SessionAccessRes,
  type SessionAreaRes,
  type SessionSnapshotRes,
} from "@knockd/shared";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { signSessionToken } from "../auth/session-token";
import { db } from "../db/client";
import { chatMessages, leads, maps, pins, sessionCells, sessionMembers, sessionPlans, sessions } from "../db/schema";
import { forbidden, HttpError, notFound } from "../http/errors";
import { disconnectMember, emitToSession, isOnline } from "../realtime/io";
import { toLead, toMessage, toPin } from "./dto";

/** Distinct, colour-blind-friendly-ish member colours, assigned in order. */
const MEMBER_COLOURS = ["#E4572E", "#2E86AB", "#F2A541", "#7B2CBF", "#2A9D8F", "#D81E5B", "#5C946E", "#3D405B"];
const MAX_DRAWN_AREA_KM2 = 30;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// ============================== Create & join ==============================

export async function createSession(body: CreateSessionBody): Promise<SessionAccessRes> {
  if (body.loadMap) throw new HttpError(401, "unauthorized", "Loading team data needs an account (coming soon)");

  const area = plannedAreaSql(body.area);
  if (body.area.kind === "polygon") await checkDrawnArea(area);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { sessionId, memberId } = await db.transaction(async (tx) => {
        const [session] = await tx
          .insert(sessions)
          .values({ joinCode: newJoinCode(), plannedArea: area })
          .returning({ id: sessions.id });
        const [member] = await tx
          .insert(sessionMembers)
          .values({ sessionId: session!.id, displayName: body.displayName, colour: MEMBER_COLOURS[0]! })
          .returning({ id: sessionMembers.id });
        await tx.update(sessions).set({ createdByMemberId: member!.id }).where(eq(sessions.id, session!.id));
        await tx.insert(sessionPlans).values({ sessionId: session!.id, draft: EMPTY_PLAN });
        return { sessionId: session!.id, memberId: member!.id };
      });
      return await accessResponse(sessionId, memberId);
    } catch (err) {
      if (isUniqueViolation(err)) continue; // join code collided with a live session; try another
      throw err;
    }
  }
  throw new HttpError(500, "internal", "Couldn't generate a unique join code");
}

export async function joinSession(body: JoinSessionBody): Promise<SessionAccessRes> {
  const [session] = await db
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(eq(sessions.joinCode, body.code))
    .orderBy(desc(sessions.startedAt))
    .limit(1);
  if (!session) throw new HttpError(404, "session_not_found", "No session with that code");
  if (session.status !== "live") throw new HttpError(410, "session_ended", "That session has ended");

  const memberId = await db.transaction(async (tx) => {
    // Lock the session row so two people joining at once can't both take the last spot or colour.
    await tx.execute(sql`SELECT 1 FROM ${sessions} WHERE ${sessions.id} = ${session.id} FOR UPDATE`);
    const active = await tx
      .select({ colour: sessionMembers.colour })
      .from(sessionMembers)
      .where(activeMembers(session.id));
    if (active.length >= MAX_SESSION_MEMBERS)
      throw new HttpError(409, "session_full", `Sessions are limited to ${MAX_SESSION_MEMBERS} people`);
    const used = new Set(active.map((m) => m.colour));
    const colour = MEMBER_COLOURS.find((c) => !used.has(c)) ?? MEMBER_COLOURS[active.length % MEMBER_COLOURS.length]!;
    const [member] = await tx
      .insert(sessionMembers)
      .values({ sessionId: session.id, displayName: body.displayName, colour })
      .returning({ id: sessionMembers.id });
    return member!.id;
  });

  const res = await accessResponse(session.id, memberId);
  emitToSession(session.id, "member:joined", { member: res.member });
  return res;
}

async function accessResponse(sessionId: string, memberId: string): Promise<SessionAccessRes> {
  const [session, members, token] = await Promise.all([
    loadSession(sessionId),
    loadMembers(sessionId),
    signSessionToken({ sessionId, memberId }),
  ]);
  const member = members.find((m) => m.id === memberId);
  if (!member) throw notFound("Member not found");
  return { session, member, token };
}

// ============================== Snapshot ==============================

export async function getSnapshot(sessionId: string): Promise<SessionSnapshotRes> {
  const [session, members, leadRows, pinRows, plan, messageRows] = await Promise.all([
    loadSession(sessionId),
    loadMembers(sessionId),
    db
      .select()
      .from(leads)
      .where(and(eq(leads.sessionId, sessionId), isNull(leads.deletedAt)))
      .orderBy(asc(leads.createdAt)),
    db
      .select({
        id: pins.id,
        memberId: pins.memberId,
        createdAt: pins.createdAt,
        lat: sql<number>`ST_Y(${pins.location})`,
        lng: sql<number>`ST_X(${pins.location})`,
      })
      .from(pins)
      .where(and(eq(pins.sessionId, sessionId), isNull(pins.deletedAt))),
    db.select().from(sessionPlans).where(eq(sessionPlans.sessionId, sessionId)),
    db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(SNAPSHOT_MESSAGE_LIMIT),
  ]);

  return {
    session,
    members,
    leads: leadRows.map(toLead),
    pins: pinRows.map(toPin),
    plan: { draft: plan[0]?.draft ?? EMPTY_PLAN, applied: plan[0]?.applied ?? null },
    messages: messageRows.reverse().map(toMessage),
  };
}

// ============================== Map area ==============================

/**
 * Streets, blocks and houses for the requested cells, and records the cells as part of the
 * session area. Streets and blocks that cross a cell edge appear in both cells: dedupe by id.
 */
export async function getArea(sessionId: string, cells: CellId[]): Promise<SessionAreaRes> {
  const unique = [...new Set(cells)];
  await db
    .insert(sessionCells)
    .values(unique.map((cellId) => ({ sessionId, cellId })))
    .onConflictDoNothing();

  const result = await Promise.all(
    unique.map(async (id) => {
      const b = cellBounds(id);
      const env = sql`ST_MakeEnvelope(${b.minLng}, ${b.minLat}, ${b.maxLng}, ${b.maxLat}, 4326)`;
      const [streetsFc, blocksFc, housesFc] = await Promise.all([
        featureCollection(sql`
          SELECT id, ST_AsGeoJSON(geom, 6)::json AS geometry,
                 json_build_object('streetId', id, 'name', name, 'lengthM', round(length_m)) AS properties
          FROM streets WHERE geom && ${env} AND ST_Intersects(geom, ${env})`),
        featureCollection(sql`
          SELECT id, ST_AsGeoJSON(geom, 6)::json AS geometry,
                 json_build_object('blockId', id, 'houseCount', house_count) AS properties
          FROM blocks WHERE geom && ${env} AND ST_Intersects(geom, ${env})`),
        // Houses belong to exactly one cell, by centroid (half-open bounds so edges aren't doubled).
        featureCollection(sql`
          SELECT id, ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.000005), 6)::json AS geometry,
                 json_build_object('houseId', id, 'blockId', block_id, 'streetId', street_id) AS properties
          FROM houses
          WHERE centroid && ${env}
            AND ST_X(centroid) >= ${b.minLng} AND ST_X(centroid) < ${b.maxLng}
            AND ST_Y(centroid) >= ${b.minLat} AND ST_Y(centroid) < ${b.maxLat}`),
      ]);
      return { id, streets: streetsFc, blocks: blocksFc, houses: housesFc };
    }),
  );
  return { cells: result };
}

async function featureCollection(query: ReturnType<typeof sql>): Promise<FeatureCollection> {
  const rows = await db.execute<{ fc: FeatureCollection }>(sql`
    SELECT json_build_object(
      'type', 'FeatureCollection',
      'features', coalesce(json_agg(json_build_object(
        'type', 'Feature', 'id', f.id, 'geometry', f.geometry, 'properties', f.properties)), '[]'::json)
    ) AS fc
    FROM (${query}) f`);
  return rows[0]!.fc;
}

// ============================== End, leave, remove ==============================

export async function endSession(sessionId: string, memberId: string): Promise<void> {
  const session = await requireAdmin(sessionId, memberId);
  if (session.status !== "live") throw new HttpError(409, "conflict", "This session has already ended");
  await db.update(sessions).set({ status: "ended", endedAt: new Date() }).where(eq(sessions.id, sessionId));
  emitToSession(sessionId, "session:ended");
  // TODO: queue the process-session job (map matching, street coverage, block stats).
}

export async function leaveSession(sessionId: string, memberId: string): Promise<void> {
  await db.update(sessionMembers).set({ leftAt: new Date() }).where(eq(sessionMembers.id, memberId));
  emitToSession(sessionId, "member:left", { memberId });
  await disconnectMember(sessionId, memberId);
}

export async function removeMember(sessionId: string, adminId: string, memberId: string): Promise<void> {
  await requireAdmin(sessionId, adminId);
  if (memberId === adminId) throw new HttpError(400, "invalid_request", "You can't remove yourself. Leave instead");
  const updated = await db
    .update(sessionMembers)
    .set({ removedAt: new Date(), leftAt: sql`coalesce(${sessionMembers.leftAt}, now())` })
    .where(
      and(eq(sessionMembers.id, memberId), eq(sessionMembers.sessionId, sessionId), isNull(sessionMembers.removedAt)),
    )
    .returning({ id: sessionMembers.id });
  if (!updated.length) throw notFound("No such member in this session");
  emitToSession(sessionId, "member:left", { memberId });
  await disconnectMember(sessionId, memberId);
}

async function requireAdmin(sessionId: string, memberId: string) {
  const [session] = await db
    .select({ status: sessions.status, adminId: sessions.createdByMemberId })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!session) throw new HttpError(404, "session_not_found", "Session not found");
  if (session.adminId !== memberId) throw forbidden("Only the session creator can do that");
  return session;
}

// ============================== Loading ==============================

async function loadSession(sessionId: string): Promise<Session> {
  const [row] = await db
    .select({
      id: sessions.id,
      joinCode: sessions.joinCode,
      status: sessions.status,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      createdByMemberId: sessions.createdByMemberId,
      plannedArea: sql<Polygon>`ST_AsGeoJSON(${sessions.plannedArea}, 6)::json`,
      loadedMapId: sessions.loadedMapId,
      loadedMapName: maps.name,
      loadedLayers: sessions.loadedLayers,
    })
    .from(sessions)
    .leftJoin(maps, eq(maps.id, sessions.loadedMapId))
    .where(eq(sessions.id, sessionId));
  if (!row) throw new HttpError(404, "session_not_found", "Session not found");
  return {
    id: row.id,
    joinCode: row.joinCode,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    endedAt: iso(row.endedAt),
    createdByMemberId: row.createdByMemberId!,
    plannedArea: row.plannedArea as Polygon | MultiPolygon,
    loadedMap:
      row.loadedMapId && row.loadedMapName
        ? { mapId: row.loadedMapId, name: row.loadedMapName, layers: row.loadedLayers }
        : null,
  };
}

/** Members still in the session, with online status and their latest position. */
async function loadMembers(sessionId: string): Promise<Member[]> {
  const [rows, positions] = await Promise.all([
    db.select().from(sessionMembers).where(activeMembers(sessionId)).orderBy(asc(sessionMembers.joinedAt)),
    db.execute<{ member_id: string; time: Date; lat: number; lng: number }>(sql`
      SELECT DISTINCT ON (member_id) member_id, time, ST_Y(location) AS lat, ST_X(location) AS lng
      FROM pings WHERE session_id = ${sessionId}
      ORDER BY member_id, time DESC`),
  ]);
  const lastPosition = new Map(positions.map((p) => [p.member_id, p]));
  return rows.map((m) => {
    const pos = lastPosition.get(m.id);
    return {
      id: m.id,
      displayName: m.displayName,
      colour: m.colour,
      isGuest: m.userId === null,
      isBot: m.isBot,
      online: isOnline(sessionId, m.id),
      lastPosition: pos ? { lat: pos.lat, lng: pos.lng, t: new Date(pos.time).toISOString() } : null,
    };
  });
}

const activeMembers = (sessionId: string) =>
  and(eq(sessionMembers.sessionId, sessionId), isNull(sessionMembers.leftAt), isNull(sessionMembers.removedAt));

// ============================== Helpers ==============================

function newJoinCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}

/** SQL for the planned area polygon: a circle (pin + radius) or a drawn polygon. */
function plannedAreaSql(area: CreateSessionBody["area"]) {
  if (area.kind === "circle") {
    const { lat, lng } = area.center;
    return sql`ST_Buffer(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${area.radiusM}, 'quad_segs=16')::geometry(Polygon, 4326)`;
  }
  if (area.polygon.type !== "Polygon") throw new HttpError(400, "invalid_request", "area.polygon must be a Polygon");
  return sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(area.polygon)}), 4326)::geometry(Polygon, 4326)`;
}

async function checkDrawnArea(area: ReturnType<typeof sql>) {
  const [row] = await db.execute<{ valid: boolean; km2: number }>(
    sql`SELECT ST_IsValid(a) AS valid, ST_Area(a::geography) / 1e6 AS km2 FROM (SELECT ${area} AS a) x`,
  );
  if (!row?.valid) throw new HttpError(400, "invalid_request", "The drawn area crosses over itself");
  if (row.km2 > MAX_DRAWN_AREA_KM2)
    throw new HttpError(400, "invalid_request", `The drawn area is too big (max ${MAX_DRAWN_AREA_KM2} km²)`);
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
}
