/**
 * Postgres implementation of `Repository`, via Drizzle.
 *
 * **Every query filters `workspace_id`, including by-id lookups.** An id alone is a guessable
 * key, so `WHERE id = $1` without the workspace predicate is an access-control hole, not a
 * missed optimisation. Grep this file for `ws(` — the helper exists so the predicate is hard to
 * leave out and easy to audit.
 *
 * Two deliberate differences from a naive port of `MemoryRepository`:
 *
 * - **Leads page in SQL.** A workspace can hold tens of thousands; fetching them all to slice in
 *   JS would work in the demo and fall over in production.
 * - **Campaigns are fetched and aggregated in JS.** A workspace holds tens of campaigns, so the
 *   round trip is cheap and the totals stay character-for-character identical to the in-memory
 *   implementation. If that assumption ever breaks, move the aggregate into SQL.
 *
 * `numeric` columns come back from `pg` as **strings**, not numbers, to avoid silent float
 * precision loss. `num()` below is the only place that converts, so a rate never reaches the UI
 * as "12.4" where a number is expected.
 */

import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db/client";
import { MemoryRepository } from "@/lib/data/memory";
import {
  campaigns as campaignsTable,
  channelQuotas,
  dailyRollups,
  leads as leadsTable,
  memberships,
  messages as messagesTable,
  tasks as tasksTable,
  threads as threadsTable,
  users,
  workflows as workflowsTable,
  workspaces,
} from "@/lib/db/schema";
import { deltaPercent, rangeDays, trendOf } from "@/lib/data/query";
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
import type { WorkflowGraph } from "@/lib/app/workflow";
import type { CampaignPatch, LeadPatch } from "@/lib/data/validate";
import type {
  Analytics,
  Campaign,
  CampaignStatus,
  Channel,
  ChannelBreakdown,
  ChannelQuota,
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
  WorkflowRecord,
} from "@/lib/data/types";

/* ------------------------------------------------------------- utilities -- */

/** `numeric` arrives as a string from pg. One place converts, so rounding stays consistent. */
const num = (value: string | number | null): number | null =>
  value === null ? null : Number(typeof value === "string" ? Number.parseFloat(value) : value);

const iso = (value: Date | null): string => (value ?? new Date()).toISOString();

/** "Aarav Kapoor" -> "AK". Derived, never stored, so it cannot drift from the name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Prefixed, sortable, collision-resistant enough for a single-writer insert. */
const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** `YYYY-MM-DD` in UTC — matches the grain of `daily_rollups.day`. */
const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

function daysAgo(n: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return dayKey(date);
}

const ALL_CHANNELS: Channel[] = ["linkedin", "email", "whatsapp", "call", "sms"];

