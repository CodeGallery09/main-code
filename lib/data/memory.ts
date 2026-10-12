/**
 * In-memory implementation of `Repository`, backed by the demo seed.
 *
 * It deliberately does the same filtering, sorting and paging work a database would, through the
 * shared helpers in lib/data/query.ts, so swapping in a real store cannot change behaviour.
 * Writes (completing a task, pausing a campaign, sending a reply) mutate module state: they last
 * until the server restarts, which is all a prototype needs.
 */

import {
  deltaPercent,
  matchesFacet,
  matchesText,
  paginate,
  rangeDays,
  sortBy,
  trendOf,
} from "@/lib/data/query";
import {
  CAMPAIGNS,
  DEMO_USER,
  LEADS,
  MESSAGES,
  QUOTAS,
  THREADS,
  WORKSPACE,
  buildTrend,
} from "@/lib/data/seed";
import type {
  CampaignQuery,
  CampaignTotals,
  Repository,
  SendMessageInput,
  TaskQuery,
  ThreadQuery,
} from "@/lib/data/repository";
import type {
  Analytics,
  Campaign,
  CampaignStatus,
  Channel,
  ChannelBreakdown,
  FunnelStage,
  Lead,
  LeadQuery,
  Message,
  Metric,
  Overview,
  Paged,
  RangeKey,
  Task,
  Thread,
  TrendPoint,
  User,
  Workspace,
} from "@/lib/data/types";

// Mutable copies, so prototype writes are visible on the next read.
const campaigns: Campaign[] = CAMPAIGNS.map((c) => ({ ...c }));
const messages: Message[] = MESSAGES.map((m) => ({ ...m }));
const threads: Thread[] = THREADS.map((t) => ({ ...t }));
const trend: TrendPoint[] = buildTrend(90);

const tasks: Task[] = [
  {
    id: "tk_omar",
    kind: "reply",
    leadId: "l_omar",
    leadName: "Omar Haddad",
    company: "Brightline Logistics",
    initials: "OH",
    score: 80,
    summary: "Asked about pricing for 8 seats",
    when: "35m",
    channel: "email",
    done: false,
  },
  {
    id: "tk_rohan",
    kind: "reply",
    leadId: "l_rohan",
    leadName: "Rohan Desai",
    company: "Tiffin Labs",
    initials: "RD",
    score: 58,
    summary: "Asked for a deck",
    when: "20m",
    channel: "whatsapp",
    done: false,
  },
  {
    id: "tk_maya",
    kind: "call",
    leadId: "l_maya",
    leadName: "Maya Reyes",
    company: "Example Co",
    initials: "MR",
    score: 70,
    summary: "Open to a chat · clicked pricing",
    when: "Today",
    channel: "call",
    done: false,
  },
  {
    id: "tk_priya",
    kind: "call",
    leadId: "l_priya",
    leadName: "Priya Nair",
    company: "Kitebox",
    initials: "PN",
    score: 72,
    summary: "Visited pricing twice",
    when: "Today",
    channel: "call",
    done: false,
  },
  {
    id: "tk_kenji",
    kind: "reply",
    leadId: "l_kenji",
    leadName: "Kenji Watanabe",
    company: "Quanta Health",
    initials: "KW",
    score: 46,
    summary: "Asked who else uses it",
    when: "3h",
    channel: "linkedin",
    done: false,
  },
  {
    id: "tk_daniel",
    kind: "review",
    leadId: "l_daniel",
    leadName: "Daniel Kim",
    company: "Northwind HR",
    initials: "DK",
    score: 10,
    summary: "First LinkedIn message ready",
    when: "Waiting",
    channel: "linkedin",
    done: false,
  },
];

/** Totals for a window of the daily series, plus the window before it, for the delta. */
function windows(days: number) {
  const current = trend.slice(-days);
  const previous = trend.slice(-days * 2, -days);
  const sum = (rows: TrendPoint[], key: keyof Omit<TrendPoint, "date">) =>
    rows.reduce((total, row) => total + row[key], 0);
  return { current, previous, sum };
}

function metric(
  id: string,
  label: string,
  value: number,
  previous: number,
  format: Metric["format"],
  decimals: number,
  spark: number[],
  deltaUnit: Metric["deltaUnit"] = "percent",
): Metric {
  const delta =
    deltaUnit === "points" ? Number((value - previous).toFixed(1)) || null : deltaPercent(value, previous);
  return { id, label, value, format, decimals, delta, deltaUnit, trend: trendOf(delta), spark };
}

