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
  TEAM,
  THREADS,
  WORKSPACE,
  buildTrend,
} from "@/lib/data/seed";
import type {
  CampaignQuery,
  CampaignTotals,
  Ctx,
  Repository,
  SendMessageInput,
  TaskQuery,
  ThreadQuery,
  WriteError,
} from "@/lib/data/repository";
import type { CampaignPatch, LeadPatch } from "@/lib/data/validate";
import { mergeLeads, type LeadProfile } from "@/lib/leads/merge";
import type { MappingReport, Segment, UploadPreview } from "@/lib/leads/segments";
import { suggestMapping, type Mapping, type ParsedLead } from "@/lib/leads/validation";
import type { Table } from "@/lib/leads/table";
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

/**
 * Uploaded files, saved segments and the lead profiles they build up.
 *
 * All three live in module state, so they last until the server restarts — the
 * same deal as every other write in this store. A database implementation of
 * `Repository` is where they become permanent.
 */
const uploads = new Map<string, { fileName: string; fileSize: number; table: Table; at: number }>();
const segments: Segment[] = [];
let profiles: LeadProfile[] = [];
let segmentSeq = 1;
let profileSeq = 1;
let uploadSeq = 1;

/** Parsed files are scratch space; drop anything older than an hour. */
function sweepUploads() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, upload] of uploads) if (upload.at < cutoff) uploads.delete(id);
}

// Mutable copies, so prototype writes are visible on the next read.
const campaigns: Campaign[] = CAMPAIGNS.map((c) => ({ ...c }));
const messages: Message[] = MESSAGES.map((m) => ({ ...m }));
const threads: Thread[] = THREADS.map((t) => ({ ...t }));
const leadRows: Lead[] = LEADS.map((l) => ({ ...l }));
const trend: TrendPoint[] = buildTrend(90);

/** Monotonic ids for prototype creates, so two leads made in the same millisecond differ. */
const counters: Record<string, number> = {};
const nextId = (kind: string) => `${Date.now().toString(36)}${(counters[kind] = (counters[kind] ?? 0) + 1)}`;

/** "Aarav Kapoor" -> "AK". The avatar needs it and the UI never derives it itself. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

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
      leadRows.filter((l) => l.stage !== "closed").length * 92,
      leadRows.filter((l) => l.stage !== "closed").length * 88,
      "count",
      0,
      spark("engaged"),
    ),
  ];
}

/**
 * Every method takes `Ctx` to satisfy the interface, but the demo store holds exactly one
 * workspace, so it cannot actually enforce isolation. That is fine for a fallback with no
 * persistence — and it is precisely why the Postgres implementation filters on `workspaceId`
 * in every query rather than inheriting this shortcut.
 */
export class MemoryRepository implements Repository {
  async getUser(ctx: Ctx): Promise<User> {
    return { ...DEMO_USER, id: ctx.userId || DEMO_USER.id };
  }

  async getWorkspace(_ctx: Ctx): Promise<Workspace> {
    return { ...WORKSPACE, quotas: QUOTAS.map((q) => ({ ...q })) };
  }

  async getOverview(ctx: Ctx, range: RangeKey): Promise<Overview> {
    const [user, open, live] = await Promise.all([
      this.getUser(ctx),
      this.listTasks(ctx, { kind: "all" }),
      this.listCampaigns(ctx, { status: "live" }),
    ]);
    return {
      user,
      metrics: headlineMetrics(range),
      tasks: open,
      campaigns: live.items.slice(0, 5),
      quotas: QUOTAS.map((q) => ({ ...q })),
    };
  }

  async listTasks(_ctx: Ctx, query: TaskQuery): Promise<Task[]> {
    const open = tasks.filter((t) => !t.done);
    if (!query.kind || query.kind === "all") return open.map((t) => ({ ...t }));
    return open.filter((t) => t.kind === query.kind).map((t) => ({ ...t }));
  }

  async completeTask(_ctx: Ctx, id: string): Promise<Task | null> {
    const found = tasks.find((t) => t.id === id);
    if (!found) return null;
    found.done = true;
    return { ...found };
  }

