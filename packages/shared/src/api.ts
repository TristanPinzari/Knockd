/**
 * Request and response schemas for every REST endpoint in docs/API.md.
 * Naming: `<Endpoint>Body` (JSON body), `<Endpoint>Query` (query params), `<Endpoint>Res` (response).
 */
import { z } from "zod";
import { CellId } from "./cells";
import {
  Bbox,
  csv,
  DisplayName,
  FeatureCollectionGeo,
  Grade,
  GradeCounts,
  LatLng,
  PolygonGeo,
  RefId,
  Timestamp,
  Uuid,
} from "./common";
import {
  Layer,
  Lead,
  LeadNote,
  LibraryPlan,
  MapView,
  Member,
  PastLead,
  PinLabel,
  Message,
  Pin,
  PlanContent,
  PlanGroup,
  Session,
  SessionAreaInput,
  SessionStatus,
  Stats,
  Team,
  TeamMember,
  TeamRole,
  TeamSummary,
  User,
} from "./entities";

// ============================== Me ==============================

export const GetMeRes = z.object({ user: User, teams: z.array(TeamSummary) });
export type GetMeRes = z.infer<typeof GetMeRes>;

export const PatchMeBody = z.object({ displayName: DisplayName });
export type PatchMeBody = z.infer<typeof PatchMeBody>;
export const PatchMeRes = z.object({ user: User });
export type PatchMeRes = z.infer<typeof PatchMeRes>;

export const GetMySessionsRes = z.object({
  sessions: z.array(
    z.object({
      id: Uuid,
      startedAt: Timestamp,
      endedAt: Timestamp.nullable(),
      status: SessionStatus,
      uploadedTo: z.array(Uuid),
    }),
  ),
});
export type GetMySessionsRes = z.infer<typeof GetMySessionsRes>;

// ============================== Sessions ==============================

/** Returned by create and join. `token` is the session token for 🎟️ endpoints and the socket. */
export const SessionAccessRes = z.object({
  session: Session,
  member: Member,
  token: z.string(),
});
export type SessionAccessRes = z.infer<typeof SessionAccessRes>;

export const CreateSessionBody = z.object({
  displayName: DisplayName,
  location: LatLng,
  area: SessionAreaInput,
  /** Account only. */
  loadMap: z.object({ mapId: Uuid, layers: z.array(Layer).min(1) }).optional(),
});
export type CreateSessionBody = z.infer<typeof CreateSessionBody>;
export const CreateSessionRes = SessionAccessRes;
export type CreateSessionRes = SessionAccessRes;

export const JoinSessionBody = z.object({
  code: z.string().transform((s) => s.trim().toUpperCase()),
  displayName: DisplayName,
});
export type JoinSessionBody = z.infer<typeof JoinSessionBody>;
export const JoinSessionRes = SessionAccessRes;
export type JoinSessionRes = SessionAccessRes;

export const SNAPSHOT_MESSAGE_LIMIT = 50;

export const SessionSnapshotRes = z.object({
  session: Session,
  members: z.array(Member),
  leads: z.array(Lead),
  pins: z.array(Pin),
  plan: z.object({ draft: PlanContent, applied: PlanContent.nullable() }),
  /** Most recent SNAPSHOT_MESSAGE_LIMIT messages, oldest first. */
  messages: z.array(Message),
});
export type SessionSnapshotRes = z.infer<typeof SessionSnapshotRes>;

export const CellsQuery = z.object({ cells: csv(CellId).pipe(z.array(CellId).min(1).max(25)) });
export type CellsQuery = z.infer<typeof CellsQuery>;

export const SessionAreaRes = z.object({
  cells: z.array(
    z.object({
      id: CellId,
      streets: FeatureCollectionGeo,
      blocks: FeatureCollectionGeo,
      houses: FeatureCollectionGeo,
    }),
  ),
});
export type SessionAreaRes = z.infer<typeof SessionAreaRes>;

export const SessionLayersRes = z.object({
  leads: z.array(PastLead).optional(),
  /** Paths with properties { durationS, lastWorkedAt } */
  coverage: FeatureCollectionGeo.optional(),
  /** rate = null means not enough data yet */
  leadRate: z
    .array(z.object({ blockId: RefId, rate: z.number().min(0).max(1).nullable(), housesWorked: z.number().int() }))
    .optional(),
});
export type SessionLayersRes = z.infer<typeof SessionLayersRes>;

