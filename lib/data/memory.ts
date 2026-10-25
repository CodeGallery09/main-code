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
  ACCOUNTS,
  CAMPAIGNS,
  DEMO_USER,
  DOMAINS,
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
  SettingsPatch,
  TaskQuery,
  ThreadQuery,
  WriteError,
} from "@/lib/data/repository";
import { AUDIENCE_CAMPAIGN, WORKFLOWS, toGraph, type WorkflowGraph } from "@/lib/app/workflow";
import { defaultWorkspaceSettings } from "@/lib/app/configuration";
import type { AccountSettingsPatch, CampaignPatch, LeadPatch } from "@/lib/data/validate";
import { findInJourney, mergeLeads, type InJourneyRow, type LeadProfile } from "@/lib/leads/merge";
import { identityFill, leadIdentity, splitFileFields } from "@/lib/leads/profile";
import { buildProspect } from "@/lib/leads/prospect";
import { blockingCount, setupChecks } from "@/lib/data/setup";
import type { MappingReport, Segment, UploadPreview } from "@/lib/leads/segments";
import { suggestMapping, type Mapping, type ParsedLead } from "@/lib/leads/validation";
import type { Table } from "@/lib/leads/table";
import type {
  AccountActivity,
  AccountsSnapshot,
  Analytics,
  Badges,
  Campaign,
  CampaignStatus,
  Channel,
  ChannelAccount,
  ChannelBreakdown,
  ConnectSession,
  FunnelStage,
  Lead,
  LeadQuery,
  Message,
  Metric,
  Overview,
  Paged,
  ProspectProfile,
  RangeKey,
  Task,
  Thread,
  TrendPoint,
  User,
  Workspace,
  WorkflowRecord,
  WorkspaceSettings,
} from "@/lib/data/types";

/**
 * Every piece of mutable state below lives on `globalThis`, not in this module. Next bundles each
 * route handler separately, so a module-level array is a different copy in `/api/leads` than in
 * `/api/leads/[id]`: an upload parked by one route was "no longer available" in the next, and a
 * starred lead looked unstarred in the list. One process, one store — the same fix as the cached
 * pool in lib/db/client.ts. (Serverless instances still don't share it; demo writes are scratch.)
 */
const globalForMemory = globalThis as unknown as { __fpMemory?: Record<string, unknown> };
const memo = (globalForMemory.__fpMemory ??= {});
function shared<T>(key: string, init: () => T): T {
  if (!(key in memo)) memo[key] = init();
  return memo[key] as T;
}

/**
 * Uploaded files and saved segments. Module state, so they last until the server restarts, like
 * every other write in this store. Uploaded rows merge into `leadRows`, the same lead list the
 * Leads screen shows, so memory mode behaves like the database.
 */
const uploads = shared("uploads", () => new Map<string, { fileName: string; fileSize: number; table: Table; at: number }>());
const segments = shared<Segment[]>("segments", () => []);
const segmentMembers = shared("segmentMembers", () => new Map<string, Set<string>>());
/** What the `Lead` shape has no field for: the kept file columns and the creation time. Seed leads
 *  have neither, so their profiles say so rather than invent one. */
const leadExtra = shared("leadExtra", () => new Map<string, Record<string, string>>());
const leadCreatedAt = shared("leadCreatedAt", () => new Map<string, string>());
const seq = shared("seq", () => ({ segment: 1, upload: 1 }));

/** Parsed files are scratch space; drop anything older than an hour. */
function sweepUploads() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, upload] of uploads) if (upload.at < cutoff) uploads.delete(id);
}

// Mutable copies, so prototype writes are visible on the next read.
const campaigns = shared<Campaign[]>("campaigns", () => CAMPAIGNS.map((c) => ({ ...c })));
const messages = shared<Message[]>("messages", () => MESSAGES.map((m) => ({ ...m })));
const threads = shared<Thread[]>("threads", () => THREADS.map((t) => ({ ...t })));
const leadRows = shared<Lead[]>("leadRows", () => LEADS.map((l) => ({ ...l })));
const trend = shared<TrendPoint[]>("trend", () => buildTrend(90));
const accounts = shared<ChannelAccount[]>("accounts", () => ACCOUNTS.map((a) => structuredClone(a)));
const domains = shared("domains", () => DOMAINS.map((d) => ({ ...d })));

