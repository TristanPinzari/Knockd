/**
 * Team maps: saved views over a team's uploaded sessions (optional boundary + date range),
 * and the queries the web map and in-session layers are drawn from.
 *
 * Scope of every query = the team's uploaded sessions, within the map's date range,
 * started before `asOf` (time slider), inside the map's boundary and the requested bbox.
 */
import { eq, sql, type SQL } from "drizzle-orm";
import type {
  Bbox,
  CreateMapBody,
  Grade,
  GradeCounts,
  MapBlocksRes,
  MapLeadsRes,
  MapStatsRes,
  MapView,
  PatchMapBody,
  WhereNextRes,
  SessionLayersRes,
} from "@knockd/shared";
import { cellBounds, type CellId } from "@knockd/shared";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { db } from "../db/client";
import { envelope, featureCollection } from "../db/sql-helpers";
import { maps, sessions } from "../db/schema";
import { notFound } from "../http/errors";
import { queryHighlights, queryNotes } from "../teams/markings";
import { requireEditor, requireMember } from "../teams/service";

/** Lead rate needs this many houses worked before a block gets a colour (otherwise grey). */
export const LEAD_RATE_MIN_HOUSES = 15;
/** Small samples are nudged toward the team average: (AB + k·teamRate) / (houses + k). */
const LEAD_RATE_SMOOTHING_K = 15;
const MAX_FEATURES = 5000;

type MapRow = {
  id: string;
  teamId: string;
  name: string;
  boundary: Polygon | MultiPolygon | null;
  fromDate: Date | null;
  toDate: Date | null;
  createdAt: Date;
};

const toMapView = (m: MapRow): MapView => ({
  id: m.id,
  teamId: m.teamId,
  name: m.name,
  boundary: m.boundary,
  from: m.fromDate?.toISOString() ?? null,
  to: m.toDate?.toISOString() ?? null,
  createdAt: m.createdAt.toISOString(),
});

const mapColumns = {
  id: maps.id,
  teamId: maps.teamId,
  name: maps.name,
  boundary: sql<Polygon | MultiPolygon | null>`ST_AsGeoJSON(${maps.boundary}, 6)::json`,
  fromDate: maps.fromDate,
  toDate: maps.toDate,
  createdAt: maps.createdAt,
};

const boundarySql = (geojson: unknown) =>
  sql`ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geojson)}), 4326))`;

// ============================== CRUD ==============================

/** Loads a map the user can see (they're on its team). 404 otherwise. */
export async function getMap(mapId: string, userId: string): Promise<MapRow> {
  const [m] = await db.select(mapColumns).from(maps).where(eq(maps.id, mapId));
  if (!m) throw notFound("Map not found");
  await requireMember(m.teamId, userId).catch(() => {
    throw notFound("Map not found");
  });
  return m;
}

export async function listMaps(teamId: string, userId: string): Promise<MapView[]> {
  await requireMember(teamId, userId);
  const rows = await db.select(mapColumns).from(maps).where(eq(maps.teamId, teamId)).orderBy(maps.name);
  return rows.map(toMapView);
}

export async function createMap(teamId: string, userId: string, body: CreateMapBody): Promise<MapView> {
  await requireEditor(teamId, userId);
  const [row] = await db
    .insert(maps)
    .values({
      teamId,
      name: body.name,
      boundary: body.boundary ? boundarySql(body.boundary) : null,
      fromDate: body.from ? new Date(body.from) : null,
      toDate: body.to ? new Date(body.to) : null,
      createdBy: userId,
    })
    .returning({ id: maps.id });
  return toMapView(await getMap(row!.id, userId));
}

export async function updateMap(mapId: string, userId: string, body: PatchMapBody): Promise<MapView> {
  const m = await getMap(mapId, userId);
  await requireEditor(m.teamId, userId);
  await db
    .update(maps)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.boundary !== undefined && { boundary: body.boundary ? boundarySql(body.boundary) : null }),
      ...(body.from !== undefined && { fromDate: body.from ? new Date(body.from) : null }),
      ...(body.to !== undefined && { toDate: body.to ? new Date(body.to) : null }),
    })
    .where(eq(maps.id, mapId));
  return toMapView(await getMap(mapId, userId));
}

export async function deleteMap(mapId: string, userId: string): Promise<void> {
  const m = await getMap(mapId, userId);
  await requireEditor(m.teamId, userId);
  await db.delete(maps).where(eq(maps.id, mapId));
}

