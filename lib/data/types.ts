/**
 * Domain types for the signed-in app.
 *
 * These are storage-agnostic on purpose: the repository in lib/data/repository.ts speaks only
 * in these shapes, so swapping the in-memory store for a database means implementing one
 * interface — no page, component or route handler changes.
 *
 * Import-free and erasable so it can also be loaded by `node --test`.
 */

import type { WorkflowGraph } from "@/lib/app/workflow";

export type Channel = "linkedin" | "email" | "whatsapp" | "call" | "sms";
export type StrategyStatus = "live" | "scheduled" | "paused" | "draft" | "completed";
export type StrategyType = "standalone" | "multichannel";
/** Superset of both vocabularies in the codebase — see lib/db/schema.ts for why. */
export type AudienceStage =
  | "new"
  | "reaching"
  | "engaged"
  | "hot"
  | "meeting"
  | "nurture"
  | "paused"
  | "stopped"
  | "closed";
export type AudienceSource = "form" | "csv" | "linkedin" | "crm" | "event";
export type TaskKind = "reply" | "call" | "review";
export type Trend = "up" | "down" | "flat";

export type User = {
  id: string;
  name: string;
  email: string;
  initials: string;
  org: string;
  role: string;
  timeZone: string;
};

export type Metric = {
  id: string;
  label: string;
  value: number;
  /** How to render `value`: a plain count, a percentage, or a percentage-point delta. */
  format: "count" | "percent";
  decimals: number;
  /** Change against the previous period of the same length. */
  delta: number | null;
  deltaUnit: "percent" | "points";
  trend: Trend;
  /** Small series for the sparkline, oldest first. */
  spark: number[];
};

export type Task = {
  id: string;
  kind: TaskKind;
  audienceId: string;
  audienceName: string;
  company: string;
  initials: string;
  score: number;
  summary: string;
  /** Pre-formatted for display ("35m", "Today", "Waiting"). */
  when: string;
  channel: Channel;
  done: boolean;
};

export type Strategy = {
  id: string;
  name: string;
  status: StrategyStatus;
  type: StrategyType;
  channels: Channel[];
  version: string | null;
  /** ISO date. For scheduled strategies this is when it starts. */
  startedAt: string;
  audiences: number;
  sent: number | null;
  delivered: number | null;
  openRate: number | null;
  replyRate: number | null;
  clicks: number | null;
  /** Seeded at signup as an example; its figures are illustrative. Absent means false. */
  isSample?: boolean;
};

export type Audience = {
  id: string;
  name: string;
  company: string;
  /** Job title. The audiences table shows it and derives a "Title: …" tag from it. */
  title: string;
  initials: string;
  /** Masked in the seed data; a real store would hold the raw value. */
  phone: string | null;
  email: string | null;
  stage: AudienceStage;
  score: number;
  source: AudienceSource;
  tags: string[];
  consent: boolean;
  avgCallSeconds: number | null;
  messageCount: number;
  callCount: number;
  nextStep: string;
  ownerId: string;
  ownerName: string;
  strategyId: string | null;
  /**
   * The uploaded audiences (segments) this lead belongs to. A lead can be in several at once, so
   * this is a list, unlike `strategyId` — and it is editable, because a lead added by hand has to
   * be able to join an audience that arrived as a file.
   */
  segmentIds: string[];
  starred: boolean;
  updatedAt: string;
  /** Other ways to reach the audience, filled by uploads. */
  whatsapp?: string | null;
  linkedin?: string | null;
  /** A dummy audience seeded at signup. Absent means false. */
  isSample?: boolean;
};

export type Message = {
  id: string;
  threadId: string;
  /** "them" is the audience, "us" is the workspace. */
  from: "them" | "us";
  channel: Channel;
  body: string;
  sentAt: string;
  read: boolean;
};

export type Thread = {
  id: string;
  audienceId: string;
  audienceName: string;
  company: string;
  initials: string;
  role: string;
  channel: Channel;
  intent: "interested" | "question" | "objection" | "out-of-office" | "opt-out";
  preview: string;
  unread: boolean;
  needsReply: boolean;
  lastAt: string;
  score: number;
  stage: AudienceStage;
  strategyName: string | null;
  ownerName: string;
  signals: { label: string; points: number }[];
};

export type ChannelQuota = {
  channel: Channel;
  used: number;
  cap: number;
};

export type TrendPoint = {
  /** ISO date. */
  date: string;
  reached: number;
  engaged: number;
  replied: number;
  positive: number;
  meetings: number;
};

