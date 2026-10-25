CREATE TABLE "connect_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"channel" "channel" NOT NULL,
	"provider" text NOT NULL,
	"kind" text DEFAULT 'create' NOT NULL,
	"account_id" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"provider_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_accounts" ADD COLUMN "provider" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_accounts" ADD COLUMN "provider_account_id" text;--> statement-breakpoint
ALTER TABLE "channel_accounts" ADD COLUMN "status_detail" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_accounts" ADD COLUMN "connected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_accounts" ADD COLUMN "last_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connect_sessions" ADD CONSTRAINT "connect_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connect_sessions" ADD CONSTRAINT "connect_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connect_sessions" ADD CONSTRAINT "connect_sessions_account_id_channel_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connect_sessions_workspace_idx" ON "connect_sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "connect_sessions_expires_idx" ON "connect_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_accounts_provider_key" ON "channel_accounts" USING btree ("provider","provider_account_id");