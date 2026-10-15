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
export type CampaignStatus = "live" | "scheduled" | "paused" | "draft" | "completed";
export type CampaignType = "standalone" | "multichannel";
/** Superset of both vocabularies in the codebase — see lib/db/schema.ts for why. */
export type LeadStage =
  | "new"
  | "reaching"
  | "engaged"
  | "hot"
  | "meeting"
  | "nurture"
  | "paused"
  | "stopped"
  | "closed";
export type LeadSource = "form" | "csv" | "linkedin" | "crm" | "event";
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
  leadId: string;
  leadName: string;
  company: string;
  initials: string;
  score: number;
  summary: string;
  /** Pre-formatted for display ("35m", "Today", "Waiting"). */
  when: string;
  channel: Channel;
  done: boolean;
};

export type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  type: CampaignType;
  channels: Channel[];
  version: string | null;
  /** ISO date. For scheduled campaigns this is when it starts. */
  startedAt: string;
  leads: number;
  sent: number | null;
  delivered: number | null;
  openRate: number | null;
  replyRate: number | null;
  clicks: number | null;
  /** Seeded at signup as an example; its figures are illustrative. Absent means false. */
  isSample?: boolean;
};

export type Lead = {
  id: string;
  name: string;
  company: string;
  /** Job title. The leads table shows it and derives a "Title: …" tag from it. */
  title: string;
  initials: string;
  /** Masked in the seed data; a real store would hold the raw value. */
  phone: string | null;
  email: string | null;
  stage: LeadStage;
  score: number;
  source: LeadSource;
  tags: string[];
  consent: boolean;
  avgCallSeconds: number | null;
  messageCount: number;
  callCount: number;
  nextStep: string;
  ownerId: string;
  ownerName: string;
  campaignId: string | null;
  starred: boolean;
  updatedAt: string;
  /** Other ways to reach the lead, filled by uploads. */
  whatsapp?: string | null;
  linkedin?: string | null;
  /** A dummy lead seeded at signup. Absent means false. */
  isSample?: boolean;
};

export type Message = {
  id: string;
  threadId: string;
  /** "them" is the lead, "us" is the workspace. */
  from: "them" | "us";
  channel: Channel;
  body: string;
  sentAt: string;
  read: boolean;
};

export type Thread = {
  id: string;
  leadId: string;
  leadName: string;
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
  stage: LeadStage;
  campaignName: string | null;
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
  campaigns: Campaign[];
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
  sample: { campaigns: number; leads: number };
};

/** Range keys accepted by the metrics and analytics endpoints. */
export type RangeKey = "7d" | "30d" | "90d";

export type LeadQuery = {
  q?: string;
  stage?: LeadStage | "all";
  ownerId?: string | "all";
  campaignId?: string | "all";
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
 * A campaign's workflow as stored. The graph is validated by `validateWorkflowGraph` before it is
 * written, so a repository can hand it back without re-checking it.
 */
export type WorkflowRecord = {
  campaignId: string;
  name: string;
  graph: WorkflowGraph;
  updatedAt: string;
};

/* ------------------------------------------------------ channel accounts -- */

/**
 * LinkedIn accounts and mailboxes belong to the **workspace**. Any number of campaigns can send
 * from one (`campaignIds`), for both channels: a mailbox is not locked to a single campaign.
 */
export type LinkedInSettings = {
  /** Daily ceilings for this account. */
  connections: number;
  messages: number;
  visits: number;
  /** InMail credits left, or null when the account cannot report them. */
  inmail: number | null;
};

export type EmailSettings = {
  provider: string;
  /** Day of the warm-up while the mailbox is still warming. */
  warmDay?: number;
  /** 0–100 sender reputation, as the provider reports it. */
  health: number;
  /** Emails per day. */
  cap: number;
  /** Rotate this mailbox with the others on the same campaign. */
  rotate: boolean;
};

type AccountBase = {
  id: string;
  name: string;
  /** Profile URL for LinkedIn, address for email. */
  handle: string;
  /** Campaigns that send from this account. */
  campaignIds: string[];
  /** Invented at signup with the sample campaign; removed with it. */
  isSample: boolean;
};

export type LinkedInAccount = AccountBase & {
  channel: "linkedin";
  /** `signed_out` pauses the steps that use it until it reconnects. */
  state: "healthy" | "signed_out";
  settings: LinkedInSettings;
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
