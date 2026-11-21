/**
 * Database schema. See docs/BACKEND.md → Data model.
 *
 * Things Drizzle can't express live in custom SQL migrations (drizzle/):
 *   - CREATE EXTENSION postgis
 *   - pings hypertable, compression and retention policies
 *   - continuous aggregates
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Layer, PlanContent, PlanGroup } from "@knockd/shared";
import { EMPTY_PLAN } from "@knockd/shared";
import { geometry } from "./geometry";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ============================== Enums ==============================

export const teamRole = pgEnum("team_role", ["owner", "admin", "member"]);
export const sessionStatus = pgEnum("session_status", ["live", "ended", "processed"]);
export const leadGrade = pgEnum("lead_grade", ["A", "B", "C"]);
export const streetClassification = pgEnum("street_classification", ["worked", "passed"]);

// ============================== Accounts & teams ==============================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  auth0Sub: text("auth0_sub").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: createdAt(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** How long paths take to fade on the map. Default ~4 months. */
  fadeDays: integer("fade_days").notNull().default(120),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamRole("role").notNull().default("member"),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_members_user_idx").on(t.userId)],
);

export const teamInvites = pgTable("team_invites", {
  token: text("token").primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

/** A saved view over a team's sessions: optional boundary + optional date range. */
export const maps = pgTable(
  "maps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** null = no boundary (e.g. "World Map") */
    boundary: geometry("boundary", "MultiPolygon"),
    fromDate: ts("from_date"),
    toDate: ts("to_date"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("maps_team_idx").on(t.teamId)],
);

/** Plan library. */
export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    mapId: uuid("map_id").references(() => maps.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    groups: jsonb("groups").$type<Omit<PlanGroup, "memberIds">[]>().notNull(),
    usedInSessionId: uuid("used_in_session_id").references(() => sessions.id, { onDelete: "set null" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("plans_team_idx").on(t.teamId)],
);

// ============================== Live sessions ==============================

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    joinCode: text("join_code").notNull(),
    /** null when a guest created it */
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** The creator's member row (the session admin). Set right after the member is inserted, so nullable. */
    createdByMemberId: uuid("created_by_member_id"),
    /** Picked when creating the session (pin + radius converted to a polygon, or drawn). Split into blocks for planning. */
    plannedArea: geometry("planned_area", "Polygon").notNull(),
    status: sessionStatus("status").notNull().default("live"),
    startedAt: ts("started_at").notNull().defaultNow(),
    endedAt: ts("ended_at"),
    loadedMapId: uuid("loaded_map_id").references(() => maps.id, { onDelete: "set null" }),
    loadedLayers: text("loaded_layers")
      .array()
      .$type<Layer[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (t) => [
    // Codes only need to be unique among live sessions, so they can be reused later.
    uniqueIndex("sessions_live_join_code_idx")
      .on(t.joinCode)
      .where(sql`${t.status} = 'live'`),
    index("sessions_started_at_idx").on(t.startedAt),
  ],
);

/** Map cells (~1 km grid) a session has loaded. Together they make up the session area. */
export const sessionCells = pgTable(
  "session_cells",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    cellId: text("cell_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.cellId] })],
);

export const sessionMembers = pgTable(
  "session_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** null for guests and bots */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    colour: text("colour").notNull(),
    isBot: boolean("is_bot").notNull().default(false),
    joinedAt: ts("joined_at").notNull().defaultNow(),
    leftAt: ts("left_at"),
  },
  (t) => [index("session_members_session_idx").on(t.sessionId), index("session_members_user_idx").on(t.userId)],
);

/**
 * GPS pings. Converted to a TimescaleDB hypertable on `time` in a custom migration,
 * with compression after 1 day and retention of 7 days.
 * Hypertable unique indexes must include the time column, hence (client_id, time).
 */
export const pings = pgTable(
  "pings",
  {
    time: ts("time").notNull(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => sessionMembers.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    location: geometry("location", "Point").notNull(),
    accuracyM: real("accuracy_m").notNull(),
  },
  (t) => [
    uniqueIndex("pings_client_time_idx").on(t.clientId, t.time),
    index("pings_session_member_time_idx").on(t.sessionId, t.memberId, t.time),
  ],
);

/** id is the client-generated UUID (clientId in the API). */
/**
 * Hypertable on created_at (custom migration). The primary key includes created_at because
 * Timescale requires it. created_at comes from the phone (when the lead was marked), so an
 * offline retry has the same (id, created_at) and is deduplicated.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").notNull(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => sessionMembers.id, { onDelete: "cascade" }),
    houseId: bigint("house_id", { mode: "number" })
      .notNull()
      .references(() => houses.id),
    grade: leadGrade("grade").notNull(),
    /** Optional short note (max 140 chars, enforced by the API). */
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    /** Set on undo. */
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.createdAt] }),
    index("leads_session_idx").on(t.sessionId),
    index("leads_house_idx").on(t.houseId),
  ],
);