export type ChannelBreakdown = {
  channel: Channel;
  reached: number;
  replies: number;
  meetings: number;
};

export type FunnelStage = {
  stage: string;
  count: number;
  /** Share of the first stage, 0–1. */
  share: number;
};

export type Analytics = {
  metrics: Metric[];
  trend: TrendPoint[];
  byChannel: ChannelBreakdown[];
  funnel: FunnelStage[];
};

export type Overview = {
  user: User;
  metrics: Metric[];
  tasks: Task[];
  strategies: Strategy[];
  quotas: ChannelQuota[];
};

export type Workspace = {
  /** The org id (`org_…`): the tenant key every row in the workspace carries. */
  id: string;
  /** The company name given at signup. */
  name: string;
  plan: string;
  seats: number;
  seatsUsed: number;
  members: { id: string; name: string; email: string; role: string; initials: string }[];
  quotas: ChannelQuota[];
  /** Channels the product actually runs today; everything else is roadmap. */
  liveChannels: Channel[];
  plannedChannels: Channel[];
  /** Sample rows still in the workspace; both zero once "Remove sample data" has been used. */
  sample: { strategies: number; audiences: number };
};

/** Range keys accepted by the metrics and analytics endpoints. */
export type RangeKey = "7d" | "30d" | "90d";

