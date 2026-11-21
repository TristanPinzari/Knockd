-- Turn pings into a hypertable partitioned by day.
SELECT create_hypertable('pings', by_range('time', INTERVAL '1 day'));--> statement-breakpoint

-- Compress pings older than 1 day, grouped per member so a session's trail stays together.
ALTER TABLE pings SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'session_id, member_id',
  timescaledb.compress_orderby = 'time'
);--> statement-breakpoint
SELECT add_compression_policy('pings', INTERVAL '1 day');--> statement-breakpoint

-- Raw pings are deleted after 7 days (the upload grace period).
-- Processed results (paths, street coverage, block stats) are kept separately.
SELECT add_retention_policy('pings', INTERVAL '7 days');

-- Continuous aggregates (knock rate, leads over time) come in a later migration.
-- They can't be created inside a transaction, so they'll need their own migration step.
