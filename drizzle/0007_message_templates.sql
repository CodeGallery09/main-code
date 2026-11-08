-- Reusable message templates (invitation notes, LinkedIn messages, emails), copied into a step when picked.
-- Hand-written in drizzle's own format: 0006 was hand-written with no snapshot, so drizzle-kit
-- generate can no longer diff the schema non-interactively. One new table; nothing existing is touched.
CREATE TABLE IF NOT EXISTS "message_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_templates_workspace_idx" ON "message_templates" USING btree ("workspace_id","kind");
