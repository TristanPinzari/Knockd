ALTER TABLE "leads" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;