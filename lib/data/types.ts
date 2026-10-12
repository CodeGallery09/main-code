/**
 * Domain types for the signed-in app.
 *
 * These are storage-agnostic on purpose: the repository in lib/data/repository.ts speaks only
 * in these shapes, so swapping the in-memory store for a database means implementing one
 * interface — no page, component or route handler changes.
 *
 * Import-free and erasable so it can also be loaded by `node --test`.
 */

export type Channel = "linkedin" | "email" | "whatsapp" | "call" | "sms";
export type CampaignStatus = "live" | "scheduled" | "paused" | "draft";
export type CampaignType = "standalone" | "multichannel";
export type LeadStage = "reaching" | "engaged" | "hot" | "meeting" | "nurture" | "closed";
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
};

export type Lead = {
  id: string;
  name: string;
  company: string;
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
  name: string;
  plan: string;
  seats: number;
  seatsUsed: number;
  members: { id: string; name: string; email: string; role: string; initials: string }[];
  quotas: ChannelQuota[];
  /** Channels the product actually runs today; everything else is roadmap. */
  liveChannels: Channel[];
  plannedChannels: Channel[];
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
