-- TimescaleDB continuous aggregates. Applied by `pnpm db:migrate` after the Drizzle migrations.
-- They can't be created inside a transaction, so each statement (split on the breakpoint
-- markers) runs on its own. Everything is idempotent, so re-running is safe.
-- To change an aggregate's definition: DROP MATERIALIZED VIEW it, then re-run.

-- ---------- 1. Activity per member per minute (from pings) ----------
-- A minute with at least one ping counts as an active minute.
-- Raw pings are deleted after 7 days; the refresh window (6 days) stays inside that,
-- so this summary is kept after the raw GPS points are gone.
CREATE MATERIALIZED VIEW IF NOT EXISTS member_activity_1m
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket(INTERVAL '1 minute', time) AS bucket,
  session_id,
  member_id,
  count(*) AS pings
FROM pings
GROUP BY bucket, session_id, member_id
WITH NO DATA;
--> statement-breakpoint
SELECT add_continuous_aggregate_policy('member_activity_1m',
  start_offset => INTERVAL '6 days',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists => true);
--> statement-breakpoint

-- ---------- 2. Leads per member per hour (from leads) ----------
-- Undone leads (deleted_at set) are excluded. Late offline leads land in older buckets,
-- so the refresh covers all history (start_offset => NULL).
CREATE MATERIALIZED VIEW IF NOT EXISTS leads_hourly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket(INTERVAL '1 hour', created_at) AS bucket,
  session_id,
  member_id,
  sum(CASE WHEN grade = 'A' THEN 1 ELSE 0 END) AS leads_a,
  sum(CASE WHEN grade = 'B' THEN 1 ELSE 0 END) AS leads_b,
  sum(CASE WHEN grade = 'C' THEN 1 ELSE 0 END) AS leads_c
FROM leads
WHERE deleted_at IS NULL
GROUP BY bucket, session_id, member_id
WITH NO DATA;
--> statement-breakpoint
SELECT add_continuous_aggregate_policy('leads_hourly',
  start_offset => NULL,
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists => true);
--> statement-breakpoint

-- ---------- 3. Knock rate per member per hour (from processed street coverage) ----------
-- houses_worked / worked_s × 3600 = houses per hour. Summed per crew, this is the learned
-- knock rate used as the default for planning suggestions.
CREATE MATERIALIZED VIEW IF NOT EXISTS knock_rate_hourly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket(INTERVAL '1 hour', first_seen) AS bucket,
  session_id,
  member_id,
  sum(CASE WHEN classification = 'worked' THEN houses ELSE 0 END) AS houses_worked,
  sum(CASE WHEN classification = 'worked' THEN duration_s ELSE 0 END) AS worked_s
FROM session_street_coverage
GROUP BY bucket, session_id, member_id
WITH NO DATA;
--> statement-breakpoint
SELECT add_continuous_aggregate_policy('knock_rate_hourly',
  start_offset => NULL,
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => true);
