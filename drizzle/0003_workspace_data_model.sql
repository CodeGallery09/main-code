CREATE TABLE "campaign_accounts" (
	"workspace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"account_id" text NOT NULL,
	CONSTRAINT "campaign_accounts_campaign_id_account_id_pk" PRIMARY KEY("campaign_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "channel_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"channel" "channel" NOT NULL,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"state" text DEFAULT 'healthy' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segment_leads" (
	"workspace_id" text NOT NULL,
	"segment_id" text NOT NULL,
	"lead_id" text NOT NULL,
	CONSTRAINT "segment_leads_segment_id_lead_id_pk" PRIMARY KEY("segment_id","lead_id")
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_rows" integer NOT NULL,
	"reachable_rows" integer NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"profiles_created" integer DEFAULT 0 NOT NULL,
	"profiles_merged" integer DEFAULT 0 NOT NULL,
	"excluded_in_journey" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sending_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"host" text NOT NULL,
	"spf" boolean DEFAULT false NOT NULL,
	"dkim" boolean DEFAULT false NOT NULL,
	"dmarc" boolean DEFAULT false NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"headers" jsonb NOT NULL,
	"rows" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_rollups" DROP CONSTRAINT "daily_rollups_workspace_id_day_channel_pk";--> statement-breakpoint
ALTER TABLE "daily_rollups" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_rollups" ADD CONSTRAINT "daily_rollups_workspace_id_day_channel_is_sample_pk" PRIMARY KEY("workspace_id","day","channel","is_sample");--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "linkedin" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "extra" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_accounts" ADD CONSTRAINT "campaign_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_accounts" ADD CONSTRAINT "campaign_accounts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_accounts" ADD CONSTRAINT "campaign_accounts_account_id_channel_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_leads" ADD CONSTRAINT "segment_leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_leads" ADD CONSTRAINT "segment_leads_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_leads" ADD CONSTRAINT "segment_leads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_accounts_account_idx" ON "campaign_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "channel_accounts_workspace_idx" ON "channel_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_accounts_handle_key" ON "channel_accounts" USING btree ("workspace_id","channel","handle");--> statement-breakpoint
CREATE INDEX "segment_leads_lead_idx" ON "segment_leads" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "segments_workspace_idx" ON "segments" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sending_domains_host_key" ON "sending_domains" USING btree ("workspace_id","host");--> statement-breakpoint
CREATE INDEX "uploads_workspace_idx" ON "uploads" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "uploads_created_idx" ON "uploads" USING btree ("created_at");