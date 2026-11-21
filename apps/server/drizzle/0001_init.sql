CREATE TYPE "public"."lead_grade" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('live', 'ended', 'processed');--> statement-breakpoint
CREATE TYPE "public"."street_classification" AS ENUM('worked', 'passed');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "blocks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"geom" geometry(Polygon, 4326) NOT NULL,
	"house_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "census_areas" (
	"dguid" text PRIMARY KEY NOT NULL,
	"geom" geometry(MultiPolygon, 4326) NOT NULL,
	"median_household_income" integer
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "houses" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "houses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"geom" geometry(Polygon, 4326) NOT NULL,
	"centroid" geometry(Point, 4326) NOT NULL,
	"block_id" bigint,
	"street_id" bigint
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"house_id" bigint NOT NULL,
	"grade" "lead_grade" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"boundary" geometry(MultiPolygon, 4326),
	"from_date" timestamp with time zone,
	"to_date" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pings" (
	"time" timestamp with time zone NOT NULL,
	"session_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"location" geometry(Point, 4326) NOT NULL,
	"accuracy_m" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"location" geometry(Point, 4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"map_id" uuid,
	"name" text NOT NULL,
	"groups" jsonb NOT NULL,
	"used_in_session_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_block_stats" (
	"session_id" uuid NOT NULL,
	"block_id" bigint NOT NULL,
	"houses_worked" integer NOT NULL,
	"leads_a" integer DEFAULT 0 NOT NULL,
	"leads_b" integer DEFAULT 0 NOT NULL,
	"leads_c" integer DEFAULT 0 NOT NULL,
	"last_worked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_block_stats_session_id_block_id_pk" PRIMARY KEY("session_id","block_id")
);
--> statement-breakpoint
CREATE TABLE "session_cells" (
	"session_id" uuid NOT NULL,
	"cell_id" text NOT NULL,
	CONSTRAINT "session_cells_session_id_cell_id_pk" PRIMARY KEY("session_id","cell_id")
);
--> statement-breakpoint
CREATE TABLE "session_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"colour" text NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session_paths" (
	"session_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"path" geometry(MultiLineString, 4326) NOT NULL,
	"distance_m" real NOT NULL,
	CONSTRAINT "session_paths_session_id_member_id_pk" PRIMARY KEY("session_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "session_plans" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"draft" jsonb DEFAULT '{"groups":[],"drawings":[],"notes":[]}'::jsonb NOT NULL,
	"applied" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_street_coverage" (
	"session_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"street_id" bigint NOT NULL,
	"duration_s" integer NOT NULL,
	"classification" "street_classification" NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	CONSTRAINT "session_street_coverage_session_id_member_id_street_id_pk" PRIMARY KEY("session_id","member_id","street_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"join_code" text NOT NULL,
	"created_by_user_id" uuid,
	"created_by_member_id" uuid,
	"status" "session_status" DEFAULT 'live' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"loaded_map_id" uuid,
	"loaded_layers" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streets" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "streets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"osm_id" bigint,
	"name" text,
	"geom" geometry(LineString, 4326) NOT NULL,
	"length_m" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_invites" (
	"token" text PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "team_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "team_sessions" (
	"team_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_sessions_team_id_session_id_pk" PRIMARY KEY("team_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"fade_days" integer DEFAULT 120 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth0_sub" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth0_sub_unique" UNIQUE("auth0_sub")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_member_id_session_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."session_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "houses" ADD CONSTRAINT "houses_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "houses" ADD CONSTRAINT "houses_street_id_streets_id_fk" FOREIGN KEY ("street_id") REFERENCES "public"."streets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_member_id_session_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."session_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pings" ADD CONSTRAINT "pings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pings" ADD CONSTRAINT "pings_member_id_session_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."session_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pins" ADD CONSTRAINT "pins_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pins" ADD CONSTRAINT "pins_member_id_session_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."session_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_used_in_session_id_sessions_id_fk" FOREIGN KEY ("used_in_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_block_stats" ADD CONSTRAINT "session_block_stats_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_block_stats" ADD CONSTRAINT "session_block_stats_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_cells" ADD CONSTRAINT "session_cells_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_paths" ADD CONSTRAINT "session_paths_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_paths" ADD CONSTRAINT "session_paths_member_id_session_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."session_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_street_coverage" ADD CONSTRAINT "session_street_coverage_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_street_coverage" ADD CONSTRAINT "session_street_coverage_member_id_session_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."session_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_street_coverage" ADD CONSTRAINT "session_street_coverage_street_id_streets_id_fk" FOREIGN KEY ("street_id") REFERENCES "public"."streets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_loaded_map_id_maps_id_fk" FOREIGN KEY ("loaded_map_id") REFERENCES "public"."maps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_sessions" ADD CONSTRAINT "team_sessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_sessions" ADD CONSTRAINT "team_sessions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_sessions" ADD CONSTRAINT "team_sessions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_geom_idx" ON "blocks" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "census_areas_geom_idx" ON "census_areas" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "chat_messages_session_created_idx" ON "chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "houses_centroid_idx" ON "houses" USING gist ("centroid");--> statement-breakpoint
CREATE INDEX "houses_block_idx" ON "houses" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "houses_street_idx" ON "houses" USING btree ("street_id");--> statement-breakpoint
CREATE INDEX "leads_session_idx" ON "leads" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "leads_house_idx" ON "leads" USING btree ("house_id");--> statement-breakpoint
CREATE INDEX "maps_team_idx" ON "maps" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pings_client_time_idx" ON "pings" USING btree ("client_id","time");--> statement-breakpoint
CREATE INDEX "pings_session_member_time_idx" ON "pings" USING btree ("session_id","member_id","time");--> statement-breakpoint
CREATE INDEX "pins_session_idx" ON "pins" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "plans_team_idx" ON "plans" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "session_block_stats_block_idx" ON "session_block_stats" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "session_members_session_idx" ON "session_members" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_members_user_idx" ON "session_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_paths_geom_idx" ON "session_paths" USING gist ("path");--> statement-breakpoint
CREATE INDEX "session_street_coverage_street_idx" ON "session_street_coverage" USING btree ("street_id","last_seen");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_live_join_code_idx" ON "sessions" USING btree ("join_code") WHERE "sessions"."status" = 'live';--> statement-breakpoint
CREATE INDEX "sessions_started_at_idx" ON "sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "streets_geom_idx" ON "streets" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_sessions_session_idx" ON "team_sessions" USING btree ("session_id");