export const SessionStatsRes = z.object({
  crew: Stats,
  members: z.array(Stats.extend({ memberId: Uuid })),
  /** false while the session is live: distance and street stats are estimates. */
  final: z.boolean(),
});
export type SessionStatsRes = z.infer<typeof SessionStatsRes>;

// ============================== In-session writes ==============================

export const MAX_PINGS_PER_BATCH = 500;

export const Ping = LatLng.extend({
  clientId: Uuid,
  t: Timestamp,
  /** Horizontal accuracy in metres, as reported by the OS. */
  accuracy: z.number().nonnegative(),
});
export type Ping = z.infer<typeof Ping>;

export const PostPingsBody = z.object({ pings: z.array(Ping).min(1).max(MAX_PINGS_PER_BATCH) });
export type PostPingsBody = z.infer<typeof PostPingsBody>;
export const PostPingsRes = z.object({ accepted: z.number().int() });
export type PostPingsRes = z.infer<typeof PostPingsRes>;

/** `t` is when the lead was marked on the phone. With clientId it deduplicates offline retries. */
export const PostLeadBody = z.object({
  clientId: Uuid,
  t: Timestamp,
  houseId: RefId,
  grade: Grade,
  note: LeadNote.optional(),
});
export type PostLeadBody = z.infer<typeof PostLeadBody>;
export const PostLeadRes = z.object({ lead: Lead });
export type PostLeadRes = z.infer<typeof PostLeadRes>;

/** Edit a lead's grade or note. `note: null` clears it. */
export const PatchLeadBody = z
  .object({ grade: Grade.optional(), note: LeadNote.nullable().optional() })
  .refine((b) => b.grade !== undefined || b.note !== undefined, "Nothing to update");
export type PatchLeadBody = z.infer<typeof PatchLeadBody>;
export const PatchLeadRes = PostLeadRes;
export type PatchLeadRes = PostLeadRes;

export const PostPinBody = LatLng.extend({ clientId: Uuid, label: PinLabel.optional() });
export type PostPinBody = z.infer<typeof PostPinBody>;
export const PostPinRes = z.object({ pin: Pin });
export type PostPinRes = z.infer<typeof PostPinRes>;

export const PostMessageBody = Message.pick({ clientId: true, body: true });
export type PostMessageBody = z.infer<typeof PostMessageBody>;
export const PostMessageRes = z.object({ message: Message });
export type PostMessageRes = z.infer<typeof PostMessageRes>;

export const GetMessagesQuery = z.object({ after: Uuid.optional() });
export type GetMessagesQuery = z.infer<typeof GetMessagesQuery>;
export const GetMessagesRes = z.object({ messages: z.array(Message) });
export type GetMessagesRes = z.infer<typeof GetMessagesRes>;

// ============================== Trails ==============================

/** Only points newer than `since` (for catching up after reconnecting). Omit for the whole session. */
export const TrailsQuery = z.object({ since: Timestamp.optional() });
export type TrailsQuery = z.infer<typeof TrailsQuery>;

/**
 * Each member's GPS trail, oldest first. Points are compact tuples [tMs, lat, lng] (t in ms since
 * the epoch), ready for classifyTrail / trailToGeoJSON from @knockd/shared.
 */
export const TrailsRes = z.object({
  trails: z.array(z.object({ memberId: Uuid, points: z.array(z.tuple([z.number(), z.number(), z.number()])) })),
});
export type TrailsRes = z.infer<typeof TrailsRes>;

// ============================== Planning (in session) ==============================

export const GetSessionPlanRes = z.object({ draft: PlanContent, applied: PlanContent.nullable() });
export type GetSessionPlanRes = z.infer<typeof GetSessionPlanRes>;

export const ApplyPlanRes = z.object({ applied: PlanContent });
export type ApplyPlanRes = z.infer<typeof ApplyPlanRes>;

export const LoadPlanBody = z.object({ planId: Uuid });
export type LoadPlanBody = z.infer<typeof LoadPlanBody>;
export const LoadPlanRes = z.object({ draft: PlanContent });
export type LoadPlanRes = z.infer<typeof LoadPlanRes>;

