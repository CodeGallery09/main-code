CREATE TYPE "public"."campaign_status" AS ENUM('live', 'scheduled', 'paused', 'draft', 'completed');--> statement-breakpoint
CREATE TYPE "public"."campaign_type" AS ENUM('standalone', 'multichannel');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('linkedin', 'email', 'whatsapp', 'call', 'sms');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('pending', 'claimed', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('form', 'csv', 'linkedin', 'crm', 'event');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('new', 'reaching', 'engaged', 'hot', 'meeting', 'nurture', 'paused', 'stopped', 'closed');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."message_from" AS ENUM('them', 'us');--> statement-breakpoint
CREATE TYPE "public"."run_state" AS ENUM('active', 'completed', 'stopped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_kind" AS ENUM('reply', 'call', 'review');--> statement-breakpoint
CREATE TYPE "public"."thread_intent" AS ENUM('interested', 'question', 'objection', 'out-of-office', 'opt-out');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"type" "campaign_type" DEFAULT 'standalone' NOT NULL,
	"channels" "channel"[] DEFAULT '{}' NOT NULL,
	"version" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	"sent" integer,
	"delivered" integer,
	"open_rate" numeric(5, 1),
	"reply_rate" numeric(5, 1),
	"clicks" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_quotas" (
	"workspace_id" text NOT NULL,
	"channel" "channel" NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"cap" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "channel_quotas_workspace_id_channel_pk" PRIMARY KEY("workspace_id","channel")
);
--> statement-breakpoint
CREATE TABLE "daily_rollups" (
	"workspace_id" text NOT NULL,
	"day" text NOT NULL,
	"channel" "channel" NOT NULL,
	"reached" integer DEFAULT 0 NOT NULL,
	"engaged" integer DEFAULT 0 NOT NULL,
	"replied" integer DEFAULT 0 NOT NULL,
	"positive" integer DEFAULT 0 NOT NULL,
	"meetings" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_rollups_workspace_id_day_channel_pk" PRIMARY KEY("workspace_id","day","channel")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"channel" "channel",
	"lead_id" text,
	"campaign_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"phone" text,
	"email" text,
	"stage" "lead_stage" DEFAULT 'reaching' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"source" "lead_source" DEFAULT 'form' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"consent" boolean DEFAULT false NOT NULL,
	"avg_call_seconds" integer,
	"message_count" integer DEFAULT 0 NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"next_step" text DEFAULT '' NOT NULL,
	"owner_id" text,
	"campaign_id" text,
	"starred" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"from" "message_from" NOT NULL,
	"channel" "channel" NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"step_id" text NOT NULL,
	"state" "job_state" DEFAULT 'pending' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" "task_kind" NOT NULL,
	"lead_id" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"channel" "channel" NOT NULL,
	"when_label" text DEFAULT '' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"channel" "channel" NOT NULL,
	"intent" "thread_intent" DEFAULT 'question' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"preview" text DEFAULT '' NOT NULL,
	"unread" boolean DEFAULT false NOT NULL,
	"needs_reply" boolean DEFAULT false NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	"campaign_id" text,
	"owner_id" text,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"state" "run_state" DEFAULT 'active' NOT NULL,
	"current_step_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"version" text DEFAULT 'v1' NOT NULL,
	"graph" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'Free' NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"live_channels" "channel"[] DEFAULT '{"linkedin","email"}' NOT NULL,
	"planned_channels" "channel"[] DEFAULT '{"whatsapp","call","sms"}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_quotas" ADD CONSTRAINT "channel_quotas_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_rollups" ADD CONSTRAINT "daily_rollups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_jobs" ADD CONSTRAINT "step_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_jobs" ADD CONSTRAINT "step_jobs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_workspace_idx" ON "campaigns" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "campaigns_workspace_status_idx" ON "campaigns" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "daily_rollups_workspace_day_idx" ON "daily_rollups" USING btree ("workspace_id","day");--> statement-breakpoint
CREATE INDEX "events_workspace_occurred_idx" ON "events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "leads_workspace_idx" ON "leads" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "leads_workspace_stage_idx" ON "leads" USING btree ("workspace_id","stage");--> statement-breakpoint
CREATE INDEX "leads_workspace_score_idx" ON "leads" USING btree ("workspace_id","score");--> statement-breakpoint
CREATE INDEX "leads_campaign_idx" ON "leads" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_thread_sent_idx" ON "messages" USING btree ("thread_id","sent_at");--> statement-breakpoint
CREATE INDEX "messages_workspace_idx" ON "messages" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "step_jobs_due_idx" ON "step_jobs" USING btree ("state","run_at");--> statement-breakpoint
CREATE INDEX "step_jobs_run_idx" ON "step_jobs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "tasks_workspace_done_idx" ON "tasks" USING btree ("workspace_id","done");--> statement-breakpoint
CREATE INDEX "tasks_lead_idx" ON "tasks" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "threads_workspace_idx" ON "threads" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "threads_workspace_needs_reply_idx" ON "threads" USING btree ("workspace_id","needs_reply");--> statement-breakpoint
CREATE INDEX "threads_lead_idx" ON "threads" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_once_per_lead" ON "workflow_runs" USING btree ("workflow_id","lead_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_workspace_state_idx" ON "workflow_runs" USING btree ("workspace_id","state");--> statement-breakpoint
CREATE INDEX "workflows_workspace_idx" ON "workflows" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_campaign_key" ON "workflows" USING btree ("campaign_id");