export const pins = pgTable(
  "pins",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => sessionMembers.id, { onDelete: "cascade" }),
    location: geometry("location", "Point").notNull(),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("pins_session_idx").on(t.sessionId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => sessionMembers.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_session_created_idx").on(t.sessionId, t.createdAt)],
);

export const sessionPlans = pgTable("session_plans", {
  sessionId: uuid("session_id")
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
  draft: jsonb("draft").$type<PlanContent>().notNull().default(EMPTY_PLAN),
  applied: jsonb("applied").$type<PlanContent>(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ============================== Processed session results ==============================

export const sessionPaths = pgTable(
  "session_paths",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => sessionMembers.id, { onDelete: "cascade" }),
    path: geometry("path", "MultiLineString").notNull(),
    distanceM: real("distance_m").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.memberId] }), index("session_paths_geom_idx").using("gist", t.path)],
);

/** Hypertable on first_seen (custom migration), feeding the knock_rate_hourly continuous aggregate. */
export const sessionStreetCoverage = pgTable(
  "session_street_coverage",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => sessionMembers.id, { onDelete: "cascade" }),
    streetId: bigint("street_id", { mode: "number" })
      .notNull()
      .references(() => streets.id),
    durationS: integer("duration_s").notNull(),
    classification: streetClassification("classification").notNull(),
    /** Houses whose nearest street is this one. Stored here so knock rate needs no join. */
    houses: integer("houses").notNull().default(0),
    firstSeen: ts("first_seen").notNull(),
    lastSeen: ts("last_seen").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.memberId, t.streetId, t.firstSeen] }),
    index("session_street_coverage_street_idx").on(t.streetId, t.lastSeen),
  ],
);

export const sessionBlockStats = pgTable(
  "session_block_stats",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    blockId: bigint("block_id", { mode: "number" })
      .notNull()
      .references(() => blocks.id),
    housesWorked: integer("houses_worked").notNull(),
    leadsA: integer("leads_a").notNull().default(0),
    leadsB: integer("leads_b").notNull().default(0),
    leadsC: integer("leads_c").notNull().default(0),
    lastWorkedAt: ts("last_worked_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.blockId] }), index("session_block_stats_block_idx").on(t.blockId)],
);

/** Uploads. The primary key makes uploading the same session to a team twice a no-op. */
export const teamSessions = pgTable(
  "team_sessions",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    uploadedAt: ts("uploaded_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.sessionId] }), index("team_sessions_session_idx").on(t.sessionId)],
);

// ============================== Map reference data (imported) ==============================

export const streets = pgTable(
  "streets",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    osmId: bigint("osm_id", { mode: "number" }),
    name: text("name"),
    geom: geometry("geom", "LineString").notNull(),
    lengthM: real("length_m").notNull(),
  },
  (t) => [index("streets_geom_idx").using("gist", t.geom)],
);

export const blocks = pgTable(
  "blocks",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    geom: geometry("geom", "Polygon").notNull(),
    houseCount: integer("house_count").notNull().default(0),
  },
  (t) => [index("blocks_geom_idx").using("gist", t.geom)],
);

export const houses = pgTable(
  "houses",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    geom: geometry("geom", "Polygon").notNull(),
    centroid: geometry("centroid", "Point").notNull(),
    blockId: bigint("block_id", { mode: "number" }).references(() => blocks.id),
    /** Nearest street, used to decide which houses a worked street covers. */
    streetId: bigint("street_id", { mode: "number" }).references(() => streets.id),
  },
  (t) => [
    index("houses_centroid_idx").using("gist", t.centroid),
    index("houses_block_idx").on(t.blockId),
    index("houses_street_idx").on(t.streetId),
  ],
);

/** Statistics Canada 2021 dissemination areas. */
export const censusAreas = pgTable(
  "census_areas",
  {
    dguid: text("dguid").primaryKey(),
    geom: geometry("geom", "MultiPolygon").notNull(),
    medianHouseholdIncome: integer("median_household_income"),
  },
  (t) => [index("census_areas_geom_idx").using("gist", t.geom)],
);
