/**
 * The no-database demo workspace (the `dev` deployment), built from the same sample world a new
 * database workspace is seeded with (lib/data/sample.ts).
 *
 * One demo strategy, its audiences, its conversations and to-dos, its funnel by day, and the
 * accounts it sends from — nothing else. Every row is flagged `isSample`, so the UI labels it and
 * "Remove sample data" deletes it, exactly as in a real workspace. Keeping a single source for
 * both modes is the point: the dev preview shows what production shows.
 */

import {
  SAMPLE_CAMPAIGN,
  SAMPLE_LEADS,
  SAMPLE_ROLLUPS,
  SAMPLE_TASKS,
  SAMPLE_THREADS,
} from "@/lib/data/sample";
import { dayKeyOf } from "@/lib/data/query";
import type {
  ChannelAccount,
  ChannelQuota,
  Audience,
  Message,
  SendingDomain,
  Strategy,
  Task,
  Thread,
  User,
  Workspace,
} from "@/lib/data/types";
import type { RollupRow } from "@/lib/data/query";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const iso = (at: number) => new Date(at).toISOString();

export const DEMO_USER: User = {
  id: "u_1",
  name: "Aarav Kapoor",
  email: "founders0910@gmail.com",
  initials: "AK",
  org: "Acme Growth",
  role: "Founder",
  timeZone: "Asia/Kolkata",
};

export const TEAM = [
  { id: "u_1", name: "Aarav Kapoor", email: "founders0910@gmail.com", role: "Owner", initials: "AK" },
];

export const QUOTAS: ChannelQuota[] = [
  { channel: "linkedin", used: 0, cap: 105 },
  { channel: "email", used: 0, cap: 200 },
  { channel: "whatsapp", used: 0, cap: 120 },
  { channel: "sms", used: 0, cap: 100 },
];

export const WORKSPACE: Workspace = {
  id: "w_demo",
  name: DEMO_USER.org,
  plan: "Scale (trial)",
  seats: 5,
  seatsUsed: TEAM.length,
  members: TEAM,
  quotas: QUOTAS,
  liveChannels: ["linkedin", "email"],
  plannedChannels: ["whatsapp", "call", "sms"],
  // Counted live by the repository from the rows below; this is only the starting shape.
  sample: { strategies: 0, audiences: 0 },
};

/** The one demo strategy's id, so the workflow lookup and the seeded rows agree. */
export const DEMO_STRATEGY_ID = "c_sample";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const slug = (email: string) => email.split("@")[0];
const audienceIdOf = (email: string) => `l_${slug(email)}`;

export const CAMPAIGNS: Strategy[] = [
  {
    id: DEMO_STRATEGY_ID,
    name: SAMPLE_CAMPAIGN.name,
    status: SAMPLE_CAMPAIGN.status,
    type: SAMPLE_CAMPAIGN.type,
    channels: [...SAMPLE_CAMPAIGN.channels],
    version: SAMPLE_CAMPAIGN.version,
    startedAt: iso(now - SAMPLE_CAMPAIGN.startedDaysAgo * DAY),
    audiences: SAMPLE_LEADS.length,
    sent: SAMPLE_CAMPAIGN.sent,
    delivered: SAMPLE_CAMPAIGN.delivered,
    openRate: SAMPLE_CAMPAIGN.openRate,
    replyRate: SAMPLE_CAMPAIGN.replyRate,
    clicks: SAMPLE_CAMPAIGN.clicks,
    isSample: true,
  },
];

export const LEADS: Audience[] = SAMPLE_LEADS.map((lead, i) => ({
  id: audienceIdOf(lead.email),
  name: lead.name,
  company: lead.company,
  title: lead.title,
  initials: initialsOf(lead.name),
  phone: lead.phone,
  email: lead.email,
  stage: lead.stage,
  score: lead.score,
  source: lead.source,
  tags: [...lead.tags],
  consent: lead.consent,
  avgCallSeconds: lead.avgCallSeconds,
  messageCount: lead.messageCount,
  callCount: lead.callCount,
  nextStep: lead.nextStep,
  ownerId: DEMO_USER.id,
  ownerName: DEMO_USER.name,
  strategyId: DEMO_STRATEGY_ID,
  // The demo world has no uploaded files, so nobody in it is in a segment.
  segmentIds: [],
  starred: lead.starred,
  updatedAt: iso(now - (i + 1) * 3 * HOUR),
  // The database returns these for every audience; null here, not absent, so both stores agree.
  whatsapp: null,
  linkedin: null,
  isSample: true,
}));

const leadOf = (email: string) => {
  const found = LEADS.find((l) => l.email === email);
  if (!found) throw new Error(`sample audience ${email} is not in SAMPLE_LEADS`);
  return found;
};

export const THREADS: Thread[] = SAMPLE_THREADS.map((thread) => {
  const lead = leadOf(thread.audienceEmail);
  const latest = [...thread.messages].sort((a, b) => a.hoursAgo - b.hoursAgo)[0];
  return {
    id: `t_${slug(thread.audienceEmail)}`,
    audienceId: lead.id,
    audienceName: lead.name,
    company: lead.company,
    initials: lead.initials,
    role: thread.role,
    channel: thread.channel,
    intent: thread.intent,
    preview: latest.body,
    unread: thread.unread,
    needsReply: thread.needsReply,
    lastAt: iso(now - latest.hoursAgo * HOUR),
    score: lead.score,
    stage: lead.stage,
    strategyName: SAMPLE_CAMPAIGN.name,
    ownerName: DEMO_USER.name,
    signals: thread.signals.map((s) => ({ ...s })),
  };
});

export const MESSAGES: Message[] = SAMPLE_THREADS.flatMap((thread) =>
  thread.messages.map((m, i) => ({
    id: `m_${slug(thread.audienceEmail)}_${i + 1}`,
    threadId: `t_${slug(thread.audienceEmail)}`,
    from: m.from,
    channel: thread.channel,
    body: m.body,
    sentAt: iso(now - m.hoursAgo * HOUR),
    // Anything from the audience on a thread still waiting on us is unread.
    read: !(thread.unread && m.from === "them"),
  })),
);

export const TASKS: Task[] = SAMPLE_TASKS.map((task, i) => {
  const lead = leadOf(task.audienceEmail);
  return {
    id: `tk_${i + 1}`,
    kind: task.kind,
    audienceId: lead.id,
    audienceName: lead.name,
    company: lead.company,
    initials: lead.initials,
    score: lead.score,
    summary: task.summary,
    when: task.when,
    channel: task.channel,
    done: false,
  };
});

/** The demo strategy's funnel, per channel per day — what `daily_rollups` holds in a database. */
export const ROLLUPS: RollupRow[] = SAMPLE_ROLLUPS.map((row) => ({
  day: dayKeyOf(new Date(now - row.daysAgo * DAY)),
  channel: row.channel,
  reached: row.reached,
  engaged: row.engaged,
  replied: row.replied,
  positive: row.positive,
  meetings: row.meetings,
}));

/**
 * The demo workspace has no connected accounts, mailboxes or domains, exactly like a new database
 * workspace: the demo strategy is the only invented content, and an invented "connected" LinkedIn
 * account would make Setup report something that is not true.
 */
export const ACCOUNTS: ChannelAccount[] = [];

export const DOMAINS: SendingDomain[] = [];
