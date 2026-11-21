/**
 * Team highlights and notes: the web's planning tools. Highlights are highlighter strokes (roads)
 * or loops (areas) in one of HIGHLIGHT_COLOURS; notes are short text pinned on the map.
 * Everyone on the team sees them; owners and editors create and delete them (on the web).
 * Phones get them read-only through session layers.
 */
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { Bbox, CreateHighlightBody, CreateTeamNoteBody, Highlight, TeamNote } from "@knockd/shared";
import type { LineString, Polygon } from "geojson";
import { db } from "../db/client";
import { teamHighlights, teamNotes, users } from "../db/schema";
import { HttpError, notFound } from "../http/errors";
import { requireEditor, requireMember } from "./service";

const MAX_RESULTS = 2000;
const envelope = (b: Bbox) => sql`ST_MakeEnvelope(${b.minLng}, ${b.minLat}, ${b.maxLng}, ${b.maxLat}, 4326)`;

const highlightColumns = {
  id: teamHighlights.id,
  teamId: teamHighlights.teamId,
  geometry: sql<LineString | Polygon>`ST_AsGeoJSON(${teamHighlights.geom}, 6)::json`,
  colour: teamHighlights.colour,
  createdById: users.id,
  createdByName: users.displayName,
  createdAt: teamHighlights.createdAt,
};
type HighlightRow = {
  id: string;
  teamId: string;
  geometry: LineString | Polygon;
  colour: string;
  createdById: string;
  createdByName: string;
  createdAt: Date;
};
const toHighlight = (r: HighlightRow): Highlight => ({
  id: r.id,
  teamId: r.teamId,
  geometry: r.geometry,
  colour: r.colour as Highlight["colour"],
  createdBy: { id: r.createdById, displayName: r.createdByName },
  createdAt: r.createdAt.toISOString(),
});

const noteColumns = {
  id: teamNotes.id,
  teamId: teamNotes.teamId,
  lat: sql<number>`ST_Y(${teamNotes.location})`,
  lng: sql<number>`ST_X(${teamNotes.location})`,
  text: teamNotes.text,
  createdById: users.id,
  createdByName: users.displayName,
  createdAt: teamNotes.createdAt,
};
type NoteRow = {
  id: string;
  teamId: string;
  lat: number;
  lng: number;
  text: string;
  createdById: string;
  createdByName: string;
  createdAt: Date;
};
const toNote = (r: NoteRow): TeamNote => ({
  id: r.id,
  teamId: r.teamId,
  lat: r.lat,
  lng: r.lng,
  text: r.text,
  createdBy: { id: r.createdById, displayName: r.createdByName },
  createdAt: r.createdAt.toISOString(),
});

// ============================== Queries (also used for session layers) ==============================

/** Highlights for a team in a bbox. No access check: callers check it. */
export async function queryHighlights(teamId: string, bbox: Bbox): Promise<Highlight[]> {
  const rows = await db
    .select(highlightColumns)
    .from(teamHighlights)
    .innerJoin(users, eq(users.id, teamHighlights.createdBy))
    .where(and(eq(teamHighlights.teamId, teamId), sql`${teamHighlights.geom} && ${envelope(bbox)}`))
    .orderBy(teamHighlights.createdAt)
    .limit(MAX_RESULTS);
  return rows.map(toHighlight);
}

/** Team notes in a bbox. No access check: callers check it. */
export async function queryNotes(teamId: string, bbox: Bbox): Promise<TeamNote[]> {
  const rows = await db
    .select(noteColumns)
    .from(teamNotes)
    .innerJoin(users, eq(users.id, teamNotes.createdBy))
    .where(and(eq(teamNotes.teamId, teamId), sql`${teamNotes.location} && ${envelope(bbox)}`))
    .orderBy(teamNotes.createdAt)
    .limit(MAX_RESULTS);
  return rows.map(toNote);
}

// ============================== Highlights ==============================

export async function listHighlights(teamId: string, userId: string, bbox: Bbox): Promise<Highlight[]> {
  await requireMember(teamId, userId);
  return queryHighlights(teamId, bbox);
}

export async function createHighlight(teamId: string, userId: string, body: CreateHighlightBody): Promise<Highlight> {
  await requireEditor(teamId, userId);
  const geom = sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(body.geometry)}), 4326)`;
  await assertValid(geom, "highlight");
  const [row] = await db
    .insert(teamHighlights)
    .values({ teamId, geom, colour: body.colour, createdBy: userId })
    .returning({ id: teamHighlights.id });
  const [created] = await db
    .select(highlightColumns)
    .from(teamHighlights)
    .innerJoin(users, eq(users.id, teamHighlights.createdBy))
    .where(eq(teamHighlights.id, row!.id));
  return toHighlight(created!);
}

export async function deleteHighlight(highlightId: string, userId: string): Promise<void> {
  const [h] = await db
    .select({ teamId: teamHighlights.teamId })
    .from(teamHighlights)
    .where(eq(teamHighlights.id, highlightId));
  if (!h) throw notFound("Highlight not found");
  await requireMember(h.teamId, userId).catch(() => {
    throw notFound("Highlight not found");
  });
  await requireEditor(h.teamId, userId);
  await db.delete(teamHighlights).where(eq(teamHighlights.id, highlightId));
}

// ============================== Notes ==============================

export async function listNotes(teamId: string, userId: string, bbox: Bbox): Promise<TeamNote[]> {
  await requireMember(teamId, userId);
  return queryNotes(teamId, bbox);
}

export async function createNote(teamId: string, userId: string, body: CreateTeamNoteBody): Promise<TeamNote> {
  await requireEditor(teamId, userId);
  const [row] = await db
    .insert(teamNotes)
    .values({
      teamId,
      location: sql`ST_SetSRID(ST_MakePoint(${body.lng}, ${body.lat}), 4326)`,
      text: body.text,
      createdBy: userId,
    })
    .returning({ id: teamNotes.id });
  const [created] = await db
    .select(noteColumns)
    .from(teamNotes)
    .innerJoin(users, eq(users.id, teamNotes.createdBy))
    .where(eq(teamNotes.id, row!.id));
  return toNote(created!);
}

export async function deleteNote(noteId: string, userId: string): Promise<void> {
  const [n] = await db.select({ teamId: teamNotes.teamId }).from(teamNotes).where(eq(teamNotes.id, noteId));
  if (!n) throw notFound("Note not found");
  await requireMember(n.teamId, userId).catch(() => {
    throw notFound("Note not found");
  });
  await requireEditor(n.teamId, userId);
  await db.delete(teamNotes).where(eq(teamNotes.id, noteId));
}

async function assertValid(geom: SQL, what: string) {
  const [r] = await db.execute<{ valid: boolean }>(sql`SELECT ST_IsValid(${geom}) AS valid`);
  if (!r?.valid) throw new HttpError(400, "invalid_request", `That ${what} shape is invalid (it crosses over itself)`);
}
