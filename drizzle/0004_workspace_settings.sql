CREATE TABLE "workspace_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"variable_fallbacks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sending_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"compliance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;