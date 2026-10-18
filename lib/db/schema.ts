/**
 * Drizzle schema — the physical shape behind `Repository`.
 *
 * Three rules this file follows, in priority order:
 *
 * 1. **Every tenant-scoped table carries `workspaceId`.** The repository seam takes a workspace
 *    on every method, so scoping can never be forgotten in a route handler. Retrofitting tenancy
 *    later means a migration on every table and an audit of every query; doing it now is free.
 * 2. **Ids are text, not serial.** They match the demo seed (`l_omar`, `c_launch_v3`), so the
 *    prototype's workflow ids keep working and the seed ports across unchanged. Prefixed ids are
 *    also self-describing in logs and URLs.
 * 3. **The engine tables exist before the engine does.** A workflow is a graph with waits and
 *    conditions, run per-lead. `workflowRuns` and `stepJobs` are the durable spine for that, and
 *    `stepJobs.runAt` + `SELECT … FOR UPDATE SKIP LOCKED` is the whole job queue — no Redis, no
 *    SQS. They are unused by the CRUD in this phase and shaped so the runner needs no migration.
 *
 * Money/rate columns are integers or numerics, never floats: a reply rate is stored as a numeric
 * so totals are exact, and funnel counts are plain integers.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ---------------------------------------------------------------- enums --
 * These mirror the string unions in lib/data/types.ts exactly. Postgres enums
 * keep bad values out of the database rather than trusting the application. */

export const channelEnum = pgEnum("channel", ["linkedin", "email", "whatsapp", "call", "sms"]);
export const campaignStatusEnum = pgEnum("campaign_status", [
  "live",
  "scheduled",
  "paused",
  "draft",
  "completed",
]);
export const campaignTypeEnum = pgEnum("campaign_type", ["standalone", "multichannel"]);
/**
 * The union of both vocabularies the app grew: lib/data used 6 stages, the workspace screens
 * used 8. Widening the database to the superset keeps the mapping in lib/app/adapt.ts lossless —
 * squeezing "new"/"paused"/"stopped" into "reaching"/"nurture"/"closed" would silently destroy
 * the distinction between a lead who never got touched and one who asked to be left alone.
 */
