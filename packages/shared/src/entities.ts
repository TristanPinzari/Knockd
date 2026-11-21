import type { LineString, Polygon } from "geojson";
import { z } from "zod";
import { DisplayName, Grade, GradeCounts, LatLng, PolygonGeo, RefId, Timestamp, Uuid } from "./common";

// ---------- Users & teams ----------

/**
 * owner: everything, plus inviting people, changing roles, removing people, deleting the team.
 * editor: also creates/deletes highlights, notes and maps, and removes sessions.
 * viewer: sees everything and uploads sessions.
 */
export const TeamRole = z.enum(["owner", "editor", "viewer"]);
export type TeamRole = z.infer<typeof TeamRole>;

export const User = z.object({ id: Uuid, displayName: DisplayName });
export type User = z.infer<typeof User>;

export const Team = z.object({
  id: Uuid,
  name: z.string().trim().min(1).max(80),
  /** How long paths take to fade on the map (README: default 4 months). */
  fadeDays: z.number().int().positive(),
  createdAt: Timestamp,
});
export type Team = z.infer<typeof Team>;

export const TeamSummary = Team.pick({ id: true, name: true }).extend({ role: TeamRole });
export type TeamSummary = z.infer<typeof TeamSummary>;

export const TeamMember = z.object({ user: User, role: TeamRole, joinedAt: Timestamp });
export type TeamMember = z.infer<typeof TeamMember>;

// ---------- Sessions ----------

export const SessionStatus = z.enum(["live", "ended", "processed"]);
export type SessionStatus = z.infer<typeof SessionStatus>;

/** Team data a session can load: previous leads, past coverage, lead-rate colours, highlights, team notes. */
export const Layer = z.enum(["leads", "coverage", "leadRate", "highlights", "notes"]);
export type Layer = z.infer<typeof Layer>;

export const MAX_SESSION_MEMBERS = 8;

/** The planned area picked when creating a session: pin + radius, or drawn. */
export const SessionAreaInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("circle"), center: LatLng, radiusM: z.number().min(100).max(3000) }),
  z.object({ kind: z.literal("polygon"), polygon: PolygonGeo }),
]);
export type SessionAreaInput = z.infer<typeof SessionAreaInput>;

export const Session = z.object({
  id: Uuid,
  joinCode: z.string(),
  status: SessionStatus,
  startedAt: Timestamp,
  endedAt: Timestamp.nullable(),
  /** The session admin. Only they can end the session or remove members. */
  createdByMemberId: Uuid,
  /** The planned area as a GeoJSON polygon (circles are converted server-side). */
  plannedArea: PolygonGeo,
  loadedMap: z.object({ mapId: Uuid, name: z.string(), layers: z.array(Layer) }).nullable(),
});
export type Session = z.infer<typeof Session>;

export const Position = LatLng.extend({ t: Timestamp });
export type Position = z.infer<typeof Position>;

export const Member = z.object({
  id: Uuid,
  displayName: DisplayName,
  /** Hex colour for the dot and trail, e.g. "#E4572E" */
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  isGuest: z.boolean(),
  isBot: z.boolean(),
  online: z.boolean(),
  lastPosition: Position.nullable(),
});
export type Member = z.infer<typeof Member>;

export const LEAD_NOTE_MAX = 140;
/** Optional short note on a lead, e.g. "old house, peeling paint, loved our work". */
export const LeadNote = z.string().trim().max(LEAD_NOTE_MAX);

