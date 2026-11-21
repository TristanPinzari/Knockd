-- leads: partitioned by when the lead was marked. Small table, so large chunks.
SELECT create_hypertable('leads', by_range('created_at', INTERVAL '30 days'));--> statement-breakpoint

-- session_street_coverage: partitioned by when the street was first walked.
SELECT create_hypertable('session_street_coverage', by_range('first_seen', INTERVAL '30 days'));

-- Continuous aggregates on these (and pings) are in src/db/continuous-aggregates.sql,
-- applied by `pnpm db:migrate` after the Drizzle migrations, outside a transaction.
