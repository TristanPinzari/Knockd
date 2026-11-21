-- Roles: owner / admin / member → owner / editor / viewer.
ALTER TABLE "team_members" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
-- Map existing rows before the new enum is applied.
UPDATE "team_members" SET "role" = CASE "role" WHEN 'admin' THEN 'editor' WHEN 'member' THEN 'viewer' ELSE "role" END;--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "role" SET DEFAULT 'viewer'::text;--> statement-breakpoint
DROP TYPE "public"."team_role";--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "role" SET DEFAULT 'viewer'::"public"."team_role";--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "role" SET DATA TYPE "public"."team_role" USING "role"::"public"."team_role";