  async listCampaigns(
    _ctx: Ctx,
    query: CampaignQuery,
  ): Promise<{ items: Campaign[]; totals: CampaignTotals }> {
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

  async getCampaign(_ctx: Ctx, id: string): Promise<Campaign | null> {
    const found = campaigns.find((c) => c.id === id);
    return found ? { ...found } : null;
  }

  async createCampaign(_ctx: Ctx, input: CampaignPatch): Promise<Campaign> {
    const row: Campaign = {
      id: `c_${nextId("campaign")}`,
      name: input.name ?? "Untitled campaign",
      status: input.status ?? "draft",
      type: input.type ?? "standalone",
      channels: input.channels ?? [],
      version: input.type === "multichannel" ? "v1" : null,
      startedAt: input.startedAt ?? new Date().toISOString(),
      leads: 0,
      sent: null,
      delivered: null,
      openRate: null,
      replyRate: null,
      clicks: null,
    };
    campaigns.unshift(row);
    return { ...row };
  }

  async updateCampaign(_ctx: Ctx, id: string, patch: CampaignPatch): Promise<Campaign | null> {
    const found = campaigns.find((c) => c.id === id);
    if (!found) return null;
    if (patch.name !== undefined) found.name = patch.name;
    if (patch.status !== undefined) found.status = patch.status;
    if (patch.type !== undefined) found.type = patch.type;
    if (patch.channels !== undefined) found.channels = patch.channels;
    if (patch.startedAt !== undefined && patch.startedAt !== null) found.startedAt = patch.startedAt;
    return { ...found };
  }

  async deleteCampaign(_ctx: Ctx, id: string): Promise<boolean> {
    const at = campaigns.findIndex((c) => c.id === id);
    if (at < 0) return false;
    campaigns.splice(at, 1);
    // Mirror the database's ON DELETE SET NULL so a lead never points at a campaign that is gone.
    for (const lead of leadRows) if (lead.campaignId === id) lead.campaignId = null;
    return true;
  }

  async setCampaignStatus(_ctx: Ctx, id: string, status: CampaignStatus): Promise<Campaign | null> {
    const found = campaigns.find((c) => c.id === id);
    if (!found) return null;
    found.status = status;
    return { ...found };
  }

  async listLeads(_ctx: Ctx, query: LeadQuery): Promise<Paged<Lead>> {
    const filtered = leadRows.filter(
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

  async getLead(_ctx: Ctx, id: string): Promise<Lead | null> {
    const found = leadRows.find((lead) => lead.id === id);
    return found ? { ...found } : null;
  }

  async createLead(_ctx: Ctx, input: LeadPatch): Promise<Lead | WriteError> {
    if (input.campaignId && !campaigns.some((c) => c.id === input.campaignId)) {
      return { error: { field: "campaignId", message: "That campaign does not exist." } };
    }
    const name = input.name ?? "Unnamed lead";
    const owner = TEAM.find((m) => m.id === input.ownerId) ?? TEAM[0];
    const row: Lead = {
      id: `l_${nextId("lead")}`,
      name,
      company: input.company ?? "",
      initials: initialsOf(name),
      phone: input.phone ?? null,
      email: input.email ?? null,
      stage: input.stage ?? "reaching",
      score: input.score ?? 0,
      source: input.source ?? "form",
      tags: input.tags ?? [],
      consent: input.consent ?? false,
      avgCallSeconds: null,
      messageCount: 0,
      callCount: 0,
      nextStep: input.nextStep ?? "",
      ownerId: owner.id,
      ownerName: owner.name,
      campaignId: input.campaignId ?? null,
      starred: input.starred ?? false,
      updatedAt: new Date().toISOString(),
    };
    leadRows.unshift(row);
    return { ...row };
  }

  async updateLead(_ctx: Ctx, id: string, patch: LeadPatch): Promise<Lead | WriteError | null> {
    const found = leadRows.find((lead) => lead.id === id);
    if (!found) return null;
    if (patch.campaignId && !campaigns.some((c) => c.id === patch.campaignId)) {
      return { error: { field: "campaignId", message: "That campaign does not exist." } };
    }
    if (patch.name !== undefined) {
      found.name = patch.name;
      found.initials = initialsOf(patch.name);
    }
    if (patch.company !== undefined) found.company = patch.company;
    if (patch.email !== undefined) found.email = patch.email;
    if (patch.phone !== undefined) found.phone = patch.phone;
    if (patch.stage !== undefined) found.stage = patch.stage;
    if (patch.score !== undefined) found.score = patch.score;
    if (patch.source !== undefined) found.source = patch.source;
    if (patch.tags !== undefined) found.tags = patch.tags;
    if (patch.consent !== undefined) found.consent = patch.consent;
    if (patch.nextStep !== undefined) found.nextStep = patch.nextStep;
    if (patch.starred !== undefined) found.starred = patch.starred;
    if (patch.campaignId !== undefined) found.campaignId = patch.campaignId;
    if (patch.ownerId !== undefined) {
      const owner = TEAM.find((m) => m.id === patch.ownerId);
      if (owner) {
        found.ownerId = owner.id;
        found.ownerName = owner.name;
      }
    }
    found.updatedAt = new Date().toISOString();
    return { ...found };
  }

  async deleteLead(_ctx: Ctx, id: string): Promise<boolean> {
    const at = leadRows.findIndex((lead) => lead.id === id);
    if (at < 0) return false;
    leadRows.splice(at, 1);
    return true;
  }

  async listThreads(_ctx: Ctx, query: ThreadQuery): Promise<Thread[]> {
    const items = threads.filter(
      (t) =>
        matchesText([t.leadName, t.company, t.preview], query.q) &&
        (query.filter !== "to-reply" || t.needsReply),
    );
    return sortBy(items, (t) => t.lastAt, "desc").map((t) => ({ ...t }));
  }

  async getThread(
    _ctx: Ctx,
    id: string,
  ): Promise<{ thread: Thread; messages: Message[] } | null> {
    const thread = threads.find((t) => t.id === id);
    if (!thread) return null;
    const rows = messages.filter((m) => m.threadId === id);
    thread.unread = false;
    return {
      thread: { ...thread },
      messages: sortBy(rows, (m) => m.sentAt, "asc").map((m) => ({ ...m })),
    };
  }

  async sendMessage(_ctx: Ctx, { threadId, channel, body }: SendMessageInput): Promise<Message | null> {
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

  async getAnalytics(_ctx: Ctx, range: RangeKey, channels: Channel[] | null): Promise<Analytics> {
    const days = rangeDays(range);
    const { current, previous, sum } = windows(days);
    // Channel mix is a fixed split of the totals; a real store groups by channel.
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

  /* ---- lead uploads and segments ---------------------------------------- */

  async createUpload(
    _ctx: Ctx,
    input: { fileName: string; fileSize: number; table: Table },
  ): Promise<UploadPreview> {
    sweepUploads();
    const uploadId = "up_" + uploadSeq++;
    uploads.set(uploadId, { ...input, at: Date.now() });
    return {
      uploadId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      headers: input.table.headers,
      sample: input.table.rows.slice(0, 5),
      totalRows: input.table.rows.length,
      suggestedMapping: suggestMapping(input.table.headers),
    };
  }

  async getUpload(_ctx: Ctx, id: string) {
    const upload = uploads.get(id);
    return upload ? { fileName: upload.fileName, fileSize: upload.fileSize, table: upload.table } : null;
  }

  async listSegments(_ctx: Ctx): Promise<Segment[]> {
    return segments.map((s) => ({ ...s })).reverse();
  }

  async getSegment(_ctx: Ctx, id: string): Promise<Segment | null> {
    const found = segments.find((s) => s.id === id);
    return found ? { ...found } : null;
  }

  async createSegment(
    ctx: Ctx,
    input: {
      uploadId: string;
      name: string;
      description: string;
      mapping: Mapping;
      report: MappingReport;
      leads: ParsedLead[];
    },
  ) {
    const upload = uploads.get(input.uploadId);
    if (!upload) return null;

    const id = "seg_" + segmentSeq++;
    const now = new Date().toISOString();
    const merge = mergeLeads(
      profiles,
      input.leads.map((lead) => ({
        row: lead.row,
        email: lead.email,
        mobile: lead.mobile,
        whatsapp: lead.whatsapp,
        linkedin: lead.linkedin,
        extra: lead.extra,
      })),
      id,
      now,
      () => "prof_" + profileSeq++,
    );
    profiles = merge.profiles;

    const segment: Segment = {
      id,
      name: input.name,
      description: input.description,
      fileName: upload.fileName,
      fileSize: upload.fileSize,
      mapping: input.mapping,
      totalRows: input.report.totalRows,
      reachableRows: input.report.reachableRows,
      channels: input.report.channels,
      profilesCreated: merge.created,
      profilesMerged: merge.merged,
      errorCount: input.report.errorCount,
      createdAt: now,
      createdBy: ctx.userId,
    };
    segments.push(segment);
    uploads.delete(input.uploadId);

    return { segment, profilesCreated: merge.created, profilesMerged: merge.merged };
  }

  async listProfiles(_ctx: Ctx, segmentId?: string): Promise<LeadProfile[]> {
    const all = segmentId ? profiles.filter((p) => p.segmentIds.includes(segmentId)) : profiles;
    return all.map((p) => ({ ...p, segmentIds: [...p.segmentIds], extra: { ...p.extra } })).reverse();
  }
}