export type AudienceQuery = {
  q?: string;
  stage?: AudienceStage | "all";
  ownerId?: string | "all";
  strategyId?: string | "all";
  /** Only prospects in this audience (an uploaded segment). */
  segmentId?: string | "all";
  sort?: "score" | "name" | "updated";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * A strategy's workflow as stored. The graph is validated by `validateWorkflowGraph` before it is
 * written, so a repository can hand it back without re-checking it.
 */
export type WorkflowRecord = {
  strategyId: string;
  name: string;
  graph: WorkflowGraph;
  updatedAt: string;
};

/* ---------------------------------------------------- prospect profile -- */

/**
 * One touchpoint on a prospect's history. Every entry is a stored fact — a row in `messages`,
 * `events` or `tasks`, the audience's own creation, or the upload that brought it in. Nothing here
 * is inferred or simulated.
 */
export type ProspectTouch = {
  id: string;
  /** ISO time. */
  at: string;
  kind: "created" | "imported" | "message_out" | "message_in" | "event" | "task";
  channel: Channel | null;
  label: string;
  detail: string;
};

export type ProspectProfile = {
  audience: Audience;
  /** When the prospect was added; null where the store does not know (demo seed). */
  createdAt: string | null;
  company: {
    name: string;
    /** From the work email; null for a personal mailbox or no email. */
    domain: string | null;
    /** Company columns from an uploaded file (industry, website, size, …), as given. */
    facts: { label: string; value: string }[];
    /** Other prospects in this workspace at the same company. */
    colleagues: { id: string; name: string; title: string }[];
    colleagueCount: number;
  };
  /** Every other column an upload carried for this person. */
  fileFields: { label: string; value: string }[];
  journey: {
    strategy: { id: string; name: string; status: StrategyStatus; type: StrategyType } | null;
    /** The workflow run for this person, when the engine has started one. */
    run: { state: "active" | "completed" | "stopped" | "failed"; stepId: string | null; startedAt: string; finishedAt: string | null } | null;
  };
  /** Audiences (uploaded segments) this person belongs to, newest first. */
  audiences: { id: string; name: string; fileName: string; importedAt: string }[];
  engagement: {
    sent: number;
    received: number;
    lastReplyAt: string | null;
    lastTouchAt: string | null;
    byChannel: { channel: Channel; sent: number; received: number }[];
    /** Counts per recorded event kind ("opened", "clicked", …). */
    events: { kind: string; count: number }[];
    conversations: { id: string; channel: Channel; intent: Thread["intent"]; needsReply: boolean; lastAt: string }[];
    /** Signals stored on this person's conversations. */
    signals: { label: string; points: number }[];
  };
  /** Newest first. */
  timeline: ProspectTouch[];
  tasks: { id: string; kind: TaskKind; summary: string; channel: Channel; done: boolean; when: string }[];
};

/* ------------------------------------------------------ channel accounts -- */

/**
 * LinkedIn accounts and mailboxes belong to the **workspace**. Any number of strategies can send
 * from one (`strategyIds`), for both channels: a mailbox is not locked to a single strategy.
 */
export type LinkedInSettings = {
  /** Daily ceilings for this account. */
  connections: number;
  messages: number;
  visits: number;
  /** InMail credits left, or null when the account cannot report them. */
  inmail: number | null;
  /**
   * The working day this account sends inside. It lives on the account, not on a strategy,
   * because the account is what gets restricted: one seat has one working day however many
   * strategies send from it. `zone` empty means the workspace owner's zone.
   */
  hours: { days: string[]; from: string; to: string; zone: string };
  /** Ramp a newly connected account up to its ceiling over a fortnight instead of starting there. */
  warmup: boolean;
};

/** What an account has actually done today, and when its next touch is allowed out. */
export type AccountPace = {
  /** Today's ceiling after the warm-up ramp, which may be below the configured cap. */
  invitesToday: number;
  invitesCap: number;
  messagesToday: number;
  messagesCap: number;
  /** True while the ramp is still below the configured ceilings. */
  warming: boolean;
  /** Days since the account was connected. */
  ageDays: number;
  /** Whether the working day is open right now. */
  open: boolean;
  /** ISO time of the next moment this account may send, or null when it may send now. */
  nextOpenAt: string | null;
};

export type EmailSettings = {
  provider: string;
  /** Day of the warm-up while the mailbox is still warming. */
  warmDay?: number;
  /** 0–100 sender reputation, as the provider reports it. */
  health: number;
  /** Emails per day. */
  cap: number;
  /** Rotate this mailbox with the others on the same strategy. */
  rotate: boolean;
};

/**
 * How an account is connected, and the provider's last word on it.
 *
 * A `manual` row was seeded or typed in: there is nothing behind it. A row connected through
 * `lib/channels/` names its provider and carries the provider's own account id, which is what a
 * webhook delivery is matched on. `statusDetail` is the provider's message shown verbatim — the UI
 * never invents a reason an account stopped working.
 */
export type AccountConnection = {
  provider: string;
  providerAccountId: string | null;
  statusDetail: string;
  /** When the connection was made, as opposed to when the row was created. */
  connectedAt: string | null;
  /** Last time the provider said anything about this account. */
  lastEventAt: string | null;
};

type AccountBase = {
  id: string;
  name: string;
  /** Profile URL for LinkedIn, address for email. */
  handle: string;
  /** Strategies that send from this account. */
  strategyIds: string[];
  /** Invented at signup with the sample strategy; removed with it. */
  isSample: boolean;
  connection: AccountConnection;
};

export type LinkedInAccount = AccountBase & {
  channel: "linkedin";
  /**
   * `connecting` — the member has a hosted sign-in open and nothing is usable yet.
   * `signed_out` — the session lapsed; steps that use it are paused until it reconnects.
   * `restricted` — LinkedIn has limited the account. A product state, not a bug report: it is the
   * most common thing that goes wrong in this category, so it has a name of its own.
   */
  state: "healthy" | "signed_out" | "restricted" | "connecting";
  settings: LinkedInSettings;
  /** What this account has done today and when it may act next. Null where it was not computed. */
  pace: AccountPace | null;
};

export type EmailAccount = AccountBase & {
  channel: "email";
  state: "warm" | "warming";
  settings: EmailSettings;
};

export type ChannelAccount = LinkedInAccount | EmailAccount;

export type SendingDomain = {
  id: string;
  host: string;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  isSample: boolean;
};

export type AccountsSnapshot = {
  accounts: ChannelAccount[];
  domains: SendingDomain[];
  /**
   * Whether this deployment has a scheduler (`CRON_SECRET`). Without one, a plan only advances
   * while somebody has Flightpath open, which the operator has to be told rather than discover.
   */
  scheduler: boolean;
};

/* ------------------------------------------------- connecting an account -- */

export type ConnectSessionState = "pending" | "connected" | "failed" | "expired";

/**
 * One attempt to connect an account through a provider's hosted sign-in.
 *
 * The id is the reference handed to the provider and handed back on its callback — it is what maps
 * a provider account to a workspace, so it is random and short-lived, never a workspace id.
 */
export type ConnectSession = {
  id: string;
  channel: Channel;
  provider: string;
  kind: "create" | "reconnect";
  state: ConnectSessionState;
  /** Why it failed, from the provider. "" while it is still pending or when it succeeded. */
  detail: string;
  /** The account it produced (or repaired), once the callback has landed. */
  accountId: string | null;
  expiresAt: string;
};

/**
 * What has actually happened on one connected account, counted from the `events` log.
 *
 * Every figure here is a count of a real event the provider delivered. There is no estimate and no
 * illustrative number: an account that has done nothing reads zero.
 */
export type AccountActivity = {
  accountId: string;
  /** Inbound messages delivered for this account inside the window. */
  messagesReceived: number;
  /** Status changes the provider reported inside the window. */
  statusChanges: number;
  /** Last inbound message, ISO, or null when there has been none. */
  lastMessageAt: string | null;
  /** When the provider last changed this account's status, ISO, or null. */
  lastStatusAt: string | null;
  /** Days counted. */
  windowDays: number;
};

/** What the rail badges and the setup overview count, in one cheap read. */
export type Badges = {
  /** Open to-dos. */
  tasks: number;
  /** Conversations waiting on a reply. */
  inbox: number;
  /** Blocking setup issues on the Configuration screen. */
  config: number;
};

/**
 * The three cross-channel Configuration tabs that persist: Variables, Sending rules and
 * Compliance. `lib/data/validate.ts` owns the shape/range rules enforced on write;
 * `lib/app/configuration.ts#defaultWorkspaceSettings()` owns what a new workspace starts with.
 * Nothing here is enforced by the sender: it reads the plan's own sending window and the
 * account's daily caps instead (`lib/engine/window.ts`, `channel_accounts.settings`).
 */
export type WorkspaceSettings = {
  /** `{token}` → fallback text, or null for "blank if missing". */
  variableFallbacks: Record<string, string | null>;
  sendingRules: {
    days: string[];
    from: string;
    to: string;
    /** `audience` sends in each audience's own time zone; `workspace` in the workspace's. */
    timezone: "audience" | "workspace";
    holidays: string[];
    limitOn: boolean;
    perDay: number;
    perWeek: number;
    cooloff: number;
    /** Keyed by the stop-rule id shown in the UI. */
    stops: Record<string, boolean>;
    /** Keyed by the audience-rule id shown in the UI. */
    audience: Record<string, boolean>;
    bounceRate: number;
    acceptance: number;
    slowWhatsApp: boolean;
  };
  compliance: {
    domains: string[];
    /** Keyed by `ChannelKey`; the chosen consent-basis index for that channel. */
    consent: Record<string, number>;
    /** Keyed by the regional-rule id shown in the UI. */
    regional: Record<string, boolean>;
    retention: string;
  };
};

/* ------------------------------------------------------------------- engine -- */

/** What launching (or resuming) a strategy did. */
export type LaunchResult = {
  strategy: Strategy;
  /** Audiences newly put into the plan by this launch. */
  enrolled: number;
  /** Audiences that were already in it, e.g. when resuming. */
  alreadyIn: number;
  /** Audiences the plan points at that already belong to another strategy, and were left alone. */
  inOtherStrategy: number;
  /** Audiences left out because nobody has recorded consent to contact them. */
  withoutConsent: number;
};

/** One line of what a run did, newest first in `RunSummary.recent`. */
export type RunActivity = {
  at: string;
  text: string;
  audienceName: string;
  channel: Channel | null;
};

/** Where a strategy's audiences are in its plan. Counts only — nothing here is a result. */
export type RunSummary = {
  enrolled: number;
  active: number;
  completed: number;
  stopped: number;
  /** Active audiences whose next step is not due yet. */
  waiting: number;
  /** When the soonest pending step is due, ISO, or null when nothing is pending. */
  nextDueAt: string | null;
  recent: RunActivity[];
};

/** One step of a launched plan and how many audiences have reached it. */
export type JourneyStep = {
  id: string;
  /** What the step is, e.g. "LinkedIn invite". */
  label: string;
  kind: string;
  /** Set when the step is a touchpoint on a channel. */
  channel: Channel | null;
  depth: number;
  /** Distinct audiences that have got to this step. */
  reached: number;
  /** Audiences sitting on this step right now, waiting for it to run. */
  here: number;
};

/** A launched strategy's journey: how its audiences moved through the plan. */
export type JourneyStrategy = {
  id: string;
  name: string;
  status: StrategyStatus;
  enrolled: number;
  active: number;
  completed: number;
  stopped: number;
  /** Touchpoints on a channel so far: a step that would send, or a call to-do. */
  touchpoints: number;
  steps: JourneyStep[];
};

/**
 * What launched strategies have done, read from the run records and their log. A touchpoint on a
 * channel that really sends (LinkedIn, with a healthy account connected) is something a person
 * received; on every other channel it is a record of what *would* have gone out, and `dryRun`
 * says which of the two the figures are.
 */
export type Journeys = {
  strategies: JourneyStrategy[];
  touchpoints: {
    total: number;
    byChannel: { channel: Channel; count: number }[];
    byDay: { date: string; count: number }[];
  };
  /** True while nothing is actually sent, so screens say these are dry-run figures. */
  dryRun: boolean;
};