export const leadStageEnum = pgEnum("lead_stage", [
  "new",
  "reaching",
  "engaged",
  "hot",
  "meeting",
  "nurture",
  "paused",
  "stopped",
  "closed",
]);
export const leadSourceEnum = pgEnum("lead_source", ["form", "csv", "linkedin", "crm", "event"]);
export const taskKindEnum = pgEnum("task_kind", ["reply", "call", "review"]);
export const threadIntentEnum = pgEnum("thread_intent", [
  "interested",
  "question",
  "objection",
  "out-of-office",
  "opt-out",
]);
export const messageFromEnum = pgEnum("message_from", ["them", "us"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);
export const jobStateEnum = pgEnum("job_state", ["pending", "claimed", "done", "failed", "cancelled"]);
export const runStateEnum = pgEnum("run_state", ["active", "completed", "stopped", "failed"]);

/* ------------------------------------------------------------- tenancy -- */

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("Free"),
  seats: integer("seats").notNull().default(1),
  /** Channels the product actually runs today. Everything else is roadmap — see CLAUDE.md. */
  liveChannels: channelEnum("live_channels").array().notNull().default(["linkedin", "email"]),
  plannedChannels: channelEnum("planned_channels").array().notNull().default(["whatsapp", "call", "sms"]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** scrypt hash as `salt:derivedKey`, both hex. Never a plaintext or reversible value. */
    passwordHash: text("password_hash"),
    timeZone: text("time_zone").notNull().default("UTC"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

/** A user's place in a workspace. The join row, not the user, carries the role. */
export const memberships = pgTable(
  "memberships",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("memberships_user_idx").on(t.userId),
  ],
);

/**
 * Server-side sessions. The cookie holds an opaque id only, so a session can be revoked and
 * genuinely expires — the prototype's HMAC-over-email cookie could not do either.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The workspace this session is acting in; a user may belong to several. */
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

/* -------------------------------------------------------------- domain -- */

export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: campaignStatusEnum("status").notNull().default("draft"),
    type: campaignTypeEnum("type").notNull().default("standalone"),
    /** A 5-value set; an array beats a join table until per-channel config exists. */
    channels: channelEnum("channels").array().notNull().default([]),
    version: text("version"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** Counters denormalised for the table view. The engine owns them once it exists. */
    leads: integer("leads").notNull().default(0),
    sent: integer("sent"),
    delivered: integer("delivered"),
    openRate: numeric("open_rate", { precision: 5, scale: 1 }),
    replyRate: numeric("reply_rate", { precision: 5, scale: 1 }),
    clicks: integer("clicks"),
    /**
     * Seeded at signup so a new workspace has something to explore. The figures on a sample row are
     * illustrative, not measured, so the UI labels it and "Remove sample data" deletes it.
     */
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaigns_workspace_idx").on(t.workspaceId),
    index("campaigns_workspace_status_idx").on(t.workspaceId, t.status),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    company: text("company").notNull().default(""),
    /** Job title. The leads table shows it and derives a "Title: …" tag from it. */
    title: text("title").notNull().default(""),
    phone: text("phone"),
    email: text("email"),
    /** Other places this person can be reached, filled by uploads. Normalised like `phone`/`email`. */
    whatsapp: text("whatsapp"),
    linkedin: text("linkedin"),
    /** Columns of an uploaded file with no field of their own, kept so nothing is dropped. */
    extra: jsonb("extra").notNull().default({}),
    stage: leadStageEnum("stage").notNull().default("reaching"),
    score: integer("score").notNull().default(0),
    source: leadSourceEnum("source").notNull().default("form"),
    tags: text("tags").array().notNull().default([]),
    /** Outreach consent. No send may happen on a false value — a legal requirement, not a flag. */
    consent: boolean("consent").notNull().default(false),
    avgCallSeconds: integer("avg_call_seconds"),
    messageCount: integer("message_count").notNull().default(0),
    callCount: integer("call_count").notNull().default(0),
    nextStep: text("next_step").notNull().default(""),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    starred: boolean("starred").notNull().default(false),
    /** A dummy lead seeded at signup; see `campaigns.isSample`. */
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("leads_workspace_idx").on(t.workspaceId),
    index("leads_workspace_stage_idx").on(t.workspaceId, t.stage),
    index("leads_workspace_score_idx").on(t.workspaceId, t.score),
    index("leads_campaign_idx").on(t.campaignId),
  ],
);

/** The builder's graph. One current row per campaign; `version` is bumped on publish. */
export const workflows = pgTable(
  "workflows",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    version: text("version").notNull().default("v1"),
    /** `{ nodes, edges, settings }` as lib/app/workflow.ts already models it. */
    graph: jsonb("graph").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("workflows_workspace_idx").on(t.workspaceId),
    uniqueIndex("workflows_campaign_key").on(t.campaignId),
  ],
);

/* ------------------------------------------------- uploads and segments -- */

/**
 * A file the user has uploaded but not yet saved as a segment. Parsed once, on the server, and kept
 * here rather than in process memory: serverless instances do not share memory, so a map in the
 * module would lose the upload between the preview request and the save request. Rows older than an
 * hour are swept whenever a new upload arrives.
 */
export const uploads = pgTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    headers: jsonb("headers").notNull(),
    rows: jsonb("rows").notNull(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("uploads_workspace_idx").on(t.workspaceId), index("uploads_created_idx").on(t.createdAt)],
);

/** One saved upload. The leads it brought in are linked through `segment_leads`. */
export const segments = pgTable(
  "segments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    /** The column the user mapped to each attribute. */
    mapping: jsonb("mapping").notNull().default({}),
    totalRows: integer("total_rows").notNull(),
    reachableRows: integer("reachable_rows").notNull(),
    /** Per-channel reachable/invalid/blank counts, as the summary step showed them. */
    channels: jsonb("channels").notNull().default([]),
    profilesCreated: integer("profiles_created").notNull().default(0),
    profilesMerged: integer("profiles_merged").notNull().default(0),
    /** Rows left out because the person is already in a journey in another campaign. */
    excludedInJourney: integer("excluded_in_journey").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("segments_workspace_idx").on(t.workspaceId)],
);