export const Lead = z.object({
  clientId: Uuid,
  memberId: Uuid,
  houseId: RefId,
  grade: Grade,
  note: LeadNote.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Lead = z.infer<typeof Lead>;

/** A lead from past sessions, shown as a reference. */
export const PastLead = z.object({
  houseId: RefId,
  grade: Grade,
  note: LeadNote.nullable(),
  /** When the lead was last updated. */
  at: Timestamp,
});
export type PastLead = z.infer<typeof PastLead>;

export const PIN_LABEL_MAX = 80;
/** e.g. "meet up here once done" */
export const PinLabel = z.string().trim().max(PIN_LABEL_MAX);

export const Pin = LatLng.extend({ clientId: Uuid, memberId: Uuid, label: PinLabel.nullable(), createdAt: Timestamp });
export type Pin = z.infer<typeof Pin>;

export const Message = z.object({
  clientId: Uuid,
  memberId: Uuid,
  body: z.string().trim().min(1).max(1000),
  createdAt: Timestamp,
});
export type Message = z.infer<typeof Message>;

// ---------- Session plan (planning mode) ----------
//
// One live plan per session, edited by anyone, no draft/apply. Three ways to plan, all optional:
//   claims    pick a colour (yourself or a teammate) and tap blocks; two people on a block = a pair
//   drawings  routes (dashed, arrow tip) or freehand lines, for a member or in a utility colour
//   notes     short text on the map, for a member or in a utility colour
// Every item records its author (set by the server), so "clear" only removes your own items.

/**
 * 12 colours for people and utility. Members get the first free one when they join (max 8 per
 * session); the rest are utility colours for instructions not aimed at anyone.
 */
export const PALETTE = [
  "#E4572E",
  "#2E86AB",
  "#F2A541",
  "#7B2CBF",
  "#2A9D8F",
  "#D81E5B",
  "#5C946E",
  "#3D405B",
  "#FF7F11",
  "#00A6FB",
  "#8AC926",
  "#6D4C41",
] as const;
export const PaletteColour = z.enum(PALETTE);
export type PaletteColour = z.infer<typeof PaletteColour>;

/** Utility colours in a session: the palette minus members' colours. */
export const utilityColours = (memberColours: string[]): PaletteColour[] =>
  PALETTE.filter((c) => !memberColours.includes(c));

/** For a member (drawn in their colour) or in a utility colour: exactly one is set. */
const forWhom = { memberId: Uuid.nullable(), colour: PaletteColour.nullable() };
const exactlyOne = (v: { memberId: string | null; colour: string | null }) =>
  (v.memberId === null) !== (v.colour === null);
const FOR_WHOM_MESSAGE = "Set exactly one of memberId or colour";

export const Claim = z.object({ blockId: RefId, memberId: Uuid, authorId: Uuid });
export type Claim = z.infer<typeof Claim>;

const DrawingFields = z.object({
  id: Uuid,
  /** route = dashed line with an arrow tip ("go this way"); freehand = solid line */
  kind: z.enum(["route", "freehand"]),
  points: z.array(LatLng).min(2).max(500),
  ...forWhom,
});
/** A drawing as sent by a client (the server adds authorId). */
export const DrawingInput = DrawingFields.refine(exactlyOne, FOR_WHOM_MESSAGE);
export type DrawingInput = z.infer<typeof DrawingInput>;
export const Drawing = DrawingFields.extend({ authorId: Uuid });
export type Drawing = z.infer<typeof Drawing>;

const NoteFields = LatLng.extend({ id: Uuid, text: z.string().trim().min(1).max(140), ...forWhom });
/** A note as sent by a client (the server adds authorId). */
export const NoteInput = NoteFields.refine(exactlyOne, FOR_WHOM_MESSAGE);
export type NoteInput = z.infer<typeof NoteInput>;
export const Note = NoteFields.extend({ authorId: Uuid });
export type Note = z.infer<typeof Note>;

export const PlanContent = z.object({
  claims: z.array(Claim),
  drawings: z.array(Drawing),
  notes: z.array(Note),
});
export type PlanContent = z.infer<typeof PlanContent>;

export const EMPTY_PLAN: PlanContent = { claims: [], drawings: [], notes: [] };

// ---------- Team highlights & notes (web) ----------
//
// The web's planning tools, like a highlighter on a map screenshot: highlight areas or roads to go
// to, and pin notes. Created and deleted on the web by owners and editors; read-only layers on phones.

/** 6 highlighter colours. No built-in meaning: each team picks its own convention. */
export const HIGHLIGHT_COLOURS = ["#FACC15", "#22C55E", "#EF4444", "#3B82F6", "#F97316", "#A855F7"] as const;
export const HighlightColour = z.enum(HIGHLIGHT_COLOURS);
export type HighlightColour = z.infer<typeof HighlightColour>;

/** A highlighter stroke along roads (LineString) or a loop around an area (Polygon). */
export const HighlightGeometry = z.custom<LineString | Polygon>(
  (v) => typeof v === "object" && v !== null && ["LineString", "Polygon"].includes((v as { type?: string }).type ?? ""),
  "Must be a GeoJSON LineString or Polygon",
);

const Author = z.object({ id: Uuid, displayName: z.string() });

export const Highlight = z.object({
  id: Uuid,
  teamId: Uuid,
  geometry: HighlightGeometry,
  colour: HighlightColour,
  createdBy: Author,
  createdAt: Timestamp,
});
export type Highlight = z.infer<typeof Highlight>;

export const TeamNote = LatLng.extend({
  id: Uuid,
  teamId: Uuid,
  text: z.string().trim().min(1).max(140),
  createdBy: Author,
  createdAt: Timestamp,
});
export type TeamNote = z.infer<typeof TeamNote>;

// ---------- Maps ----------

export const MapView = z.object({
  id: Uuid,
  teamId: Uuid,
  name: z.string().trim().min(1).max(80),
  /** null = no boundary (the whole team, e.g. "World Map") */
  boundary: PolygonGeo.nullable(),
  from: Timestamp.nullable(),
  to: Timestamp.nullable(),
  createdAt: Timestamp,
});
export type MapView = z.infer<typeof MapView>;

// ---------- Stats ----------

export const Stats = z.object({
  streetsWorked: z.number().int(),
  streetsPassed: z.number().int(),
  blocksCompleted: z.number().int(),
  housesCovered: z.number().int(),
  leads: GradeCounts,
  distanceM: z.number(),
  activeS: z.number().int(),
});
export type Stats = z.infer<typeof Stats>;