// ============================== Scope helpers ==============================

/** Session IDs in the map's scope. */
function scopeSessions(m: MapRow, asOf?: string): SQL {
  return sql`(
    SELECT ts.session_id FROM team_sessions ts JOIN sessions s ON s.id = ts.session_id
    WHERE ts.team_id = ${m.teamId}
      ${m.fromDate ? sql`AND s.started_at >= ${m.fromDate.toISOString()}` : sql``}
      ${m.toDate ? sql`AND s.started_at < ${m.toDate.toISOString()}` : sql``}
      ${asOf ? sql`AND s.started_at <= ${asOf}` : sql``}
  )`;
}

/** `AND <geom> is inside the map's boundary` (nothing if the map has no boundary). */
const inBoundary = (m: MapRow, geom: SQL) =>
  m.boundary ? sql`AND ST_Intersects(${geom}, (SELECT boundary FROM maps WHERE id = ${m.id}))` : sql``;

// ============================== Queries ==============================

/**
 * Street segments covered in the map's sessions, one feature per member per street per session.
 * The client draws them with visibility = duration × age (fading over the team's fadeDays).
 */
export async function mapPaths(m: MapRow, bbox: Bbox, asOf?: string): Promise<FeatureCollection> {
  const env = envelope(bbox);
  return featureCollection(sql`
    SELECT json_build_object(
      'type', 'Feature',
      'geometry', ST_AsGeoJSON(st.geom, 6)::json,
      'properties', json_build_object(
        'sessionId', c.session_id, 'memberName', m.display_name, 'streetId', st.id,
        'durationS', c.duration_s, 'classification', c.classification, 'workedAt', c.last_seen)) AS f
    FROM session_street_coverage c
    JOIN streets st ON st.id = c.street_id
    JOIN session_members m ON m.id = c.member_id
    WHERE c.session_id IN ${scopeSessions(m, asOf)}
      ${asOf ? sql`AND c.first_seen <= ${asOf}` : sql``}
      AND st.geom && ${env}
      ${inBoundary(m, sql`st.geom`)}
    ORDER BY c.last_seen DESC
    LIMIT ${MAX_FEATURES}`);
}

/** Per-block results with the smoothed lead rate (null = not enough data yet). */
export async function mapBlocks(m: MapRow, bbox: Bbox, asOf?: string): Promise<MapBlocksRes> {
  const env = envelope(bbox);
  const [team] = await db.execute<{ hw: number; ab: number }>(sql`
    SELECT coalesce(sum(s.houses_worked), 0)::int AS hw, coalesce(sum(s.leads_a + s.leads_b), 0)::int AS ab
    FROM session_block_stats s JOIN blocks b ON b.id = s.block_id
    WHERE s.session_id IN ${scopeSessions(m, asOf)} ${inBoundary(m, sql`b.geom`)}`);
  const teamRate = team && team.hw > 0 ? team.ab / team.hw : 0;

  const rows = await db.execute<{ block_id: number; hw: number; a: number; b: number; c: number; last: Date | null }>(
    sql`
      SELECT s.block_id, sum(s.houses_worked)::int AS hw,
             sum(s.leads_a)::int AS a, sum(s.leads_b)::int AS b, sum(s.leads_c)::int AS c,
             max(s.last_worked_at) AS last
      FROM session_block_stats s JOIN blocks bl ON bl.id = s.block_id
      WHERE s.session_id IN ${scopeSessions(m, asOf)}
        AND bl.geom && ${env}
        ${inBoundary(m, sql`bl.geom`)}
      GROUP BY s.block_id
      LIMIT ${MAX_FEATURES}`,
  );
  return {
    blocks: rows.map((r) => ({
      blockId: Number(r.block_id),
      rate:
        r.hw >= LEAD_RATE_MIN_HOUSES
          ? Math.min(1, (r.a + r.b + LEAD_RATE_SMOOTHING_K * teamRate) / (r.hw + LEAD_RATE_SMOOTHING_K))
          : null,
      housesWorked: r.hw,
      leads: { A: r.a, B: r.b, C: r.c },
      lastWorkedAt: r.last ? new Date(r.last).toISOString() : null,
    })),
  };
}

