import { z } from "zod";
import { DisplayName, Grade, GradeCounts, LatLng, PolygonGeo, RefId, Timestamp, Uuid } from "./common";

// ---------- Users & teams ----------

export const TeamRole = z.enum(["owner", "admin", "member"]);
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

export const Layer = z.enum(["leads", "coverage", "leadRate"]);
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

export const Lead = z.object({
  clientId: Uuid,
  memberId: Uuid,
  houseId: RefId,
  grade: Grade,
  createdAt: Timestamp,
});
export type Lead = z.infer<typeof Lead>;

export const Pin = LatLng.extend({ clientId: Uuid, memberId: Uuid, createdAt: Timestamp });
export type Pin = z.infer<typeof Pin>;

export const Message = z.object({
  clientId: Uuid,
  memberId: Uuid,
  body: z.string().trim().min(1).max(1000),
  createdAt: Timestamp,
});
export type Message = z.infer<typeof Message>;

// ---------- Plans ----------

/** A person or pair, and the blocks they're assigned. */
export const PlanGroup = z.object({
  /** Shown in the plan library, e.g. "Pair 1". In a session, members are attached via memberIds. */
  label: z.string().max(40),
  memberIds: z.array(Uuid),
  blockIds: z.array(RefId),
});
export type PlanGroup = z.infer<typeof PlanGroup>;

export const Drawing = z.object({
  id: Uuid,
  kind: z.enum(["freehand", "arrow"]),
  points: z.array(LatLng).min(2),
  colour: z.string(),
});
export type Drawing = z.infer<typeof Drawing>;

export const Note = LatLng.extend({ id: Uuid, text: z.string().trim().min(1).max(140) });
export type Note = z.infer<typeof Note>;

export const PlanContent = z.object({
  groups: z.array(PlanGroup),
  drawings: z.array(Drawing),
  notes: z.array(Note),
});
export type PlanContent = z.infer<typeof PlanContent>;

export const EMPTY_PLAN: PlanContent = { groups: [], drawings: [], notes: [] };

/** A saved plan in a team's library. */
export const LibraryPlan = z.object({
  id: Uuid,
  teamId: Uuid,
  mapId: Uuid.nullable(),
  name: z.string().trim().min(1).max(80),
  groups: z.array(PlanGroup.omit({ memberIds: true })),
  usedInSessionId: Uuid.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type LibraryPlan = z.infer<typeof LibraryPlan>;

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