/** Default when a crew has no history (README: ~25 houses/hour per pair). */
export const DEFAULT_HOUSES_PER_HOUR_PER_GROUP = 25;

export const KnockRateRes = z.object({
  housesPerHourPerGroup: z.number().positive(),
  source: z.enum(["history", "default"]),
});
export type KnockRateRes = z.infer<typeof KnockRateRes>;

// ============================== Teams ==============================

const TeamName = Team.shape.name;

export const CreateTeamBody = z.object({ name: TeamName });
export type CreateTeamBody = z.infer<typeof CreateTeamBody>;
export const TeamRes = z.object({ team: Team });
export type TeamRes = z.infer<typeof TeamRes>;

export const PatchTeamBody = z.object({ name: TeamName.optional(), fadeDays: Team.shape.fadeDays.optional() });
export type PatchTeamBody = z.infer<typeof PatchTeamBody>;

export const GetTeamMembersRes = z.object({ members: z.array(TeamMember) });
export type GetTeamMembersRes = z.infer<typeof GetTeamMembersRes>;

/** Owner can't be assigned through this endpoint. */
export const PatchTeamMemberBody = z.object({ role: TeamRole.exclude(["owner"]) });
export type PatchTeamMemberBody = z.infer<typeof PatchTeamMemberBody>;

export const CreateInviteRes = z.object({ token: z.string(), url: z.string().url(), expiresAt: Timestamp });
export type CreateInviteRes = z.infer<typeof CreateInviteRes>;

export const AcceptInviteRes = TeamRes;
export type AcceptInviteRes = TeamRes;

export const UploadSessionBody = z.object({ sessionId: Uuid });
export type UploadSessionBody = z.infer<typeof UploadSessionBody>;
export const UploadSessionRes = z.object({ uploaded: z.literal(true), alreadyUploaded: z.boolean() });
export type UploadSessionRes = z.infer<typeof UploadSessionRes>;

export const DateRangeQuery = z.object({ from: Timestamp.optional(), to: Timestamp.optional() });
export type DateRangeQuery = z.infer<typeof DateRangeQuery>;

export const TeamSessionSummary = z.object({
  id: Uuid,
  startedAt: Timestamp,
  endedAt: Timestamp.nullable(),
  memberNames: z.array(z.string()),
  leads: GradeCounts,
  housesCovered: z.number().int(),
  uploadedBy: User,
  uploadedAt: Timestamp,
});
export type TeamSessionSummary = z.infer<typeof TeamSessionSummary>;

export const GetTeamSessionsRes = z.object({ sessions: z.array(TeamSessionSummary) });
export type GetTeamSessionsRes = z.infer<typeof GetTeamSessionsRes>;

export const GetTeamSessionRes = z.object({
  session: TeamSessionSummary,
  members: z.array(Member.pick({ id: true, displayName: true, colour: true, isGuest: true })),
  /** Matched paths, properties { memberId } */
  paths: FeatureCollectionGeo,
  /** Streets with properties { memberId, streetId, durationS, classification, firstSeen, lastSeen } */
  coverage: FeatureCollectionGeo,
  leads: z.array(Lead.extend(LatLng.shape)),
  stats: SessionStatsRes,
});
export type GetTeamSessionRes = z.infer<typeof GetTeamSessionRes>;

// ============================== Maps ==============================

export const CreateMapBody = z.object({
  name: MapView.shape.name,
  boundary: PolygonGeo.optional(),
  from: Timestamp.optional(),
  to: Timestamp.optional(),
});
export type CreateMapBody = z.infer<typeof CreateMapBody>;

export const PatchMapBody = z.object({
  name: MapView.shape.name.optional(),
  boundary: PolygonGeo.nullable().optional(),
  from: Timestamp.nullable().optional(),
  to: Timestamp.nullable().optional(),
});
export type PatchMapBody = z.infer<typeof PatchMapBody>;

export const MapRes = z.object({ map: MapView });
export type MapRes = z.infer<typeof MapRes>;
export const GetMapsRes = z.object({ maps: z.array(MapView) });
export type GetMapsRes = z.infer<typeof GetMapsRes>;

