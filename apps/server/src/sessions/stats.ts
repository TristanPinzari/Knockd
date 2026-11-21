/**
 * Session stats: the live leaderboard during a session and end-of-day stats after.
 * Leads and active time are exact. Distance is estimated from raw pings until the session
 * is processed; street and block numbers only exist after processing (`final: true`).
 */
import { eq, sql } from "drizzle-orm";
import type { GradeCounts, SessionStatsRes, Stats } from "@knockd/shared";
import { db } from "../db/client";
import { sessionMembers, sessions } from "../db/schema";
import { HttpError } from "../http/errors";

/** A block counts as completed once this share of its houses is on worked streets. */
const BLOCK_COMPLETE_SHARE = 0.8;

const emptyStats = (): Stats => ({
  streetsWorked: 0,
  streetsPassed: 0,
  blocksCompleted: 0,
  housesCovered: 0,
  leads: { A: 0, B: 0, C: 0 },
  distanceM: 0,
  activeS: 0,
});

export async function getStats(sessionId: string): Promise<SessionStatsRes> {
  const [session] = await db.select({ status: sessions.status }).from(sessions).where(eq(sessions.id, sessionId));
  if (!session) throw new HttpError(404, "session_not_found", "Session not found");
  const final = session.status === "processed";

  const [members, leadRows, activeRows, distanceRows, streetRows, blocksDone] = await Promise.all([
    db
      .select({ id: sessionMembers.id })
      .from(sessionMembers)
      .where(sql`${sessionMembers.sessionId} = ${sessionId} AND ${sessionMembers.removedAt} IS NULL`),
    db.execute<{ member_id: string; grade: keyof GradeCounts; n: number }>(sql`
      SELECT member_id, grade, count(*)::int AS n FROM leads
      WHERE session_id = ${sessionId} AND deleted_at IS NULL GROUP BY member_id, grade`),
    // Active minutes from the continuous aggregate (kept even after raw pings are deleted).
    db.execute<{ member_id: string; active_s: number }>(sql`
      SELECT member_id, (count(*) * 60)::int AS active_s FROM member_activity_1m
      WHERE session_id = ${sessionId} GROUP BY member_id`),
    final
      ? db.execute<{ member_id: string; distance_m: number }>(sql`
          SELECT member_id, distance_m FROM session_paths WHERE session_id = ${sessionId}`)
      : db.execute<{ member_id: string; distance_m: number }>(sql`
          SELECT member_id, ST_Length(ST_MakeLine(location ORDER BY time)::geography) AS distance_m
          FROM pings WHERE session_id = ${sessionId} GROUP BY member_id`),
    db.execute<{ member_id: string; worked: number; passed: number; houses: number }>(sql`
      SELECT member_id,
             count(*) FILTER (WHERE classification = 'worked')::int AS worked,
             count(*) FILTER (WHERE classification = 'passed')::int AS passed,
             coalesce(sum(houses) FILTER (WHERE classification = 'worked'), 0)::int AS houses
      FROM session_street_coverage WHERE session_id = ${sessionId} GROUP BY member_id`),
    db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM session_block_stats s JOIN blocks b ON b.id = s.block_id
      WHERE s.session_id = ${sessionId} AND s.houses_worked >= b.house_count * ${BLOCK_COMPLETE_SHARE}::numeric`),
  ]);

  const byMember = new Map<string, Stats>(members.map((m) => [m.id, emptyStats()]));
  const get = (id: string) => byMember.get(id) ?? byMember.set(id, emptyStats()).get(id)!;
  for (const r of leadRows) get(r.member_id).leads[r.grade] += r.n;
  for (const r of activeRows) get(r.member_id).activeS = r.active_s;
  for (const r of distanceRows) get(r.member_id).distanceM = Math.round(r.distance_m ?? 0);
  for (const r of streetRows) {
    const s = get(r.member_id);
    s.streetsWorked = r.worked;
    s.streetsPassed = r.passed;
    s.housesCovered = r.houses;
  }

  const crew = emptyStats();
  for (const s of byMember.values()) {
    crew.streetsWorked += s.streetsWorked;
    crew.streetsPassed += s.streetsPassed;
    crew.housesCovered += s.housesCovered;
    crew.distanceM += s.distanceM;
    crew.activeS += s.activeS;
    crew.leads.A += s.leads.A;
    crew.leads.B += s.leads.B;
    crew.leads.C += s.leads.C;
  }
  crew.blocksCompleted = blocksDone[0]?.n ?? 0;

  return { crew, members: [...byMember].map(([memberId, s]) => ({ memberId, ...s })), final };
}