function headlineMetrics(range: RangeKey): Metric[] {
  const days = rangeDays(range);
  const { current, previous, sum } = windows(days);
  const reached = sum(current, "reached");
  const reachedPrev = sum(previous, "reached");
  const replied = sum(current, "replied");
  const repliedPrev = sum(previous, "replied");
  const meetings = sum(current, "meetings");
  const meetingsPrev = sum(previous, "meetings");
  const rate = reached ? Number(((replied / reached) * 100).toFixed(1)) : 0;
  const ratePrev = reachedPrev ? Number(((repliedPrev / reachedPrev) * 100).toFixed(1)) : 0;
  const spark = (key: keyof Omit<TrendPoint, "date">) =>
    current.slice(-12).map((row) => row[key]);

  return [
    metric("replies", "Replies", replied, repliedPrev, "count", 0, spark("replied")),
    metric("meetings", "Meetings", meetings, meetingsPrev, "count", 0, spark("meetings")),
    metric("reply-rate", "Reply rate", rate, ratePrev, "percent", 1, spark("replied"), "points"),
    metric(
      "active-leads",
      "Active leads",
      LEADS.filter((l) => l.stage !== "closed").length * 92,
      LEADS.filter((l) => l.stage !== "closed").length * 88,
      "count",
      0,
      spark("engaged"),
    ),
  ];
}

export class MemoryRepository implements Repository {
  async getUser(email: string): Promise<User> {
    // The prototype has a single account; a real store would look the user up by email.
    return { ...DEMO_USER, email: email || DEMO_USER.email };
  }

  async getWorkspace(): Promise<Workspace> {
    return { ...WORKSPACE, quotas: QUOTAS.map((q) => ({ ...q })) };
  }

  async getOverview(email: string, range: RangeKey): Promise<Overview> {
    const [user, open, live] = await Promise.all([
      this.getUser(email),
      this.listTasks({ kind: "all" }),
      this.listCampaigns({ status: "live" }),
    ]);
    return {
      user,
      metrics: headlineMetrics(range),
      tasks: open,
      campaigns: live.items.slice(0, 5),
      quotas: QUOTAS.map((q) => ({ ...q })),
    };
  }

  async listTasks(query: TaskQuery): Promise<Task[]> {
    const open = tasks.filter((t) => !t.done);
    if (!query.kind || query.kind === "all") return open.map((t) => ({ ...t }));
    return open.filter((t) => t.kind === query.kind).map((t) => ({ ...t }));
  }

  async completeTask(id: string): Promise<Task | null> {
    const found = tasks.find((t) => t.id === id);
    if (!found) return null;
    found.done = true;
    return { ...found };
  }

  async listCampaigns(query: CampaignQuery): Promise<{ items: Campaign[]; totals: CampaignTotals }> {
    const items = campaigns.filter(
      (c) =>
        matchesText([c.name], query.q) &&
        matchesFacet(c.status, query.status) &&
        matchesFacet(c.type, query.type) &&
        (!query.channel || query.channel === "all" || c.channels.includes(query.channel)),
    );
    const delivered = items.reduce((sum, c) => sum + (c.delivered ?? 0), 0);
    const sent = items.reduce((sum, c) => sum + (c.sent ?? 0), 0);
    const withOpen = items.filter((c) => c.openRate !== null);
    const withReply = items.filter((c) => c.replyRate !== null);
    const mean = (rows: Campaign[], key: "openRate" | "replyRate") =>
      rows.length
        ? Number((rows.reduce((sum, c) => sum + (c[key] ?? 0), 0) / rows.length).toFixed(1))
        : null;

    return {
      items: items.map((c) => ({ ...c })),
      totals: {
        leads: items.reduce((sum, c) => sum + c.leads, 0),
        delivered: delivered || sent,
        openRate: mean(withOpen, "openRate"),
        replyRate: mean(withReply, "replyRate"),
      },
    };
  }

  async getCampaign(id: string): Promise<Campaign | null> {
    const found = campaigns.find((c) => c.id === id);
    return found ? { ...found } : null;
  }

  async setCampaignStatus(id: string, status: CampaignStatus): Promise<Campaign | null> {
    const found = campaigns.find((c) => c.id === id);
    if (!found) return null;
    found.status = status;
    return { ...found };
  }

  async listLeads(query: LeadQuery): Promise<Paged<Lead>> {
    const filtered = LEADS.filter(
      (lead) =>
        matchesText([lead.name, lead.company, ...lead.tags], query.q) &&
        matchesFacet(lead.stage, query.stage) &&
        matchesFacet(lead.ownerId, query.ownerId) &&
        matchesFacet(lead.campaignId, query.campaignId),
    );
    const key = query.sort ?? "score";
    const dir = query.dir ?? (key === "name" ? "asc" : "desc");
    const sorted = sortBy(
      filtered,
      (lead) => (key === "name" ? lead.name : key === "updated" ? lead.updatedAt : lead.score),
      dir,
    );
    const page = paginate(sorted, query.page, query.pageSize);
    return { ...page, items: page.items.map((lead) => ({ ...lead })) };
  }