export const MapQuery = z.object({ bbox: Bbox, asOf: Timestamp.optional() });
export type MapQuery = z.infer<typeof MapQuery>;

/** FeatureCollection of LineStrings with properties { sessionId, memberName, durationS, workedAt } */
export const MapPathsRes = FeatureCollectionGeo;
export type MapPathsRes = z.infer<typeof MapPathsRes>;

export const MapBlocksRes = z.object({
  blocks: z.array(
    z.object({
      blockId: RefId,
      /** (A + B) / housesWorked, smoothed toward the team average. null = not enough data. */
      rate: z.number().min(0).max(1).nullable(),
      housesWorked: z.number().int(),
      leads: GradeCounts,
      lastWorkedAt: Timestamp.nullable(),
    }),
  ),
});
export type MapBlocksRes = z.infer<typeof MapBlocksRes>;

export const MapLeadsQuery = MapQuery.extend({ grades: csv(Grade).optional() });
export type MapLeadsQuery = z.infer<typeof MapLeadsQuery>;
export const MapLeadsRes = z.object({
  leads: z.array(PastLead.extend(LatLng.shape)),
});
export type MapLeadsRes = z.infer<typeof MapLeadsRes>;

export const MapStatsRes = z.object({
  housesWorked: z.number().int(),
  streetsWorked: z.number().int(),
  distanceM: z.number(),
  leads: GradeCounts,
  leadRate: z.number().min(0).max(1).nullable(),
  sessions: z.number().int(),
});
export type MapStatsRes = z.infer<typeof MapStatsRes>;

export const WhereNextQuery = z.object({
  near: z
    .string()
    .transform((s) => s.split(",").map(Number))
    .pipe(z.tuple([z.number(), z.number()]))
    .transform(([lat, lng]) => ({ lat, lng }))
    .pipe(LatLng),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type WhereNextQuery = z.infer<typeof WhereNextQuery>;

export const WhereNextRes = z.object({
  suggestions: z.array(
    z.object({
      blockId: RefId,
      centroid: LatLng,
      medianIncome: z.number().nullable(),
      daysSinceWorked: z.number().int().nullable(),
      score: z.number(),
    }),
  ),
});
export type WhereNextRes = z.infer<typeof WhereNextRes>;

// ============================== Plans (library) ==============================

const LibraryGroup = PlanGroup.omit({ memberIds: true });

export const GetPlansQuery = z.object({
  used: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
export type GetPlansQuery = z.infer<typeof GetPlansQuery>;
export const GetPlansRes = z.object({ plans: z.array(LibraryPlan) });
export type GetPlansRes = z.infer<typeof GetPlansRes>;

export const CreatePlanBody = z.object({
  name: LibraryPlan.shape.name,
  mapId: Uuid.optional(),
  groups: z.array(LibraryGroup).min(1),
});
export type CreatePlanBody = z.infer<typeof CreatePlanBody>;

export const PatchPlanBody = z.object({
  name: LibraryPlan.shape.name.optional(),
  mapId: Uuid.nullable().optional(),
  groups: z.array(LibraryGroup).min(1).optional(),
});
export type PatchPlanBody = z.infer<typeof PatchPlanBody>;

export const PlanRes = z.object({ plan: LibraryPlan });
export type PlanRes = z.infer<typeof PlanRes>;

export const GeoBlocksQuery = z.object({ bbox: Bbox });
export type GeoBlocksQuery = z.infer<typeof GeoBlocksQuery>;
/** Blocks with properties { blockId, houseCount } */
export const GeoBlocksRes = FeatureCollectionGeo;
export type GeoBlocksRes = z.infer<typeof GeoBlocksRes>;

// ============================== Simulated crew ==============================

/**
 * demo: ~10 s per door (~2 km/h), so the map fills in quickly.
 * realistic: ~1 min per door, like a real rep.
 */
export const SimPace = z.enum(["demo", "realistic"]);
export type SimPace = z.infer<typeof SimPace>;

export const StartSimBody = z.object({
  bots: z.number().int().min(1).max(7),
  pace: SimPace.default("demo"),
});
export type StartSimBody = z.infer<typeof StartSimBody>;
export const StartSimRes = z.object({ botMemberIds: z.array(Uuid) });
export type StartSimRes = z.infer<typeof StartSimRes>;
