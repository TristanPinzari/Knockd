CREATE TABLE "team_highlights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"geom" geometry(Geometry, 4326) NOT NULL,
	"colour" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"location" geometry(Point, 4326) NOT NULL,
	"text" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_highlights" ADD CONSTRAINT "team_highlights_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_highlights" ADD CONSTRAINT "team_highlights_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_notes" ADD CONSTRAINT "team_notes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_notes" ADD CONSTRAINT "team_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_highlights_team_idx" ON "team_highlights" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_highlights_geom_idx" ON "team_highlights" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "team_notes_team_idx" ON "team_notes" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_notes_location_idx" ON "team_notes" USING gist ("location");