/** The latest lead per house (grade, note, when), for references and the leads layer. */
export async function mapLeads(m: MapRow, bbox: Bbox, grades?: Grade[], asOf?: string): Promise<MapLeadsRes> {
  const env = envelope(bbox);
  const rows = await db.execute<{
    house_id: number;
    grade: Grade;
    note: string | null;
    at: Date;
    lat: number;
    lng: number;
  }>(sql`
    SELECT DISTINCT ON (l.house_id) l.house_id, l.grade, l.note, l.updated_at AS at,
           ST_Y(h.centroid) AS lat, ST_X(h.centroid) AS lng
    FROM leads l JOIN houses h ON h.id = l.house_id
    WHERE l.session_id IN ${scopeSessions(m, asOf)}
      AND l.deleted_at IS NULL
      ${asOf ? sql`AND l.created_at <= ${asOf}` : sql``}
      ${
        grades?.length
          ? sql`AND l.grade IN (${sql.join(
              grades.map((g) => sql`${g}`),
              sql`, `,
            )})`
          : sql``
      }
      AND h.centroid && ${env}
      ${inBoundary(m, sql`h.centroid`)}
    ORDER BY l.house_id, l.updated_at DESC
    LIMIT ${MAX_FEATURES}`);
  return {
    leads: rows.map((r) => ({
      houseId: Number(r.house_id),
      grade: r.grade,
      note: r.note,
      at: new Date(r.at).toISOString(),
      lat: r.lat,
      lng: r.lng,
    })),
  };
}

export async function mapStats(m: MapRow, range: { from?: string; to?: string }): Promise<MapStatsRes> {
  const sessions = sql`(
    SELECT id FROM sessions WHERE id IN ${scopeSessions(m)}
      ${range.from ? sql`AND started_at >= ${range.from}` : sql``}
      ${range.to ? sql`AND started_at < ${range.to}` : sql``}
  )`;
  const [r] = await db.execute<{
    sessions: number;
    hw: number;
    streets: number;
    distance: number;
    a: number;
    b: number;
    c: number;
  }>(sql`
    SELECT
      (SELECT count(*) FROM ${sessions} s)::int AS sessions,
      (SELECT coalesce(sum(x.houses_worked), 0) FROM session_block_stats x JOIN blocks b ON b.id = x.block_id
        WHERE x.session_id IN ${sessions} ${inBoundary(m, sql`b.geom`)})::int AS hw,
      (SELECT count(DISTINCT c.street_id) FROM session_street_coverage c JOIN streets st ON st.id = c.street_id
        WHERE c.session_id IN ${sessions} AND c.classification = 'worked' ${inBoundary(m, sql`st.geom`)})::int AS streets,
      (SELECT coalesce(sum(p.distance_m), 0) FROM session_paths p WHERE p.session_id IN ${sessions})::float AS distance,
      (SELECT count(*) FILTER (WHERE l.grade = 'A') FROM leads l JOIN houses h ON h.id = l.house_id
        WHERE l.session_id IN ${sessions} AND l.deleted_at IS NULL ${inBoundary(m, sql`h.centroid`)})::int AS a,
      (SELECT count(*) FILTER (WHERE l.grade = 'B') FROM leads l JOIN houses h ON h.id = l.house_id
        WHERE l.session_id IN ${sessions} AND l.deleted_at IS NULL ${inBoundary(m, sql`h.centroid`)})::int AS b,
      (SELECT count(*) FILTER (WHERE l.grade = 'C') FROM leads l JOIN houses h ON h.id = l.house_id
        WHERE l.session_id IN ${sessions} AND l.deleted_at IS NULL ${inBoundary(m, sql`h.centroid`)})::int AS c`);
  const leads: GradeCounts = { A: r!.a, B: r!.b, C: r!.c };
  return {
    sessions: r!.sessions,
    housesWorked: r!.hw,
    streetsWorked: r!.streets,
    distanceM: Math.round(r!.distance),
    leads,
    leadRate: r!.hw > 0 ? Math.min(1, (leads.A + leads.B) / r!.hw) : null,
  };
}

/**
 * Where next: blocks near `near` ranked by (median household income) × (time since last worked).
 * Never-worked blocks count as maximally stale; blocks without census income count as average.
 */