  async getLead(id: string): Promise<Lead | null> {
    const found = LEADS.find((lead) => lead.id === id);
    return found ? { ...found } : null;
  }

  async listThreads(query: ThreadQuery): Promise<Thread[]> {
    const items = threads.filter(
      (t) =>
        matchesText([t.leadName, t.company, t.preview], query.q) &&
        (query.filter !== "to-reply" || t.needsReply),
    );
    return sortBy(items, (t) => t.lastAt, "desc").map((t) => ({ ...t }));
  }

  async getThread(id: string): Promise<{ thread: Thread; messages: Message[] } | null> {
    const thread = threads.find((t) => t.id === id);
    if (!thread) return null;
    const rows = messages.filter((m) => m.threadId === id);
    thread.unread = false;
    return {
      thread: { ...thread },
      messages: sortBy(rows, (m) => m.sentAt, "asc").map((m) => ({ ...m })),
    };
  }

  async sendMessage({ threadId, channel, body }: SendMessageInput): Promise<Message | null> {
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return null;
    const message: Message = {
      id: `m_${threadId}_${messages.length + 1}`,
      threadId,
      from: "us",
      channel,
      body,
      sentAt: new Date().toISOString(),
      read: true,
    };
    messages.push(message);
    thread.needsReply = false;
    thread.unread = false;
    thread.preview = body;
    thread.lastAt = message.sentAt;
    return { ...message };
  }

  async getAnalytics(range: RangeKey, channels: Channel[] | null): Promise<Analytics> {
    const days = rangeDays(range);
    const { current, previous, sum } = windows(days);
    // Channel mix is a fixed split of the totals; a real store would group by channel.
    const mix: Record<Channel, number> = {
      linkedin: 0.34,
      email: 0.41,
      whatsapp: 0.12,
      call: 0.08,
      sms: 0.05,
    };
    const picked = channels && channels.length ? channels : (Object.keys(mix) as Channel[]);
    const share = picked.reduce((total, channel) => total + mix[channel], 0);

    const scale = (value: number) => Math.round(value * share);
    const reached = scale(sum(current, "reached"));
    const reachedPrev = scale(sum(previous, "reached"));
    const replied = scale(sum(current, "replied"));
    const repliedPrev = scale(sum(previous, "replied"));
    const positive = scale(sum(current, "positive"));
    const positivePrev = scale(sum(previous, "positive"));
    const meetings = scale(sum(current, "meetings"));
    const meetingsPrev = scale(sum(previous, "meetings"));
    const engaged = scale(sum(current, "engaged"));
    const rate = reached ? Number(((replied / reached) * 100).toFixed(1)) : 0;
    const ratePrev = reachedPrev ? Number(((repliedPrev / reachedPrev) * 100).toFixed(1)) : 0;
    const spark = (key: keyof Omit<TrendPoint, "date">) =>
      current.slice(-14).map((row) => Math.round(row[key] * share));

    const byChannel: ChannelBreakdown[] = picked.map((channel) => ({
      channel,
      reached: Math.round(sum(current, "reached") * mix[channel]),
      replies: Math.round(sum(current, "replied") * mix[channel]),
      meetings: Math.round(sum(current, "meetings") * mix[channel]),
    }));

    const funnel: FunnelStage[] = [
      { stage: "Reached", count: reached, share: 1 },
      { stage: "Engaged", count: engaged, share: reached ? engaged / reached : 0 },
      { stage: "Replied", count: replied, share: reached ? replied / reached : 0 },
      { stage: "Positive", count: positive, share: reached ? positive / reached : 0 },
      { stage: "Meetings", count: meetings, share: reached ? meetings / reached : 0 },
    ];

    return {
      metrics: [
        metric("reached", "Reached", reached, reachedPrev, "count", 0, spark("reached")),
        metric("reply-rate", "Reply rate", rate, ratePrev, "percent", 1, spark("replied"), "points"),
        metric("positive", "Positive replies", positive, positivePrev, "count", 0, spark("positive")),
        metric("meetings", "Meetings", meetings, meetingsPrev, "count", 0, spark("meetings")),
      ],
      trend: current.map((row) => ({
        date: row.date,
        reached: Math.round(row.reached * share),
        engaged: Math.round(row.engaged * share),
        replied: Math.round(row.replied * share),
        positive: Math.round(row.positive * share),
        meetings: Math.round(row.meetings * share),
      })),
      byChannel,
      funnel,
    };
  }
}