/** The demo workspace's Configuration settings (Variables, Sending rules, Compliance). Module
 * state like everything else here: a save lasts until the server restarts. */
const settings = shared("settings", () => ({ row: defaultWorkspaceSettings() as WorkspaceSettings }));

/** Monotonic ids for prototype creates, so two leads made in the same millisecond differ. */
/** Workflows saved in this process, by campaign id. Seed campaigns fall back to the demo graphs. */
const workflowRows = shared("workflowRows", () => new Map<string, WorkflowRecord>());

const counters = shared<Record<string, number>>("counters", () => ({}));
const nextId = (kind: string) => `${Date.now().toString(36)}${(counters[kind] = (counters[kind] ?? 0) + 1)}`;

/** "Aarav Kapoor" -> "AK". The avatar needs it and the UI never derives it itself. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

const tasks = shared<Task[]>("tasks", () => [
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
]);

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
    workflowRows.delete(id);
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

  /* ----------------------------------------------------------- workflows -- */

  async getWorkflow(_ctx: Ctx, campaignId: string): Promise<WorkflowRecord | null> {
    const saved = workflowRows.get(campaignId);
    if (saved) return structuredClone(saved);
    // The seed's multichannel campaigns each have a demo workflow with the same name.
    const campaign = campaigns.find((c) => c.id === campaignId);
    const demo = campaign && WORKFLOWS.find((w) => w.name === campaign.name);
    if (!campaign || !demo) return null;
    return structuredClone({
      campaignId,
      name: demo.name,
      // The demo graphs name invented audience lists; in a workspace they read the campaign's leads.
      graph: ((g) => ({
        ...g,
        nodes: g.nodes.map((n) => (n.kind === "audience" ? { ...n, data: { ...n.data, list: AUDIENCE_CAMPAIGN } } : n)),
      }))(toGraph(demo)),
      updatedAt: campaign.startedAt,
    });
  }

  async listWorkflows(ctx: Ctx): Promise<WorkflowRecord[]> {
    const out: WorkflowRecord[] = [];
    for (const c of campaigns) {
      if (c.type !== "multichannel") continue;
      const found = await this.getWorkflow(ctx, c.id);
      if (found) out.push(found);
    }
    return out;
  }

  async saveWorkflow(
    _ctx: Ctx,
    campaignId: string,
    input: { name: string; graph: WorkflowGraph },
  ): Promise<WorkflowRecord | WriteError | null> {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return null;
    if (campaign.type !== "multichannel") {
      return { error: { field: "campaign", message: "Only multichannel campaigns have a workflow." } };
    }
    const record: WorkflowRecord = {
      campaignId,
      name: input.name,
      graph: structuredClone(input.graph),
      updatedAt: new Date().toISOString(),
    };
    workflowRows.set(campaignId, record);
    return structuredClone(record);
  }

  async removeSampleData(_ctx: Ctx): Promise<{ campaigns: number; leads: number }> {
    let removedLeads = 0;
    for (let i = leadRows.length - 1; i >= 0; i--) {
      if (leadRows[i].isSample) {
        leadRows.splice(i, 1);
        removedLeads++;
      }
    }
    let removedCampaigns = 0;
    for (let i = campaigns.length - 1; i >= 0; i--) {
      if (campaigns[i].isSample) {
        workflowRows.delete(campaigns[i].id);
        campaigns.splice(i, 1);
        removedCampaigns++;
      }
    }
    for (let i = accounts.length - 1; i >= 0; i--) if (accounts[i].isSample) accounts.splice(i, 1);
    for (let i = domains.length - 1; i >= 0; i--) if (domains[i].isSample) domains.splice(i, 1);
    return { campaigns: removedCampaigns, leads: removedLeads };
  }

  /* ------------------------------------------- org-level channel accounts -- */

  private account(a: ChannelAccount): ChannelAccount {
    return structuredClone(a);
  }

  async listAccounts(_ctx: Ctx): Promise<AccountsSnapshot> {
    return { accounts: accounts.map((a) => this.account(a)), domains: domains.map((d) => ({ ...d })) };
  }

  async updateAccount(_ctx: Ctx, id: string, patch: AccountSettingsPatch): Promise<ChannelAccount | WriteError | null> {
    const found = accounts.find((a) => a.id === id);
    if (!found) return null;
    Object.assign(found.settings, patch);
    return this.account(found);
  }

  /* ------------------------------------------------- workspace settings -- */

  async getSettings(_ctx: Ctx): Promise<WorkspaceSettings> {
    return structuredClone(settings.row);
  }

  async updateSettings(_ctx: Ctx, patch: SettingsPatch): Promise<WorkspaceSettings> {
    settings.row = {
      variableFallbacks: { ...settings.row.variableFallbacks, ...(patch.variableFallbacks ?? {}) },
      sendingRules: { ...settings.row.sendingRules, ...(patch.sendingRules ?? {}) },
      compliance: { ...settings.row.compliance, ...(patch.compliance ?? {}) },
    };
    return structuredClone(settings.row);
  }

  async deleteAccount(_ctx: Ctx, id: string): Promise<{ deleted: string } | null> {
    const at = accounts.findIndex((a) => a.id === id);
    if (at < 0) return null;
    accounts.splice(at, 1);
    return { deleted: id };
  }

  /**
   * Nothing is connected in demo mode, so nothing has happened on any account: every figure is a
   * truthful zero rather than an invented count.
   */
  async accountActivity(_ctx: Ctx, windowDays: number): Promise<AccountActivity[]> {
    const days = Math.max(1, Math.min(365, Math.trunc(windowDays)));
    return accounts.map((a) => ({
      accountId: a.id,
      messagesReceived: 0,
      statusChanges: 0,
      lastMessageAt: null,
      lastStatusAt: null,
      windowDays: days,
    }));
  }

  /**
   * Connecting needs a provider and somewhere durable to park the attempt, and demo mode has
   * neither — a serverless instance that handled the provider's callback would not be the one
   * holding this Map. So it refuses rather than opening an attempt that can never complete; the
   * route turns `null` into the same "not configured" answer an unset API key gives.
   */
  async createConnectSession(): Promise<ConnectSession | null> {
    return null;
  }

  async getConnectSession(): Promise<ConnectSession | null> {
    return null;
  }

  async setAccountCampaigns(_ctx: Ctx, id: string, campaignIds: string[]): Promise<ChannelAccount | WriteError | null> {
    const found = accounts.find((a) => a.id === id);
    if (!found) return null;
    if (campaignIds.some((cid) => !campaigns.some((c) => c.id === cid))) {
      return { error: { field: "campaignIds", message: "One of those campaigns doesn't exist." } };
    }
    found.campaignIds = [...campaignIds];
    return this.account(found);
  }

  async getBadges(ctx: Ctx): Promise<Badges> {
    return {
      tasks: tasks.filter((t) => !t.done).length,
      inbox: threads.filter((t) => t.needsReply).length,
      config: blockingCount(setupChecks(await this.listAccounts(ctx))),
    };
  }

  async listLeads(_ctx: Ctx, query: LeadQuery): Promise<Paged<Lead>> {
    const audience =
      query.segmentId && query.segmentId !== "all" ? (segmentMembers.get(query.segmentId) ?? new Set<string>()) : null;
    const filtered = leadRows.filter(
      (lead) =>
        matchesText([lead.name, lead.company, lead.title, lead.email ?? "", ...lead.tags], query.q) &&
        matchesFacet(lead.stage, query.stage) &&
        matchesFacet(lead.ownerId, query.ownerId) &&
        matchesFacet(lead.campaignId, query.campaignId) &&
        (!audience || audience.has(lead.id)),
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

  async getProspect(_ctx: Ctx, id: string): Promise<ProspectProfile | null> {
    const lead = leadRows.find((l) => l.id === id);
    if (!lead) return null;

    const campaign = lead.campaignId ? campaigns.find((c) => c.id === lead.campaignId) : undefined;
    const own = threads.filter((t) => t.leadId === id);
    const ownIds = new Set(own.map((t) => t.id));
    const company = lead.company.trim().toLowerCase();
    const colleagues = company
      ? leadRows.filter((l) => l.id !== id && l.company.trim().toLowerCase() === company)
      : [];
    const fields = splitFileFields(leadExtra.get(id) ?? {});

    return buildProspect({
      lead: { ...lead },
      createdAt: leadCreatedAt.get(id) ?? null,
      companyFields: fields.company,
      otherFields: fields.other,
      campaign: campaign ? { id: campaign.id, name: campaign.name, status: campaign.status, type: campaign.type } : null,
      // The demo store has no execution engine, so no run has ever been recorded.
      run: null,
      audiences: segments
        .filter((s) => segmentMembers.get(s.id)?.has(id))
        .map((s) => ({ id: s.id, name: s.name, fileName: s.fileName, importedAt: s.createdAt })),
      threads: own.map((t) => ({
        id: t.id,
        channel: t.channel,
        intent: t.intent,
        needsReply: t.needsReply,
        lastAt: t.lastAt,
        signals: t.signals,
      })),
      messages: messages
        .filter((m) => ownIds.has(m.threadId))
        .map((m) => ({ id: m.id, threadId: m.threadId, from: m.from, channel: m.channel, body: m.body, sentAt: m.sentAt })),
      events: [],
      tasks: tasks
        .filter((t) => t.leadId === id)
        .map((t) => ({ id: t.id, kind: t.kind, summary: t.summary, channel: t.channel, done: t.done, when: t.when, createdAt: null })),
      colleagues: sortBy(colleagues, (l) => l.name, "asc")
        .slice(0, 8)
        .map((l) => ({ id: l.id, name: l.name, title: l.title })),
      colleagueCount: colleagues.length,
    });
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
      title: input.title ?? "",
      initials: initialsOf(name),
      phone: input.phone ?? null,
      email: input.email ?? null,
      linkedin: input.linkedin ?? null,
      stage: input.stage ?? "new",
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
    leadCreatedAt.set(row.id, row.updatedAt);
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
    if (patch.title !== undefined) found.title = patch.title;
    if (patch.email !== undefined) found.email = patch.email;
    if (patch.phone !== undefined) found.phone = patch.phone;
    if (patch.linkedin !== undefined) found.linkedin = patch.linkedin;
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
    // Mirrors the database's cascade: a deleted prospect leaves every audience.
    for (const members of segmentMembers.values()) members.delete(id);
    leadExtra.delete(id);
    leadCreatedAt.delete(id);
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
    const uploadId = "up_" + seq.upload++;
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

  async findInJourney(
    _ctx: Ctx,
    leads: ParsedLead[],
  ): Promise<{ hits: InJourneyRow[]; campaignNames: Record<string, string> }> {
    const known = leadRows.map((l) => ({
      id: l.id,
      campaignId: l.campaignId,
      email: l.email,
      mobile: l.phone,
      whatsapp: l.whatsapp ?? null,
      linkedin: l.linkedin ?? null,
    }));
    const hits = findInJourney(known, leads);
    const campaignNames: Record<string, string> = {};
    for (const hit of hits) {
      const campaign = campaigns.find((c) => c.id === hit.campaignId);
      if (campaign) campaignNames[campaign.id] = campaign.name;
    }
    return { hits, campaignNames };
  }

  async listLeadKeys(_ctx: Ctx) {
    return leadRows.map((l) => ({
      id: l.id,
      name: l.name,
      email: l.email,
      mobile: l.phone,
      whatsapp: l.whatsapp ?? null,
      linkedin: l.linkedin ?? null,
    }));
  }

  /** Counted against the live lead list, so a prospect removed by any path drops out. */
  private withCount(segment: Segment): Segment {
    const members = segmentMembers.get(segment.id);
    const leadCount = members ? leadRows.filter((l) => members.has(l.id)).length : 0;
    return { ...segment, leadCount };
  }

  async listSegments(_ctx: Ctx): Promise<Segment[]> {
    return segments.map((s) => this.withCount(s)).reverse();
  }

  async getSegment(_ctx: Ctx, id: string): Promise<Segment | null> {
    const found = segments.find((s) => s.id === id);
    return found ? this.withCount(found) : null;
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
      consent: boolean;
    },
  ) {
    const upload = uploads.get(input.uploadId);
    if (!upload) return null;

    const id = "seg_" + seq.segment++;
    const now = new Date().toISOString();
    const { hits } = await this.findInJourney(ctx, input.leads);
    const out = new Set(hits.map((h) => h.row));
    const incoming = input.leads.filter((lead) => !out.has(lead.row));
    // The review already took its exclusions out of `input.leads`; record those plus any found now.
    const excluded = input.report.journey.excluded + out.size;

    const existing: LeadProfile[] = leadRows.map((l) => ({
      id: l.id,
      email: l.email,
      mobile: l.phone,
      whatsapp: l.whatsapp ?? null,
      linkedin: l.linkedin ?? null,
      segmentIds: [],
      extra: { ...(leadExtra.get(l.id) ?? {}) },
      createdAt: l.updatedAt,
      updatedAt: l.updatedAt,
    }));
    const known = new Set(existing.map((p) => p.id));
    const merge = mergeLeads(
      existing,
      incoming.map((lead) => ({ row: lead.row, email: lead.email, mobile: lead.mobile, whatsapp: lead.whatsapp, linkedin: lead.linkedin, extra: lead.extra })),
      id,
      now,
      () => "l_" + nextId("lead"),
    );

    const members = new Set<string>();
    for (const profile of merge.profiles) {
      if (!known.has(profile.id)) {
        const who = leadIdentity(profile);
        leadRows.push({
          id: profile.id,
          name: who.name,
          company: who.company,
          title: who.title,
          initials: who.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
          phone: profile.mobile,
          email: profile.email,
          whatsapp: profile.whatsapp,
          linkedin: profile.linkedin,
          stage: "new",
          score: 0,
          source: "csv",
          tags: [],
          consent: input.consent,
          avgCallSeconds: null,
          messageCount: 0,
          callCount: 0,
          nextStep: "",
          ownerId: ctx.userId,
          ownerName: "",
          campaignId: null,
          starred: false,
          updatedAt: now,
        });
        leadExtra.set(profile.id, profile.extra);
        leadCreatedAt.set(profile.id, now);
        members.add(profile.id);
      } else if (profile.segmentIds.includes(id)) {
        const lead = leadRows.find((l) => l.id === profile.id);
        if (lead) {
          Object.assign(lead, identityFill(lead, profile));
          lead.email = profile.email;
          lead.phone = profile.mobile;
          lead.whatsapp = profile.whatsapp;
          lead.linkedin = profile.linkedin;
          lead.updatedAt = now;
          leadExtra.set(profile.id, profile.extra);
        }
        members.add(profile.id);
      }
    }

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
      profilesMerged: merge.matchedExisting,
      excludedInJourney: excluded,
      errorCount: input.report.errorCount,
      createdAt: now,
      createdBy: ctx.userId,
      leadCount: members.size,
    };
    segments.push(segment);
    segmentMembers.set(id, members);
    uploads.delete(input.uploadId);

    return { segment: { ...segment }, profilesCreated: merge.created, profilesMerged: merge.matchedExisting, excluded };
  }
}