export async function whereNext(m: MapRow, near: { lat: number; lng: number }, limit: number): Promise<WhereNextRes> {
  const point = sql`ST_SetSRID(ST_MakePoint(${near.lng}, ${near.lat}), 4326)`;
  const rows = await db.execute<{
    block_id: number;
    lat: number;
    lng: number;
    income: number | null;
    days: number | null;
    score: number;
  }>(sql`
    WITH worked AS (
      SELECT s.block_id, max(s.last_worked_at) AS last
      FROM session_block_stats s WHERE s.session_id IN ${scopeSessions(m)} AND s.houses_worked > 0
      GROUP BY s.block_id
    ),
    cand AS (
      SELECT b.id, ST_Centroid(b.geom) AS c,
             (SELECT ca.median_household_income FROM census_areas ca
               WHERE ST_Contains(ca.geom, ST_Centroid(b.geom)) LIMIT 1) AS income,
             floor(EXTRACT(EPOCH FROM (now() - w.last)) / 86400)::int AS days
      FROM blocks b LEFT JOIN worked w ON w.block_id = b.id
      WHERE b.house_count >= 5
        AND b.geom && ST_Expand(${point}, 0.04)
        AND ST_DWithin(ST_Centroid(b.geom)::geography, ${point}::geography, 3000)
        ${inBoundary(m, sql`b.geom`)}
    ),
    norm AS (SELECT max(income)::float AS max_income, avg(income)::float AS avg_income FROM cand)
    SELECT cand.id AS block_id, ST_Y(c) AS lat, ST_X(c) AS lng, income, days,
           (coalesce(income, norm.avg_income, 1) / greatest(coalesce(norm.max_income, 1), 1))
             * least(coalesce(days, 365), 365) / 365.0 AS score
    FROM cand, norm
    ORDER BY score DESC, ST_Distance(c, ${point})
    LIMIT ${limit}`);
  return {
    suggestions: rows.map((r) => ({
      blockId: Number(r.block_id),
      centroid: { lat: r.lat, lng: r.lng },
      medianIncome: r.income,
      daysSinceWorked: r.days,
      score: Math.round(r.score * 1000) / 1000,
    })),
  };
}

/** Blocks with house counts in a bbox (for building plans on the web, outside a session). */
export async function geoBlocks(bbox: Bbox): Promise<FeatureCollection> {
  return featureCollection(sql`
    SELECT json_build_object('type', 'Feature', 'id', id, 'geometry', ST_AsGeoJSON(geom, 6)::json,
           'properties', json_build_object('blockId', id, 'houseCount', house_count)) AS f
    FROM blocks WHERE geom && ${envelope(bbox)}
    LIMIT ${MAX_FEATURES}`);
}

// ============================== Team data loaded into a session ==============================

/**
 * Layers from the map the session creator loaded, for the requested cells: previous leads
 * (references), past coverage and lead-rate colours. Empty if no map was loaded.
 */
export async function sessionLayers(sessionId: string, cells: CellId[]): Promise<SessionLayersRes> {
  const [s] = await db
    .select({ mapId: sessions.loadedMapId, layers: sessions.loadedLayers })
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!s?.mapId || !s.layers.length) return {};
  const [m] = await db.select(mapColumns).from(maps).where(eq(maps.id, s.mapId));
  if (!m) return {};

  const bounds = cells.map(cellBounds);
  const bbox: Bbox = {
    minLat: Math.min(...bounds.map((b) => b.minLat)),
    minLng: Math.min(...bounds.map((b) => b.minLng)),
    maxLat: Math.max(...bounds.map((b) => b.maxLat)),
    maxLng: Math.max(...bounds.map((b) => b.maxLng)),
  };
  const [leads, coverage, blocks, highlights, notes] = await Promise.all([
    s.layers.includes("leads") ? mapLeads(m, bbox) : null,
    s.layers.includes("coverage") ? mapPaths(m, bbox) : null,
    s.layers.includes("leadRate") ? mapBlocks(m, bbox) : null,
    s.layers.includes("highlights") ? queryHighlights(m.teamId, bbox) : null,
    s.layers.includes("notes") ? queryNotes(m.teamId, bbox) : null,
  ]);
  return {
    ...(leads && { leads: leads.leads.map(({ houseId, grade, note, at }) => ({ houseId, grade, note, at })) }),
    ...(coverage && { coverage }),
    ...(blocks && {
      leadRate: blocks.blocks.map(({ blockId, rate, housesWorked }) => ({ blockId, rate, housesWorked })),
    }),
    ...(highlights && { highlights }),
    ...(notes && { notes }),
  };
}