/** Escapes LIKE wildcards so a user typing "100%" searches for that text, not a pattern. */
const likeTerm = (value: string) => `%${value.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

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

type RollupRow = {
  day: string;
  channel: Channel;
  reached: number;
  engaged: number;
  replied: number;
  positive: number;
  meetings: number;
};

/** Collapses per-channel rows into one point per day, oldest first. */
function byDay(rows: RollupRow[]): TrendPoint[] {
  const map = new Map<string, TrendPoint>();
  for (const row of rows) {
    const point = map.get(row.day) ?? {
      date: row.day,
      reached: 0,
      engaged: 0,
      replied: 0,
      positive: 0,
      meetings: 0,
    };
    point.reached += row.reached;
    point.engaged += row.engaged;
    point.replied += row.replied;
    point.positive += row.positive;
    point.meetings += row.meetings;
    map.set(row.day, point);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const sumOf = (rows: TrendPoint[], key: keyof Omit<TrendPoint, "date">) =>
  rows.reduce((total, row) => total + row[key], 0);

/* ------------------------------------------------------------ repository -- */

export class PgRepository implements Repository {
  private get db() {
    return getDb();
  }

  /**
   * The tenancy predicate. Every query composes this; nothing queries a table without it.
   * Generic over the column so one helper covers every table — a per-table version would be
   * easy to forget to use.
   */
  private ws(column: AnyPgColumn, ctx: Ctx) {
    return eq(column, ctx.workspaceId);
  }

  /* ---------------------------------------------------------------- user -- */

  async getUser(ctx: Ctx): Promise<User | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        timeZone: users.timeZone,
        role: memberships.role,
        org: workspaces.name,
      })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      // Joining through memberships is what scopes this: a user outside the workspace finds nothing.
      .where(and(eq(users.id, ctx.userId), eq(memberships.workspaceId, ctx.workspaceId)))
      .limit(1);

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      initials: initialsOf(row.name),
      org: row.org,
      role: row.role === "owner" ? "Owner" : row.role === "admin" ? "Admin" : "Member",
      timeZone: row.timeZone,
    };
  }

  async getWorkspace(ctx: Ctx): Promise<Workspace | null> {
    const [row] = await this.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, ctx.workspaceId))
      .limit(1);
    if (!row) return null;

    const [members, quotas, sample] = await Promise.all([
      this.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.workspaceId, ctx.workspaceId))
        .orderBy(asc(users.name)),
      this.channelQuotas(ctx),
      this.sampleCounts(ctx),
    ]);

    return {
      id: row.id,
      sample,
      name: row.name,
      plan: row.plan,
      seats: row.seats,
      seatsUsed: members.length,
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Member",
        initials: initialsOf(m.name),
      })),
      quotas,
      liveChannels: row.liveChannels as Channel[],
      plannedChannels: row.plannedChannels as Channel[],
    };
  }

  /** How many sample rows the workspace still holds, so the UI knows whether to offer removal. */
  private async sampleCounts(ctx: Ctx): Promise<{ campaigns: number; leads: number }> {
    const [[c], [l]] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(campaignsTable)
        .where(and(this.ws(campaignsTable.workspaceId, ctx), eq(campaignsTable.isSample, true))),
      this.db
        .select({ value: count() })
        .from(leadsTable)
        .where(and(this.ws(leadsTable.workspaceId, ctx), eq(leadsTable.isSample, true))),
    ]);
    return { campaigns: Number(c?.value ?? 0), leads: Number(l?.value ?? 0) };
  }

  private async channelQuotas(ctx: Ctx): Promise<ChannelQuota[]> {
    const rows = await this.db
      .select({ channel: channelQuotas.channel, used: channelQuotas.used, cap: channelQuotas.cap })
      .from(channelQuotas)
      .where(eq(channelQuotas.workspaceId, ctx.workspaceId));
    return rows.map((r) => ({ channel: r.channel as Channel, used: r.used, cap: r.cap }));
  }

  /* ------------------------------------------------------------ overview -- */

  async getOverview(ctx: Ctx, range: RangeKey): Promise<Overview | null> {
    const user = await this.getUser(ctx);
    if (!user) return null;

    const [metrics, tasks, live, quotas] = await Promise.all([
      this.headlineMetrics(ctx, range),
      this.listTasks(ctx, { kind: "all" }),
      this.listCampaigns(ctx, { status: "live" }),
      this.channelQuotas(ctx),
    ]);

    return { user, metrics, tasks, campaigns: live.items.slice(0, 5), quotas };
  }

  /** Current window vs the previous window of the same length, read off the rollups. */
  private async windows(ctx: Ctx, days: number, channels: Channel[] | null) {
    const from = daysAgo(days * 2 - 1);
    const cutoff = daysAgo(days - 1);

    const where = [
      eq(dailyRollups.workspaceId, ctx.workspaceId),
      gte(dailyRollups.day, from),
      lte(dailyRollups.day, dayKey(new Date())),
    ];
    if (channels && channels.length) {
      where.push(inArray(dailyRollups.channel, channels));
    }

    const rows = (await this.db
      .select({
        day: dailyRollups.day,
        channel: dailyRollups.channel,
        reached: dailyRollups.reached,
        engaged: dailyRollups.engaged,
        replied: dailyRollups.replied,
        positive: dailyRollups.positive,
        meetings: dailyRollups.meetings,
      })
      .from(dailyRollups)
      .where(and(...where))) as RollupRow[];

    const points = byDay(rows);
    return {
      rows,
      current: points.filter((p) => p.date >= cutoff),
      previous: points.filter((p) => p.date < cutoff),
    };
  }

  private async headlineMetrics(ctx: Ctx, range: RangeKey): Promise<Metric[]> {
    const days = rangeDays(range);
    const { current, previous } = await this.windows(ctx, days, null);

    const [{ value: activeLeads = 0 } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(leadsTable)
      .where(and(this.ws(leadsTable.workspaceId, ctx), sql`${leadsTable.stage} <> 'closed'`));

    const reached = sumOf(current, "reached");
    const reachedPrev = sumOf(previous, "reached");
    const replied = sumOf(current, "replied");
    const repliedPrev = sumOf(previous, "replied");
    const meetings = sumOf(current, "meetings");
    const meetingsPrev = sumOf(previous, "meetings");
    const rate = reached ? Number(((replied / reached) * 100).toFixed(1)) : 0;
    const ratePrev = reachedPrev ? Number(((repliedPrev / reachedPrev) * 100).toFixed(1)) : 0;
    const spark = (key: keyof Omit<TrendPoint, "date">) => current.slice(-12).map((row) => row[key]);

    return [
      metric("replies", "Replies", replied, repliedPrev, "count", 0, spark("replied")),
      metric("meetings", "Meetings", meetings, meetingsPrev, "count", 0, spark("meetings")),
      metric("reply-rate", "Reply rate", rate, ratePrev, "percent", 1, spark("replied"), "points"),
      metric("active-leads", "Active leads", Number(activeLeads), Number(activeLeads), "count", 0, spark("engaged")),
    ];
  }

  /* --------------------------------------------------------------- tasks -- */

  async listTasks(ctx: Ctx, query: TaskQuery): Promise<Task[]> {
    const where = [this.ws(tasksTable.workspaceId, ctx), eq(tasksTable.done, false)];
    if (query.kind && query.kind !== "all") where.push(eq(tasksTable.kind, query.kind));

    const rows = await this.db
      .select({
        id: tasksTable.id,
        kind: tasksTable.kind,
        leadId: tasksTable.leadId,
        summary: tasksTable.summary,
        whenLabel: tasksTable.whenLabel,
        channel: tasksTable.channel,
        done: tasksTable.done,
        leadName: leadsTable.name,
        company: leadsTable.company,
        score: leadsTable.score,
      })
      .from(tasksTable)
      .innerJoin(leadsTable, eq(leadsTable.id, tasksTable.leadId))
      .where(and(...where))
      .orderBy(desc(leadsTable.score));

    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      leadId: r.leadId,
      leadName: r.leadName,
      company: r.company,
      initials: initialsOf(r.leadName),
      score: r.score,
      summary: r.summary,
      when: r.whenLabel,
      channel: r.channel as Channel,
      done: r.done,
    }));
  }

  async completeTask(ctx: Ctx, id: string): Promise<Task | null> {
    const [row] = await this.db
      .update(tasksTable)
      .set({ done: true })
      .where(and(eq(tasksTable.id, id), this.ws(tasksTable.workspaceId, ctx)))
      .returning({ id: tasksTable.id, leadId: tasksTable.leadId });
    if (!row) return null;

    // Re-read through listTasks' join so the shape is identical; the row is now done, so
    // fetch it directly rather than from the open-tasks list.
    const [full] = await this.db
      .select({
        id: tasksTable.id,
        kind: tasksTable.kind,
        leadId: tasksTable.leadId,
        summary: tasksTable.summary,
        whenLabel: tasksTable.whenLabel,
        channel: tasksTable.channel,
        done: tasksTable.done,
        leadName: leadsTable.name,
        company: leadsTable.company,
        score: leadsTable.score,
      })
      .from(tasksTable)
      .innerJoin(leadsTable, eq(leadsTable.id, tasksTable.leadId))
      .where(and(eq(tasksTable.id, id), this.ws(tasksTable.workspaceId, ctx)))
      .limit(1);
    if (!full) return null;

    return {
      id: full.id,
      kind: full.kind,
      leadId: full.leadId,
      leadName: full.leadName,
      company: full.company,
      initials: initialsOf(full.leadName),
      score: full.score,
      summary: full.summary,
      when: full.whenLabel,
      channel: full.channel as Channel,
      done: full.done,
    };
  }

  /* ----------------------------------------------------------- campaigns -- */

  private toCampaign(row: typeof campaignsTable.$inferSelect): Campaign {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      type: row.type,
      channels: row.channels as Channel[],
      version: row.version,
      startedAt: iso(row.startedAt),
      leads: row.leads,
      sent: row.sent,
      delivered: row.delivered,
      openRate: num(row.openRate),
      replyRate: num(row.replyRate),
      clicks: row.clicks,
      isSample: row.isSample,
    };
  }

  async listCampaigns(
    ctx: Ctx,
    query: CampaignQuery,
  ): Promise<{ items: Campaign[]; totals: CampaignTotals }> {
    const where = [this.ws(campaignsTable.workspaceId, ctx)];
    if (query.q) where.push(ilike(campaignsTable.name, likeTerm(query.q)));
    if (query.status && query.status !== "all") where.push(eq(campaignsTable.status, query.status));
    if (query.type && query.type !== "all") where.push(eq(campaignsTable.type, query.type));
    if (query.channel && query.channel !== "all") {
      // Array containment: the campaign runs on this channel among possibly others.
      where.push(sql`${campaignsTable.channels} @> ARRAY[${query.channel}]::channel[]`);
    }

    const rows = await this.db
      .select()
      .from(campaignsTable)
      .where(and(...where))
      .orderBy(desc(campaignsTable.startedAt));

    const items = rows.map((row) => this.toCampaign(row));

    const delivered = items.reduce((sum, c) => sum + (c.delivered ?? 0), 0);
    const sent = items.reduce((sum, c) => sum + (c.sent ?? 0), 0);
    const mean = (key: "openRate" | "replyRate") => {
      const withValue = items.filter((c) => c[key] !== null);
      return withValue.length
        ? Number((withValue.reduce((sum, c) => sum + (c[key] ?? 0), 0) / withValue.length).toFixed(1))
        : null;
    };

    return {
      items,
      totals: {
        leads: items.reduce((sum, c) => sum + c.leads, 0),
        delivered: delivered || sent,
        openRate: mean("openRate"),
        replyRate: mean("replyRate"),
      },
    };
  }

  async getCampaign(ctx: Ctx, id: string): Promise<Campaign | null> {
    const [row] = await this.db
      .select()
      .from(campaignsTable)
      .where(and(eq(campaignsTable.id, id), this.ws(campaignsTable.workspaceId, ctx)))
      .limit(1);
    return row ? this.toCampaign(row) : null;
  }

  async createCampaign(ctx: Ctx, input: CampaignPatch): Promise<Campaign> {
    const [row] = await this.db
      .insert(campaignsTable)
      .values({
        id: newId("c"),
        workspaceId: ctx.workspaceId,
        name: input.name ?? "Untitled campaign",
        status: input.status ?? "draft",
        type: input.type ?? "standalone",
        channels: input.channels ?? [],
        version: input.type === "multichannel" ? "v1" : null,
        startedAt: input.startedAt ? new Date(input.startedAt) : new Date(),
      })
      .returning();
    return this.toCampaign(row);
  }

  async updateCampaign(ctx: Ctx, id: string, patch: CampaignPatch): Promise<Campaign | null> {
    const set: Partial<typeof campaignsTable.$inferInsert> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.type !== undefined) set.type = patch.type;
    if (patch.channels !== undefined) set.channels = patch.channels;
    if (patch.startedAt) set.startedAt = new Date(patch.startedAt);

    const [row] = await this.db
      .update(campaignsTable)
      .set(set)
      .where(and(eq(campaignsTable.id, id), this.ws(campaignsTable.workspaceId, ctx)))
      .returning();
    return row ? this.toCampaign(row) : null;
  }

  async deleteCampaign(ctx: Ctx, id: string): Promise<boolean> {
    // leads.campaign_id and threads.campaign_id are ON DELETE SET NULL, so rows survive
    // with the reference cleared rather than disappearing with the campaign.
    const gone = await this.db
      .delete(campaignsTable)
      .where(and(eq(campaignsTable.id, id), this.ws(campaignsTable.workspaceId, ctx)))
      .returning({ id: campaignsTable.id });
    return gone.length > 0;
  }

  async setCampaignStatus(ctx: Ctx, id: string, status: CampaignStatus): Promise<Campaign | null> {
    return this.updateCampaign(ctx, id, { status });
  }

  /* ----------------------------------------------------------- workflows -- */

  private toWorkflow(row: typeof workflowsTable.$inferSelect): WorkflowRecord {
    return {
      campaignId: row.campaignId,
      name: row.name,
      // Written only through validateWorkflowGraph, which rebuilds it from a whitelist.
      graph: row.graph as WorkflowGraph,
      updatedAt: iso(row.updatedAt),
    };
  }

  async getWorkflow(ctx: Ctx, campaignId: string): Promise<WorkflowRecord | null> {
    const [row] = await this.db
      .select()
      .from(workflowsTable)
      .where(and(eq(workflowsTable.campaignId, campaignId), this.ws(workflowsTable.workspaceId, ctx)))
      .limit(1);
    return row ? this.toWorkflow(row) : null;
  }

  async listWorkflows(ctx: Ctx): Promise<WorkflowRecord[]> {
    const rows = await this.db
      .select()
      .from(workflowsTable)
      .where(this.ws(workflowsTable.workspaceId, ctx))
      .orderBy(desc(workflowsTable.updatedAt));
    return rows.map((row) => this.toWorkflow(row));
  }

  async saveWorkflow(
    ctx: Ctx,
    campaignId: string,
    input: { name: string; graph: WorkflowGraph },
  ): Promise<WorkflowRecord | WriteError | null> {
    // The campaign must be this workspace's own: the workflow row carries workspace_id from the
    // session, and the campaign id comes from the URL, so check them against each other.
    const campaign = await this.getCampaign(ctx, campaignId);
    if (!campaign) return null;
    if (campaign.type !== "multichannel") {
      return { error: { field: "campaign", message: "Only multichannel campaigns have a workflow." } };
    }
    const now = new Date();
    const [row] = await this.db
      .insert(workflowsTable)
      .values({
        id: newId("wf"),
        workspaceId: ctx.workspaceId,
        campaignId,
        name: input.name,
        graph: input.graph,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: workflowsTable.campaignId,
        set: { name: input.name, graph: input.graph, updatedAt: now },
        // Never let a conflicting row from another workspace be rewritten.
        setWhere: eq(workflowsTable.workspaceId, ctx.workspaceId),
      })
      .returning();
    return row ? this.toWorkflow(row) : null;
  }

  async removeSampleData(ctx: Ctx): Promise<{ campaigns: number; leads: number }> {
    return this.db.transaction(async (tx) => {
      // Leads first: their threads and messages cascade, and the campaign FK is SET NULL anyway.
      const leadsGone = await tx
        .delete(leadsTable)
        .where(and(this.ws(leadsTable.workspaceId, ctx), eq(leadsTable.isSample, true)))
        .returning({ id: leadsTable.id });
      // Deleting the campaign cascades to its workflow row.
      const campaignsGone = await tx
        .delete(campaignsTable)
        .where(and(this.ws(campaignsTable.workspaceId, ctx), eq(campaignsTable.isSample, true)))
        .returning({ id: campaignsTable.id });
      return { campaigns: campaignsGone.length, leads: leadsGone.length };
    });
  }

  /* --------------------------------------------------------------- leads -- */

  async listLeads(ctx: Ctx, query: LeadQuery): Promise<Paged<Lead>> {
    const where = [this.ws(leadsTable.workspaceId, ctx)];
    if (query.q) {
      const term = likeTerm(query.q);
      // Tags are an array, so a text match needs the unnest-and-compare form.
      where.push(
        or(
          ilike(leadsTable.name, term),
          ilike(leadsTable.company, term),
          sql`EXISTS (SELECT 1 FROM unnest(${leadsTable.tags}) AS tag WHERE tag ILIKE ${term})`,
        )!,
      );
    }
    if (query.stage && query.stage !== "all") where.push(eq(leadsTable.stage, query.stage));
    if (query.ownerId && query.ownerId !== "all") where.push(eq(leadsTable.ownerId, query.ownerId));
    if (query.campaignId && query.campaignId !== "all") {
      where.push(eq(leadsTable.campaignId, query.campaignId));
    }
    const predicate = and(...where);

    const sortKey = query.sort ?? "score";
    const dir = query.dir ?? (sortKey === "name" ? "asc" : "desc");
    const column =
      sortKey === "name" ? leadsTable.name : sortKey === "updated" ? leadsTable.updatedAt : leadsTable.score;
    const order = dir === "asc" ? asc(column) : desc(column);

    // Clamp exactly as lib/data/query.ts paginate() does, so both stores page identically.
    const pageSize = Math.min(Math.max(Math.trunc(query.pageSize ?? 25) || 25, 1), 200);
    const [{ value: total = 0 } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(leadsTable)
      .where(predicate);
    const pages = Math.max(1, Math.ceil(Number(total) / pageSize));
    const page = Math.min(Math.max(Math.trunc(query.page ?? 1) || 1, 1), pages);

    const rows = await this.db
      .select({
        lead: leadsTable,
        ownerName: users.name,
      })
      .from(leadsTable)
      .leftJoin(users, eq(users.id, leadsTable.ownerId))
      .where(predicate)
      // A second, unique sort key keeps paging stable: without it, rows with equal scores can
      // swap between pages and a row is shown twice or skipped.
      .orderBy(order, asc(leadsTable.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: rows.map((r) => this.toLead(r.lead, r.ownerName)),
      total: Number(total),
      page,
      pageSize,
    };
  }

  private toLead(row: typeof leadsTable.$inferSelect, ownerName: string | null): Lead {
    return {
      id: row.id,
      name: row.name,
      company: row.company,
      title: row.title,
      initials: initialsOf(row.name),
      phone: row.phone,
      email: row.email,
      stage: row.stage,
      score: row.score,
      source: row.source,
      tags: row.tags,
      consent: row.consent,
      avgCallSeconds: row.avgCallSeconds,
      messageCount: row.messageCount,
      callCount: row.callCount,
      nextStep: row.nextStep,
      ownerId: row.ownerId ?? "",
      ownerName: ownerName ?? "Unassigned",
      campaignId: row.campaignId,
      starred: row.starred,
      updatedAt: iso(row.updatedAt),
      isSample: row.isSample,
    };
  }

  async getLead(ctx: Ctx, id: string): Promise<Lead | null> {
    const [row] = await this.db
      .select({ lead: leadsTable, ownerName: users.name })
      .from(leadsTable)
      .leftJoin(users, eq(users.id, leadsTable.ownerId))
      .where(and(eq(leadsTable.id, id), this.ws(leadsTable.workspaceId, ctx)))
      .limit(1);
    return row ? this.toLead(row.lead, row.ownerName) : null;
  }

  /**
   * Checks a reference belongs to this workspace before it is written. Returning a `WriteError`
   * rather than nulling the field means the caller is told the reference was rejected instead of
   * quietly getting a lead with no campaign.
   */
  private async checkRefs(ctx: Ctx, patch: LeadPatch): Promise<WriteError | null> {
    if (patch.campaignId) {
      const [found] = await this.db
        .select({ id: campaignsTable.id })
        .from(campaignsTable)
        .where(and(eq(campaignsTable.id, patch.campaignId), this.ws(campaignsTable.workspaceId, ctx)))
        .limit(1);
      if (!found) {
        return { error: { field: "campaignId", message: "That campaign does not exist." } };
      }
    }
    if (patch.ownerId) {
      const [found] = await this.db
        .select({ id: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.userId, patch.ownerId), eq(memberships.workspaceId, ctx.workspaceId)))
        .limit(1);
      if (!found) {
        return { error: { field: "ownerId", message: "That owner is not in this workspace." } };
      }
    }
    return null;
  }

  async createLead(ctx: Ctx, input: LeadPatch): Promise<Lead | WriteError> {
    const bad = await this.checkRefs(ctx, input);
    if (bad) return bad;

    const [row] = await this.db
      .insert(leadsTable)
      .values({
        id: newId("l"),
        workspaceId: ctx.workspaceId,
        name: input.name ?? "Unnamed lead",
        company: input.company ?? "",
        title: input.title ?? "",
        phone: input.phone ?? null,
        email: input.email ?? null,
        stage: input.stage ?? "new",
        score: input.score ?? 0,
        source: input.source ?? "form",
        tags: input.tags ?? [],
        consent: input.consent ?? false,
        nextStep: input.nextStep ?? "",
        // Default ownership to whoever created the lead, so nothing lands unassigned.
        ownerId: input.ownerId ?? ctx.userId,
        campaignId: input.campaignId ?? null,
        starred: input.starred ?? false,
      })
      .returning();

    const owner = await this.ownerName(row.ownerId);
    return this.toLead(row, owner);
  }

  private async ownerName(id: string | null): Promise<string | null> {
    if (!id) return null;
    const [row] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
    return row?.name ?? null;
  }

  async updateLead(ctx: Ctx, id: string, patch: LeadPatch): Promise<Lead | WriteError | null> {
    const bad = await this.checkRefs(ctx, patch);
    if (bad) return bad;

    const set: Partial<typeof leadsTable.$inferInsert> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.company !== undefined) set.company = patch.company;
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.email !== undefined) set.email = patch.email;
    if (patch.phone !== undefined) set.phone = patch.phone;
    if (patch.stage !== undefined) set.stage = patch.stage;
    if (patch.score !== undefined) set.score = patch.score;
    if (patch.source !== undefined) set.source = patch.source;
    if (patch.tags !== undefined) set.tags = patch.tags;
    if (patch.consent !== undefined) set.consent = patch.consent;
    if (patch.nextStep !== undefined) set.nextStep = patch.nextStep;
    if (patch.starred !== undefined) set.starred = patch.starred;
    if (patch.campaignId !== undefined) set.campaignId = patch.campaignId;
    if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;

    const [row] = await this.db
      .update(leadsTable)
      .set(set)
      .where(and(eq(leadsTable.id, id), this.ws(leadsTable.workspaceId, ctx)))
      .returning();
    if (!row) return null;

    const owner = await this.ownerName(row.ownerId);
    return this.toLead(row, owner);
  }

  async deleteLead(ctx: Ctx, id: string): Promise<boolean> {
    const gone = await this.db
      .delete(leadsTable)
      .where(and(eq(leadsTable.id, id), this.ws(leadsTable.workspaceId, ctx)))
      .returning({ id: leadsTable.id });
    return gone.length > 0;
  }

  /* ------------------------------------------------------------- threads -- */

  async listThreads(ctx: Ctx, query: ThreadQuery): Promise<Thread[]> {
    const where = [this.ws(threadsTable.workspaceId, ctx)];
    if (query.filter !== "all") where.push(eq(threadsTable.needsReply, true));
    if (query.q) {
      const term = likeTerm(query.q);
      where.push(
        or(ilike(leadsTable.name, term), ilike(leadsTable.company, term), ilike(threadsTable.preview, term))!,
      );
    }

    const rows = await this.db
      .select({
        thread: threadsTable,
        leadName: leadsTable.name,
        company: leadsTable.company,
        score: leadsTable.score,
        stage: leadsTable.stage,
        campaignName: campaignsTable.name,
        ownerName: users.name,
      })
      .from(threadsTable)
      .innerJoin(leadsTable, eq(leadsTable.id, threadsTable.leadId))
      .leftJoin(campaignsTable, eq(campaignsTable.id, threadsTable.campaignId))
      .leftJoin(users, eq(users.id, threadsTable.ownerId))
      .where(and(...where))
      .orderBy(desc(threadsTable.lastAt));

    return rows.map((r) => this.toThread(r));
  }

  private toThread(r: {
    thread: typeof threadsTable.$inferSelect;
    leadName: string;
    company: string;
    score: number;
    stage: Lead["stage"];
    campaignName: string | null;
    ownerName: string | null;
  }): Thread {
    return {
      id: r.thread.id,
      leadId: r.thread.leadId,
      leadName: r.leadName,
      company: r.company,
      initials: initialsOf(r.leadName),
      role: r.thread.role,
      channel: r.thread.channel as Channel,
      intent: r.thread.intent,
      preview: r.thread.preview,
      unread: r.thread.unread,
      needsReply: r.thread.needsReply,
      lastAt: iso(r.thread.lastAt),
      score: r.score,
      stage: r.stage,
      campaignName: r.campaignName,
      ownerName: r.ownerName ?? "Unassigned",
      signals: (r.thread.signals as { label: string; points: number }[]) ?? [],
    };
  }

  async getThread(ctx: Ctx, id: string): Promise<{ thread: Thread; messages: Message[] } | null> {
    const [row] = await this.db
      .select({
        thread: threadsTable,
        leadName: leadsTable.name,
        company: leadsTable.company,
        score: leadsTable.score,
        stage: leadsTable.stage,
        campaignName: campaignsTable.name,
        ownerName: users.name,
      })
      .from(threadsTable)
      .innerJoin(leadsTable, eq(leadsTable.id, threadsTable.leadId))
      .leftJoin(campaignsTable, eq(campaignsTable.id, threadsTable.campaignId))
      .leftJoin(users, eq(users.id, threadsTable.ownerId))
      .where(and(eq(threadsTable.id, id), this.ws(threadsTable.workspaceId, ctx)))
      .limit(1);
    if (!row) return null;

    // Opening a thread marks it read, matching the in-memory store's behaviour.
    await this.db
      .update(threadsTable)
      .set({ unread: false })
      .where(and(eq(threadsTable.id, id), this.ws(threadsTable.workspaceId, ctx)));

    const rows = await this.db
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.threadId, id), this.ws(messagesTable.workspaceId, ctx)))
      .orderBy(asc(messagesTable.sentAt));

    return {
      thread: { ...this.toThread(row), unread: false },
      messages: rows.map((m) => ({
        id: m.id,
        threadId: m.threadId,
        from: m.from,
        channel: m.channel as Channel,
        body: m.body,
        sentAt: iso(m.sentAt),
        read: m.read,
      })),
    };
  }

  async sendMessage(ctx: Ctx, { threadId, channel, body }: SendMessageInput): Promise<Message | null> {
    const [thread] = await this.db
      .select({ id: threadsTable.id })
      .from(threadsTable)
      .where(and(eq(threadsTable.id, threadId), this.ws(threadsTable.workspaceId, ctx)))
      .limit(1);
    if (!thread) return null;

    const sentAt = new Date();
    // One transaction: a reply that appended but left the thread still "needs reply" would put
    // the row back in the inbox queue it was just cleared from.
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(messagesTable)
        .values({
          id: newId("m"),
          workspaceId: ctx.workspaceId,
          threadId,
          from: "us",
          channel,
          body,
          sentAt,
          read: true,
        })
        .returning();

      await tx
        .update(threadsTable)
        .set({ needsReply: false, unread: false, preview: body, lastAt: sentAt })
        .where(eq(threadsTable.id, threadId));

      return {
        id: row.id,
        threadId: row.threadId,
        from: row.from,
        channel: row.channel as Channel,
        body: row.body,
        sentAt: iso(row.sentAt),
        read: row.read,
      };
    });
  }

  /* ----------------------------------------------------------- analytics -- */

  async getAnalytics(ctx: Ctx, range: RangeKey, channels: Channel[] | null): Promise<Analytics> {
    const days = rangeDays(range);
    const { rows, current, previous } = await this.windows(ctx, days, channels);
    const cutoff = daysAgo(days - 1);

    const reached = sumOf(current, "reached");
    const reachedPrev = sumOf(previous, "reached");
    const replied = sumOf(current, "replied");
    const repliedPrev = sumOf(previous, "replied");
    const positive = sumOf(current, "positive");
    const positivePrev = sumOf(previous, "positive");
    const meetings = sumOf(current, "meetings");
    const meetingsPrev = sumOf(previous, "meetings");
    const engaged = sumOf(current, "engaged");
    const rate = reached ? Number(((replied / reached) * 100).toFixed(1)) : 0;
    const ratePrev = reachedPrev ? Number(((repliedPrev / reachedPrev) * 100).toFixed(1)) : 0;
    const spark = (key: keyof Omit<TrendPoint, "date">) => current.slice(-14).map((row) => row[key]);

    // Real per-channel grouping, rather than the fixed split the demo store has to assume.
    const picked = channels && channels.length ? channels : ALL_CHANNELS;
    const byChannel: ChannelBreakdown[] = picked.map((channel) => {
      const inWindow = rows.filter((r) => r.channel === channel && r.day >= cutoff);
      return {
        channel,
        reached: inWindow.reduce((sum, r) => sum + r.reached, 0),
        replies: inWindow.reduce((sum, r) => sum + r.replied, 0),
        meetings: inWindow.reduce((sum, r) => sum + r.meetings, 0),
      };
    });

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
      trend: current,
      byChannel,
      funnel,
    };
  }

  /* ------------------------------------------- lead uploads and segments (TODO) --
   *
   * The file-upload feature landed from another work stream against the in-memory store, and
   * its three concepts — parked uploads, segments, and the merged lead profiles behind them —
   * have no tables yet. Rather than fake persistence or block the feature, these six methods
   * delegate to the in-memory implementation, which is exactly the behaviour the feature ships
   * with today (its own modal tells the user an upload is scratch space until the server
   * restarts).
   *
   * What that costs, stated plainly: with DATABASE_URL set, segments and profiles still live in
   * process memory and are lost on restart, and they are NOT tenant-isolated by the database the
   * way every other table here is. Giving them real tables is tracked in CONTEXT.md §7 and
   * should be designed with whoever owns the upload feature — the merge rules in
   * lib/leads/merge.ts decide what the schema needs to hold.
   */
  private readonly scratch = new MemoryRepository();

  createUpload(ctx: Ctx, input: Parameters<Repository["createUpload"]>[1]) {
    return this.scratch.createUpload(ctx, input);
  }

  getUpload(ctx: Ctx, id: string) {
    return this.scratch.getUpload(ctx, id);
  }

  listSegments(ctx: Ctx) {
    return this.scratch.listSegments(ctx);
  }

  getSegment(ctx: Ctx, id: string) {
    return this.scratch.getSegment(ctx, id);
  }

  createSegment(ctx: Ctx, input: Parameters<Repository["createSegment"]>[1]) {
    return this.scratch.createSegment(ctx, input);
  }

  listProfiles(ctx: Ctx, segmentId?: string) {
    return this.scratch.listProfiles(ctx, segmentId);
  }
}
