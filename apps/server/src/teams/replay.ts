/**
 * Session replay for the web: one uploaded session's members, matched paths, street coverage,
 * leads and final stats. Works after raw GPS points are deleted (it uses processed results).
 */
import { sql } from "drizzle-orm";
import type { GetTeamSessionRes } from "@knockd/shared";
import type { FeatureCollection } from "geojson";
import { db } from "../db/client";
import { notFound } from "../http/errors";
import { getStats } from "../sessions/stats";
import { listTeamSessions } from "./service";

const featureCollection = async (rows: SQL): Promise<FeatureCollection> => {
  const [r] = await db.execute<{ fc: FeatureCollection }>(sql`
    SELECT json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(f), '[]'::json)) AS fc
    FROM (${rows}) x`);
  return r!.fc;
};
type SQL = ReturnType<typeof sql>;

export async function getTeamSession(teamId: string, userId: string, sessionId: string): Promise<GetTeamSessionRes> {
  const [summary] = await listTeamSessions(teamId, userId, { sessionId }); // checks team membership
  if (!summary) throw notFound("That session isn't on this team");

  const [members, paths, coverage, leads, stats] = await Promise.all([
    db.execute<{ id: string; display_name: string; colour: string; user_id: string | null }>(sql`
      SELECT id, display_name, colour, user_id FROM session_members
      WHERE session_id = ${sessionId} AND removed_at IS NULL ORDER BY joined_at`),
    featureCollection(sql`
      SELECT json_build_object('type', 'Feature', 'geometry', ST_AsGeoJSON(path, 6)::json,
        'properties', json_build_object('memberId', member_id, 'distanceM', round(distance_m))) AS f
      FROM session_paths WHERE session_id = ${sessionId}`),
    featureCollection(sql`
      SELECT json_build_object('type', 'Feature', 'geometry', ST_AsGeoJSON(st.geom, 6)::json,
        'properties', json_build_object('memberId', c.member_id, 'streetId', c.street_id, 'durationS', c.duration_s,
          'classification', c.classification, 'firstSeen', c.first_seen, 'lastSeen', c.last_seen)) AS f
      FROM session_street_coverage c JOIN streets st ON st.id = c.street_id
      WHERE c.session_id = ${sessionId}
      ORDER BY c.first_seen`),
    db.execute<{
      id: string;
      member_id: string;
      house_id: number;
      grade: "A" | "B" | "C";
      note: string | null;
      created_at: Date;
      updated_at: Date;
      lat: number;
      lng: number;
    }>(sql`
      SELECT l.id, l.member_id, l.house_id, l.grade, l.note, l.created_at, l.updated_at,
             ST_Y(h.centroid) AS lat, ST_X(h.centroid) AS lng
      FROM leads l JOIN houses h ON h.id = l.house_id
      WHERE l.session_id = ${sessionId} AND l.deleted_at IS NULL
      ORDER BY l.created_at`),
    getStats(sessionId),
  ]);

  return {
    session: summary,
    members: members.map((m) => ({
      id: m.id,
      displayName: m.display_name,
      colour: m.colour,
      isGuest: m.user_id === null,
    })),
    paths,
    coverage,
    leads: leads.map((l) => ({
      clientId: l.id,
      memberId: l.member_id,
      houseId: Number(l.house_id),
      grade: l.grade,
      note: l.note,
      createdAt: new Date(l.created_at).toISOString(),
      updatedAt: new Date(l.updated_at).toISOString(),
      lat: l.lat,
      lng: l.lng,
    })),
    stats,
  };
}