/** A person can belong to several segments without being stored twice. */
export const segmentLeads = pgTable(
  "segment_leads",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    segmentId: text("segment_id")
      .notNull()
      .references(() => segments.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.segmentId, t.leadId] }), index("segment_leads_lead_idx").on(t.leadId)],
);

/**
 * The three cross-channel Configuration tabs that aren't per-account: Variables (fallback text
 * overrides), Sending rules and Compliance. One row per workspace, created on first write —
 * `lib/app/configuration.ts#defaultWorkspaceSettings()` is what a workspace reads before that row
 * exists. Each column is a jsonb blob rather than a wide set of typed columns on purpose: the
 * shape is owned by `lib/data/validate.ts` (checked there, not by the database), and these
 * settings are not yet read by anything that sends — see `SENDING_ENABLED` in
 * `lib/capabilities.ts` — so a migration for every new toggle would be premature.
 */
export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  /** `{token}` → fallback text, or null for "blank if missing". */
  variableFallbacks: jsonb("variable_fallbacks").notNull().default({}),
  sendingRules: jsonb("sending_rules").notNull().default({}),
  compliance: jsonb("compliance").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------- org-level channel accounts -- */

/**
 * A LinkedIn account or a mailbox the **workspace** owns. Accounts belong to the org, not to a
 * campaign: any number of campaigns can send from the same one, through `campaign_accounts`. The
 * channel-specific knobs (daily caps, warm-up day, health, provider) live in `settings` because
 * they differ per channel and change often; what every account has is typed.
 */
export const channelAccounts = pgTable(
  "channel_accounts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Only `linkedin` and `email` can be connected today; the rest are roadmap. */
    channel: channelEnum("channel").notNull(),
    /** Display name: the person for a LinkedIn seat, the mailbox label for email. */
    name: text("name").notNull(),
    /** Profile URL for LinkedIn, address for email. */
    handle: text("handle").notNull(),
    /** `healthy`, `signed_out`, `warming`, `warm`: what the Configuration screen reports. */
    state: text("state").notNull().default("healthy"),
    settings: jsonb("settings").notNull().default({}),
    /** Invented at signup alongside the sample campaign; removed with it. */
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("channel_accounts_workspace_idx").on(t.workspaceId),
    uniqueIndex("channel_accounts_handle_key").on(t.workspaceId, t.channel, t.handle),
  ],
);

/** Which campaigns send from which account. Many to many, for both channels. */
export const campaignAccounts = pgTable(
  "campaign_accounts",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => channelAccounts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.accountId] }), index("campaign_accounts_account_idx").on(t.accountId)],
);

/** A domain the workspace sends email from, with the DNS authentication state of each record. */
export const sendingDomains = pgTable(
  "sending_domains",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    host: text("host").notNull(),
    spf: boolean("spf").notNull().default(false),
    dkim: boolean("dkim").notNull().default(false),
    dmarc: boolean("dmarc").notNull().default(false),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sending_domains_host_key").on(t.workspaceId, t.host)],
);

