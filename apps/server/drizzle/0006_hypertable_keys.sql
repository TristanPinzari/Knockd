-- Hypertables need the time column in their primary key (see 0007).
ALTER TABLE "session_street_coverage" DROP CONSTRAINT "session_street_coverage_session_id_member_id_street_id_pk";--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_pkey";--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_id_created_at_pk" PRIMARY KEY("id","created_at");--> statement-breakpoint
ALTER TABLE "session_street_coverage" ADD CONSTRAINT "session_street_coverage_session_id_member_id_street_id_first_seen_pk" PRIMARY KEY("session_id","member_id","street_id","first_seen");--> statement-breakpoint
ALTER TABLE "session_street_coverage" ADD COLUMN "houses" integer DEFAULT 0 NOT NULL;
