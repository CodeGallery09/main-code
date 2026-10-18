-- drizzle-kit emitted the new primary key before the column it names; reordered by hand so the
-- column exists when the constraint is added (see CLAUDE.md, "Migration order").
ALTER TABLE "daily_rollups" ADD COLUMN "campaign_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_rollups" DROP CONSTRAINT "daily_rollups_workspace_id_day_channel_is_sample_pk";--> statement-breakpoint
ALTER TABLE "daily_rollups" ADD CONSTRAINT "daily_rollups_workspace_id_day_channel_campaign_id_is_sample_pk" PRIMARY KEY("workspace_id","day","channel","campaign_id","is_sample");--> statement-breakpoint
CREATE INDEX "daily_rollups_campaign_idx" ON "daily_rollups" USING btree ("workspace_id","campaign_id","day");
