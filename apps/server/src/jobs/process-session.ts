/**
 * End-of-session processing: turns raw GPS pings into street coverage, paths and block stats.
 *
 * Map matching is done in PostGIS: each ping is snapped to the nearest street segment
 * (streets are split at every intersection). For someone walking door to door on residential
 * streets that's accurate enough, and needs no extra service. Re-running is safe: previous
 * results for the session are replaced.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { logger } from "../logger";
import { emitToSession } from "../realtime/io";

/** Tunable thresholds. Check them against a real test walk. */
export const PROCESSING = {
  /** Pings less accurate than this are ignored. */
  maxAccuracyM: 30,
  /** Pings further than this from any street aren't matched to one (~30 m). */
  snapDistanceDeg: 0.0003,
  /** Faster than this (m/s) between two pings counts as driving and is ignored. 2.5 m/s = 9 km/h. */
  maxWalkingSpeedMs: 2.5,
  /** Gaps between pings longer than this count as this long (phone asleep, lunch break). */
  maxGapS: 60,
  /** A street is "worked" if time on it ≥ this many seconds per metre (1.2 s/m = 2 min per 100 m)… */
  workedSecondsPerMetre: 1.2,
  /** …and at least this many seconds in total. */
  workedMinSeconds: 45,
} as const;

/** Longest one session's processing may take before it's abandoned (and retried by maintenance). */
const PROCESSING_TIMEOUT = "2min";

export async function processSession(sessionId: string): Promise<void> {
  const started = Date.now();
  const P = PROCESSING;

  const done = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = ${sql.raw(`'${PROCESSING_TIMEOUT}'`)}`);
    // SKIP LOCKED: if another connection is already processing this session (another server, or a
    // stuck connection from one that died mid-way), don't wait for it: that would stall the whole
    // one-at-a-time queue. Maintenance retries ended sessions every 10 minutes.
    const [s] = await tx.execute<{ status: string }>(
      sql`SELECT status FROM sessions WHERE id = ${sessionId} FOR UPDATE SKIP LOCKED`,
    );
    if (!s) return false; // gone, or being processed elsewhere
    if (s.status === "live") return false; // reopened: nothing to do

    // Replace any earlier results.
    await tx.execute(sql`DELETE FROM session_street_coverage WHERE session_id = ${sessionId}`);
    await tx.execute(sql`DELETE FROM session_paths WHERE session_id = ${sessionId}`);
    await tx.execute(sql`DELETE FROM session_block_stats WHERE session_id = ${sessionId}`);

    // 1. Snap pings to streets, with the time and distance to each member's next ping.
    await tx.execute(sql`
      CREATE TEMP TABLE snapped ON COMMIT DROP AS
      WITH p AS (
        SELECT member_id, time, location,
               lead(time) OVER w AS next_time,
               lead(location) OVER w AS next_location
        FROM pings
        WHERE session_id = ${sessionId} AND accuracy_m <= ${P.maxAccuracyM}
        WINDOW w AS (PARTITION BY member_id ORDER BY time)
      )
      SELECT p.member_id, p.time, p.location, near.street_id,
             EXTRACT(EPOCH FROM (p.next_time - p.time)) AS raw_dt,
             ST_Distance(p.location::geography, p.next_location::geography) AS step_m
      FROM p
      LEFT JOIN LATERAL (
        SELECT st.id AS street_id FROM streets st
        WHERE ST_DWithin(st.geom, p.location, ${P.snapDistanceDeg})
        ORDER BY st.geom <-> p.location
        LIMIT 1
      ) near ON true`);
    await tx.execute(sql`
      ALTER TABLE snapped
        ADD COLUMN driving boolean,
        ADD COLUMN dt double precision`);
    await tx.execute(sql`
      UPDATE snapped SET
        driving = coalesce(raw_dt > 0 AND step_m / raw_dt > ${P.maxWalkingSpeedMs}, false),
        dt = least(raw_dt, ${P.maxGapS})`);

    // 2. Time per member per street → worked or passed by.
    await tx.execute(sql`
      INSERT INTO session_street_coverage
        (session_id, member_id, street_id, duration_s, classification, houses, first_seen, last_seen)
      SELECT ${sessionId}, sn.member_id, sn.street_id, round(sum(sn.dt))::int,
             (CASE WHEN sum(sn.dt) >= greatest(${P.workedMinSeconds}, st.length_m * ${P.workedSecondsPerMetre})
                   THEN 'worked' ELSE 'passed' END)::street_classification,
             coalesce(hc.n, 0),
             min(sn.time), max(sn.time)
      FROM snapped sn
      JOIN streets st ON st.id = sn.street_id
      LEFT JOIN (SELECT street_id, count(*)::int AS n FROM houses GROUP BY street_id) hc ON hc.street_id = sn.street_id
      WHERE sn.dt IS NOT NULL AND NOT sn.driving
      GROUP BY sn.member_id, sn.street_id, st.length_m, hc.n`);

    // 3. Each member's path, snapped onto the streets, and walking distance (driving excluded).
    await tx.execute(sql`
      INSERT INTO session_paths (session_id, member_id, path, distance_m)
      SELECT ${sessionId}, member_id,
             ST_Multi(ST_MakeLine(point ORDER BY time)),
             coalesce(sum(step_m) FILTER (WHERE NOT driving), 0)
      FROM (
        SELECT sn.*,
               CASE WHEN sn.street_id IS NULL THEN sn.location
                    ELSE ST_ClosestPoint((SELECT geom FROM streets WHERE id = sn.street_id), sn.location) END AS point
        FROM snapped sn
      ) x
      GROUP BY member_id
      HAVING count(*) >= 2`);

    // 4. Per block: houses on worked streets, leads by grade, when it was last worked.
    await tx.execute(sql`
      INSERT INTO session_block_stats
        (session_id, block_id, houses_worked, leads_a, leads_b, leads_c, last_worked_at)
      WITH worked AS (
        SELECT street_id, max(last_seen) AS last_seen
        FROM session_street_coverage
        WHERE session_id = ${sessionId} AND classification = 'worked'
        GROUP BY street_id
      ),
      hw AS (
        SELECT h.block_id, count(*)::int AS houses_worked, max(w.last_seen) AS last_worked
        FROM houses h JOIN worked w ON w.street_id = h.street_id
        WHERE h.block_id IS NOT NULL
        GROUP BY h.block_id
      ),
      ld AS (
        SELECT h.block_id,
               count(*) FILTER (WHERE l.grade = 'A')::int AS a,
               count(*) FILTER (WHERE l.grade = 'B')::int AS b,
               count(*) FILTER (WHERE l.grade = 'C')::int AS c,
               max(l.created_at) AS last_lead
        FROM leads l JOIN houses h ON h.id = l.house_id
        WHERE l.session_id = ${sessionId} AND l.deleted_at IS NULL AND h.block_id IS NOT NULL
        GROUP BY h.block_id
      )
      SELECT ${sessionId}, coalesce(hw.block_id, ld.block_id), coalesce(hw.houses_worked, 0),
             coalesce(ld.a, 0), coalesce(ld.b, 0), coalesce(ld.c, 0),
             greatest(hw.last_worked, ld.last_lead)
      FROM hw FULL JOIN ld ON ld.block_id = hw.block_id`);

    await tx.execute(sql`UPDATE sessions SET status = 'processed' WHERE id = ${sessionId}`);
    return true;
  });
  if (!done) return;

  emitToSession(sessionId, "session:processed");
  logger.info({ sessionId, ms: Date.now() - started }, "session processed");
}
