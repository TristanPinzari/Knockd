-- Tiger Cloud has TimescaleDB enabled already; PostGIS needs to be turned on.
CREATE EXTENSION IF NOT EXISTS timescaledb;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS postgis;