export const threads = pgTable(
  "threads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    intent: threadIntentEnum("intent").notNull().default("question"),
    role: text("role").notNull().default(""),
    preview: text("preview").notNull().default(""),
    unread: boolean("unread").notNull().default(false),
    needsReply: boolean("needs_reply").notNull().default(false),
    lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** Why the lead scores what it does: `[{ label, points }]`. Display-only. */
    signals: jsonb("signals").notNull().default([]),
  },
  (t) => [
    index("threads_workspace_idx").on(t.workspaceId),
    index("threads_workspace_needs_reply_idx").on(t.workspaceId, t.needsReply),
    index("threads_lead_idx").on(t.leadId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    from: messageFromEnum("from").notNull(),
    channel: channelEnum("channel").notNull(),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    read: boolean("read").notNull().default(false),
  },
  (t) => [
    index("messages_thread_sent_idx").on(t.threadId, t.sentAt),
    index("messages_workspace_idx").on(t.workspaceId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: taskKindEnum("kind").notNull(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    summary: text("summary").notNull().default(""),
    channel: channelEnum("channel").notNull(),
    /** Pre-formatted for display ("35m", "Today"). The engine will compute this from a due date. */
    whenLabel: text("when_label").notNull().default(""),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasks_workspace_done_idx").on(t.workspaceId, t.done),
    index("tasks_lead_idx").on(t.leadId),
  ],
);

/* ---------------------------------------------------- quotas and metrics -- */

/** Per-channel daily send caps. The engine checks this before every send. */
export const channelQuotas = pgTable(
  "channel_quotas",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    channel: channelEnum("channel").notNull(),
    used: integer("used").notNull().default(0),
    cap: integer("cap").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.channel] })],
);

/**
 * Pre-aggregated daily funnel, one row per workspace/day/channel.
 *
 * Analytics reads this, never raw events. Aggregating an append-only event log on every dashboard
 * load is the standard way to make a reporting screen slow — a nightly rollup keeps it one indexed
 * scan. Counts are absolute for the day, so a range query is a plain SUM.
 */
export const dailyRollups = pgTable(
  "daily_rollups",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Calendar date, not a timestamp: the grain is the day. */
    day: text("day").notNull(),
    channel: channelEnum("channel").notNull(),
    /**
     * The campaign these counts belong to, so Home and Analytics can be narrowed to one strategy.
     * Empty string, not null, for activity that belongs to no campaign: it is part of the primary
     * key, and a key column cannot be null. No foreign key for the same reason — "" is not a row.
     */
    campaignId: text("campaign_id").notNull().default(""),
    reached: integer("reached").notNull().default(0),
    engaged: integer("engaged").notNull().default(0),
    replied: integer("replied").notNull().default(0),
    positive: integer("positive").notNull().default(0),
    meetings: integer("meetings").notNull().default(0),
    /**
     * Illustrative figures belonging to the sample campaign. Part of the key so the engine's real
     * counts for the same day and channel never merge into (or get deleted with) the sample's.
     */
    isSample: boolean("is_sample").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.day, t.channel, t.campaignId, t.isSample] }),
    index("daily_rollups_workspace_day_idx").on(t.workspaceId, t.day),
    index("daily_rollups_campaign_idx").on(t.workspaceId, t.campaignId, t.day),
  ],
);

/** Append-only fact log. Never updated, never deleted; rollups are derived from it. */
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** "sent" | "delivered" | "opened" | "replied" | "meeting_booked" | … */
    kind: text("kind").notNull(),
    channel: channelEnum("channel"),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_workspace_occurred_idx").on(t.workspaceId, t.occurredAt)],
);

/* ------------------------------------------------- engine (not yet live) --
 * Shaped now so the runner lands without a migration. Nothing in this phase writes to them. */

/** One lead's journey through one workflow. */
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    state: runStateEnum("state").notNull().default("active"),
    /** Node id the run is sitting on. */
    currentStepId: text("current_step_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("workflow_runs_once_per_lead").on(t.workflowId, t.leadId),
    index("workflow_runs_workspace_state_idx").on(t.workspaceId, t.state),
  ],
);

/**
 * The work queue. A tick claims due rows with
 *   SELECT … WHERE state='pending' AND run_at <= now() ORDER BY run_at FOR UPDATE SKIP LOCKED
 * which is a correct, concurrent queue in Postgres with no extra infrastructure. `attempts` and
 * `lastError` carry retry state so a failing send backs off instead of spinning.
 */
export const stepJobs = pgTable(
  "step_jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    stepId: text("step_id").notNull(),
    state: jobStateEnum("state").notNull().default("pending"),
    /** When this step becomes due. A "wait 2 days" step is just a row with runAt in the future. */
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (t) => [
    index("step_jobs_due_idx").on(t.state, t.runAt),
    index("step_jobs_run_idx").on(t.runId),
  ],
);
