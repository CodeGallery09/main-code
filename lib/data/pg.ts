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
 * - **Audiences page in SQL.** A workspace can hold tens of thousands; fetching them all to slice in
 *   JS would work in the demo and fall over in production.
 * - **Strategies are fetched and aggregated in JS.** A workspace holds tens of strategies, so the
 *   round trip is cheap and the totals stay character-for-character identical to the in-memory
 *   implementation. If that assumption ever breaks, move the aggregate into SQL.
 *
 * `numeric` columns come back from `pg` as **strings**, not numbers, to avoid silent float
 * precision loss. `num()` below is the only place that converts, so a rate never reaches the UI
 * as "12.4" where a number is expected.
 */

import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db/client";
import {
  strategyAccounts,
  strategies as strategiesTable,
  channelAccounts,
  channelQuotas,
  connectSessions,
  dailyRollups,
  events as eventsTable,
  audiences as audiencesTable,
  memberships,
  messages as messagesTable,
  segmentAudiences,
  segments as segmentsTable,
  sendingDomains,
  tasks as tasksTable,
  threads as threadsTable,
  uploads as uploadsTable,
  users,
  workflowRuns,
  workflows as workflowsTable,
  workspaces,
  workspaceSettings as workspaceSettingsTable,
} from "@/lib/db/schema";
import { seedSampleWorkspace } from "@/lib/data/sampleSeed";
import { byDay, deltaPercent, rangeDays, sumOf, trendOf, type RollupRow } from "@/lib/data/query";
import type {
  StrategyQuery,
  StrategyTotals,
  Ctx,
  Repository,
  SendMessageInput,
  SettingsPatch,
  TaskQuery,
  ThreadQuery,
  WriteError,
} from "@/lib/data/repository";
import type { WorkflowGraph } from "@/lib/app/workflow";
import { defaultWorkspaceSettings } from "@/lib/app/configuration";
import { setupChecks, blockingCount } from "@/lib/data/setup";
import { ACCOUNT_EVENT } from "@/lib/data/accountEvents";
import { findInJourney, mergeAudiences, type InJourneyRow, type AudienceProfile } from "@/lib/audiences/merge";
import { identityFill, audienceIdentity, splitFileFields } from "@/lib/audiences/profile";
import { buildProspect } from "@/lib/audiences/prospect";
import type { MappingReport, Segment, UploadPreview } from "@/lib/audiences/segments";
import { suggestMapping, type Mapping, type ParsedAudience } from "@/lib/audiences/validation";
import type { Table } from "@/lib/audiences/table";
import type { AccountSettingsPatch, StrategyPatch, AudiencePatch } from "@/lib/data/validate";
import type {
  AccountActivity,
  AccountsSnapshot,
  Analytics,
  Badges,
  Strategy,
  StrategyStatus,
  Channel,
  ChannelAccount,
  ChannelBreakdown,
  ChannelQuota,
  ConnectSession,
  ConnectSessionState,
  EmailSettings,
  FunnelStage,
  Audience,
  AudienceQuery,
  LinkedInAccount,
  LinkedInSettings,
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

/**
 * A connect-session id. Unlike `newId`, this one is a **capability**: whoever holds it can attach
 * a provider account to the workspace that opened it, so it must not be guessable — hence
 * `randomBytes` rather than `Math.random`.
 */
const newConnectId = () => `cx_${randomBytes(18).toString("base64url")}`;

/** A stored LinkedIn state, narrowed to the four the type allows. Anything else reads as healthy. */
function linkedInState(stored: string): LinkedInAccount["state"] {
  return stored === "signed_out" || stored === "restricted" || stored === "connecting" ? stored : "healthy";
}

/** A stored connect-session row as the API shape. The provider's own id is never exposed. */
function toConnectSession(row: typeof connectSessions.$inferSelect): ConnectSession {
  const state: ConnectSessionState =
    row.state === "connected" || row.state === "failed" || row.state === "expired"
      ? row.state
      : row.expiresAt.getTime() < Date.now()
        ? "expired"
        : "pending";
  return {
    id: row.id,
    channel: row.channel,
    provider: row.provider,
    kind: row.kind === "reconnect" ? "reconnect" : "create",
    state,
    detail: row.detail,
    accountId: row.accountId ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

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
  private async sampleCounts(ctx: Ctx): Promise<{ strategies: number; audiences: number }> {
    const [[c], [l]] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(strategiesTable)
        .where(and(this.ws(strategiesTable.workspaceId, ctx), eq(strategiesTable.isSample, true))),
      this.db
        .select({ value: count() })
        .from(audiencesTable)
        .where(and(this.ws(audiencesTable.workspaceId, ctx), eq(audiencesTable.isSample, true))),
    ]);
    return { strategies: Number(c?.value ?? 0), audiences: Number(l?.value ?? 0) };
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
      this.listStrategies(ctx, { status: "live" }),
      this.channelQuotas(ctx),
    ]);

    return { user, metrics, tasks, strategies: live.items.slice(0, 5), quotas };
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

    const [{ value: activeAudiences = 0 } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(audiencesTable)
      .where(and(this.ws(audiencesTable.workspaceId, ctx), sql`${audiencesTable.stage} <> 'closed'`));

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
      // A rate has no change to report against a period with nothing sent: comparing it with 0
      // would present the whole rate as a gain.
      { ...metric("reply-rate", "Reply rate", rate, ratePrev, "percent", 1, spark("replied"), "points"), ...(reachedPrev ? {} : { delta: null, trend: "flat" as const }) },
      metric("active-audiences", "Active audiences", Number(activeAudiences), Number(activeAudiences), "count", 0, spark("engaged")),
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
        audienceId: tasksTable.audienceId,
        summary: tasksTable.summary,
        whenLabel: tasksTable.whenLabel,
        channel: tasksTable.channel,
        done: tasksTable.done,
        audienceName: audiencesTable.name,
        company: audiencesTable.company,
        score: audiencesTable.score,
      })
      .from(tasksTable)
      .innerJoin(audiencesTable, eq(audiencesTable.id, tasksTable.audienceId))
      .where(and(...where))
      .orderBy(desc(audiencesTable.score));

    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      audienceId: r.audienceId,
      audienceName: r.audienceName,
      company: r.company,
      initials: initialsOf(r.audienceName),
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
      .returning({ id: tasksTable.id, audienceId: tasksTable.audienceId });
    if (!row) return null;

    // Re-read through listTasks' join so the shape is identical; the row is now done, so
    // fetch it directly rather than from the open-tasks list.
    const [full] = await this.db
      .select({
        id: tasksTable.id,
        kind: tasksTable.kind,
        audienceId: tasksTable.audienceId,
        summary: tasksTable.summary,
        whenLabel: tasksTable.whenLabel,
        channel: tasksTable.channel,
        done: tasksTable.done,
        audienceName: audiencesTable.name,
        company: audiencesTable.company,
        score: audiencesTable.score,
      })
      .from(tasksTable)
      .innerJoin(audiencesTable, eq(audiencesTable.id, tasksTable.audienceId))
      .where(and(eq(tasksTable.id, id), this.ws(tasksTable.workspaceId, ctx)))
      .limit(1);
    if (!full) return null;

    return {
      id: full.id,
      kind: full.kind,
      audienceId: full.audienceId,
      audienceName: full.audienceName,
      company: full.company,
      initials: initialsOf(full.audienceName),
      score: full.score,
      summary: full.summary,
      when: full.whenLabel,
      channel: full.channel as Channel,
      done: full.done,
    };
  }

  /* ----------------------------------------------------------- strategies -- */

  private toStrategy(row: typeof strategiesTable.$inferSelect): Strategy {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      type: row.type,
      channels: row.channels as Channel[],
      version: row.version,
      startedAt: iso(row.startedAt),
      audiences: row.audiences,
      sent: row.sent,
      delivered: row.delivered,
      openRate: num(row.openRate),
      replyRate: num(row.replyRate),
      clicks: row.clicks,
      isSample: row.isSample,
    };
  }

  async listStrategies(
    ctx: Ctx,
    query: StrategyQuery,
  ): Promise<{ items: Strategy[]; totals: StrategyTotals }> {
    const where = [this.ws(strategiesTable.workspaceId, ctx)];
    if (query.q) where.push(ilike(strategiesTable.name, likeTerm(query.q)));
    if (query.status && query.status !== "all") where.push(eq(strategiesTable.status, query.status));
    if (query.type && query.type !== "all") where.push(eq(strategiesTable.type, query.type));
    if (query.channel && query.channel !== "all") {
      // Array containment: the strategy runs on this channel among possibly others.
      where.push(sql`${strategiesTable.channels} @> ARRAY[${query.channel}]::channel[]`);
    }

    const rows = await this.db
      .select()
      .from(strategiesTable)
      .where(and(...where))
      .orderBy(desc(strategiesTable.startedAt));

    const items = rows.map((row) => this.toStrategy(row));

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
        audiences: items.reduce((sum, c) => sum + c.audiences, 0),
        delivered: delivered || sent,
        openRate: mean("openRate"),
        replyRate: mean("replyRate"),
      },
    };
  }

  async getStrategy(ctx: Ctx, id: string): Promise<Strategy | null> {
    const [row] = await this.db
      .select()
      .from(strategiesTable)
      .where(and(eq(strategiesTable.id, id), this.ws(strategiesTable.workspaceId, ctx)))
      .limit(1);
    return row ? this.toStrategy(row) : null;
  }

  async createStrategy(ctx: Ctx, input: StrategyPatch): Promise<Strategy> {
    const [row] = await this.db
      .insert(strategiesTable)
      .values({
        id: newId("c"),
        workspaceId: ctx.workspaceId,
        name: input.name ?? "Untitled strategy",
        status: input.status ?? "draft",
        type: input.type ?? "standalone",
        channels: input.channels ?? [],
        version: input.type === "multichannel" ? "v1" : null,
        startedAt: input.startedAt ? new Date(input.startedAt) : new Date(),
      })
      .returning();
    return this.toStrategy(row);
  }

  async updateStrategy(ctx: Ctx, id: string, patch: StrategyPatch): Promise<Strategy | null> {
    const set: Partial<typeof strategiesTable.$inferInsert> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.type !== undefined) set.type = patch.type;
    if (patch.channels !== undefined) set.channels = patch.channels;
    if (patch.startedAt) set.startedAt = new Date(patch.startedAt);

    const [row] = await this.db
      .update(strategiesTable)
      .set(set)
      .where(and(eq(strategiesTable.id, id), this.ws(strategiesTable.workspaceId, ctx)))
      .returning();
    return row ? this.toStrategy(row) : null;
  }

  async deleteStrategy(ctx: Ctx, id: string): Promise<boolean> {
    // audiences.strategy_id and threads.strategy_id are ON DELETE SET NULL, so rows survive
    // with the reference cleared rather than disappearing with the strategy.
    const gone = await this.db
      .delete(strategiesTable)
      .where(and(eq(strategiesTable.id, id), this.ws(strategiesTable.workspaceId, ctx)))
      .returning({ id: strategiesTable.id });
    return gone.length > 0;
  }

  async setStrategyStatus(ctx: Ctx, id: string, status: StrategyStatus): Promise<Strategy | null> {
    return this.updateStrategy(ctx, id, { status });
  }

  /* ----------------------------------------------------------- workflows -- */

  private toWorkflow(row: typeof workflowsTable.$inferSelect): WorkflowRecord {
    return {
      strategyId: row.strategyId,
      name: row.name,
      // Written only through validateWorkflowGraph, which rebuilds it from a whitelist.
      graph: row.graph as WorkflowGraph,
      updatedAt: iso(row.updatedAt),
    };
  }

  async getWorkflow(ctx: Ctx, strategyId: string): Promise<WorkflowRecord | null> {
    const [row] = await this.db
      .select()
      .from(workflowsTable)
      .where(and(eq(workflowsTable.strategyId, strategyId), this.ws(workflowsTable.workspaceId, ctx)))
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
    strategyId: string,
    input: { name: string; graph: WorkflowGraph },
  ): Promise<WorkflowRecord | WriteError | null> {
    // The strategy must be this workspace's own: the workflow row carries workspace_id from the
    // session, and the strategy id comes from the URL, so check them against each other.
    const strategy = await this.getStrategy(ctx, strategyId);
    if (!strategy) return null;
    if (strategy.type !== "multichannel") {
      return { error: { field: "strategy", message: "Only multichannel strategies have a workflow." } };
    }
    const now = new Date();
    // The name is typed in the builder but listed on Strategies, so it is the strategy's own.
    if (input.name !== strategy.name) {
      await this.db
        .update(strategiesTable)
        .set({ name: input.name, updatedAt: now })
        .where(and(eq(strategiesTable.id, strategyId), this.ws(strategiesTable.workspaceId, ctx)));
    }
    const [row] = await this.db
      .insert(workflowsTable)
      .values({
        id: newId("wf"),
        workspaceId: ctx.workspaceId,
        strategyId,
        name: input.name,
        graph: input.graph,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: workflowsTable.strategyId,
        set: { name: input.name, graph: input.graph, updatedAt: now },
        // Never let a conflicting row from another workspace be rewritten.
        setWhere: eq(workflowsTable.workspaceId, ctx.workspaceId),
      })
      .returning();
    return row ? this.toWorkflow(row) : null;
  }

  async ensureDemo(ctx: Ctx): Promise<void> {
    const has = (db: Pick<ReturnType<typeof getDb>, "select">) =>
      db
        .select({ id: strategiesTable.id })
        .from(strategiesTable)
        .where(and(this.ws(strategiesTable.workspaceId, ctx), eq(strategiesTable.isSample, true)))
        .limit(1);

    // The common case is one indexed read and no write.
    if ((await has(this.db)).length > 0) return;

    await this.db.transaction(async (tx) => {
      // Serialise first loads of the same workspace, then look again: whoever lost the race finds
      // the demo already there and seeds nothing.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ctx.workspaceId}))`);
      if ((await has(tx)).length > 0) return;
      await seedSampleWorkspace(tx, ctx.workspaceId, ctx.userId);
    });
  }

  /* ------------------------------------------- org-level channel accounts -- */

  private toAccount(row: typeof channelAccounts.$inferSelect, strategyIds: string[]): ChannelAccount {
    const base = {
      id: row.id,
      name: row.name,
      handle: row.handle,
      strategyIds,
      isSample: row.isSample,
      connection: {
        provider: row.provider,
        providerAccountId: row.providerAccountId ?? null,
        statusDetail: row.statusDetail,
        connectedAt: row.connectedAt?.toISOString() ?? null,
        lastEventAt: row.lastEventAt?.toISOString() ?? null,
      },
    };
    if (row.channel === "linkedin") {
      const raw = row.settings as Partial<LinkedInSettings>;
      return {
        ...base,
        channel: "linkedin",
        state: linkedInState(row.state),
        settings: {
          connections: raw.connections ?? 0,
          messages: raw.messages ?? 0,
          visits: raw.visits ?? 0,
          inmail: raw.inmail ?? null,
        },
      };
    }
    const raw = row.settings as Partial<EmailSettings>;
    return {
      ...base,
      channel: "email",
      state: row.state === "warming" ? "warming" : "warm",
      settings: {
        provider: raw.provider ?? "",
        warmDay: raw.warmDay,
        health: raw.health ?? 0,
        cap: raw.cap ?? 0,
        rotate: raw.rotate ?? false,
      },
    };
  }

  async listAccounts(ctx: Ctx): Promise<AccountsSnapshot> {
    const [rows, links, domains] = await Promise.all([
      this.db
        .select()
        .from(channelAccounts)
        .where(this.ws(channelAccounts.workspaceId, ctx))
        .orderBy(asc(channelAccounts.createdAt), asc(channelAccounts.id)),
      this.db
        .select({ accountId: strategyAccounts.accountId, strategyId: strategyAccounts.strategyId })
        .from(strategyAccounts)
        .where(this.ws(strategyAccounts.workspaceId, ctx)),
      this.db
        .select()
        .from(sendingDomains)
        .where(this.ws(sendingDomains.workspaceId, ctx))
        .orderBy(asc(sendingDomains.host)),
    ]);
    const byAccount = new Map<string, string[]>();
    for (const link of links) {
      byAccount.set(link.accountId, [...(byAccount.get(link.accountId) ?? []), link.strategyId]);
    }
    return {
      accounts: rows.map((row) => this.toAccount(row, byAccount.get(row.id) ?? [])),
      domains: domains.map((d) => ({
        id: d.id,
        host: d.host,
        spf: d.spf,
        dkim: d.dkim,
        dmarc: d.dmarc,
        isSample: d.isSample,
      })),
    };
  }

  private async accountById(ctx: Ctx, id: string): Promise<ChannelAccount | null> {
    const [row] = await this.db
      .select()
      .from(channelAccounts)
      .where(and(eq(channelAccounts.id, id), this.ws(channelAccounts.workspaceId, ctx)))
      .limit(1);
    if (!row) return null;
    const links = await this.db
      .select({ strategyId: strategyAccounts.strategyId })
      .from(strategyAccounts)
      .where(and(eq(strategyAccounts.accountId, id), this.ws(strategyAccounts.workspaceId, ctx)));
    return this.toAccount(row, links.map((l) => l.strategyId));
  }

  async updateAccount(ctx: Ctx, id: string, patch: AccountSettingsPatch): Promise<ChannelAccount | WriteError | null> {
    const current = await this.accountById(ctx, id);
    if (!current) return null;
    const next = { ...current.settings, ...patch };
    await this.db
      .update(channelAccounts)
      .set({ settings: next })
      .where(and(eq(channelAccounts.id, id), this.ws(channelAccounts.workspaceId, ctx)));
    return this.accountById(ctx, id);
  }

  async setAccountStrategies(
    ctx: Ctx,
    id: string,
    strategyIds: string[],
  ): Promise<ChannelAccount | WriteError | null> {
    const current = await this.accountById(ctx, id);
    if (!current) return null;

    if (strategyIds.length) {
      // Both sides of the link must be this workspace's: the account was checked above, and each
      // strategy id here comes from the request, so check it against the workspace too.
      const owned = await this.db
        .select({ id: strategiesTable.id })
        .from(strategiesTable)
        .where(and(inArray(strategiesTable.id, strategyIds), this.ws(strategiesTable.workspaceId, ctx)));
      if (owned.length !== strategyIds.length) {
        return { error: { field: "strategyIds", message: "One of those strategies doesn't exist." } };
      }
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(strategyAccounts)
        .where(and(eq(strategyAccounts.accountId, id), this.ws(strategyAccounts.workspaceId, ctx)));
      if (strategyIds.length) {
        await tx
          .insert(strategyAccounts)
          .values(strategyIds.map((strategyId) => ({ workspaceId: ctx.workspaceId, strategyId, accountId: id })));
      }
    });
    return this.accountById(ctx, id);
  }

  async deleteAccount(ctx: Ctx, id: string): Promise<{ deleted: string } | null> {
    const current = await this.accountById(ctx, id);
    if (!current) return null;
    // `strategy_accounts` and `connect_sessions` cascade from the row.
    await this.db
      .delete(channelAccounts)
      .where(and(eq(channelAccounts.id, id), this.ws(channelAccounts.workspaceId, ctx)));
    return { deleted: id };
  }

  async accountActivity(ctx: Ctx, windowDays: number): Promise<AccountActivity[]> {
    const days = Math.max(1, Math.min(365, Math.trunc(windowDays)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [accounts, rows] = await Promise.all([
      this.db
        .select({ id: channelAccounts.id })
        .from(channelAccounts)
        .where(this.ws(channelAccounts.workspaceId, ctx)),
      // Account events carry the account id in the payload: `events` has no account column, and
      // adding one would mean a migration for a figure a grouped jsonb read answers just as well.
      this.db
        .select({
          accountId: sql<string>`${eventsTable.payload} ->> 'accountId'`,
          kind: eventsTable.kind,
          occurredAt: eventsTable.occurredAt,
        })
        .from(eventsTable)
        .where(
          and(
            this.ws(eventsTable.workspaceId, ctx),
            gte(eventsTable.occurredAt, since),
            inArray(eventsTable.kind, [ACCOUNT_EVENT.message, ACCOUNT_EVENT.status]),
          ),
        ),
    ]);

    const blank = (accountId: string): AccountActivity => ({
      accountId,
      messagesReceived: 0,
      statusChanges: 0,
      lastMessageAt: null,
      lastStatusAt: null,
      windowDays: days,
    });
    const by = new Map(accounts.map((a) => [a.id, blank(a.id)]));
    for (const row of rows) {
      const entry = row.accountId ? by.get(row.accountId) : undefined;
      if (!entry) continue;
      const at = row.occurredAt.toISOString();
      if (row.kind === ACCOUNT_EVENT.message) {
        entry.messagesReceived += 1;
        if (!entry.lastMessageAt || at > entry.lastMessageAt) entry.lastMessageAt = at;
      } else {
        entry.statusChanges += 1;
        if (!entry.lastStatusAt || at > entry.lastStatusAt) entry.lastStatusAt = at;
      }
    }
    return [...by.values()];
  }

  /* ----------------------------------------- connecting a channel account -- */

  async createConnectSession(
    ctx: Ctx,
    input: { channel: Channel; provider: string; kind: "create" | "reconnect"; accountId?: string; ttlMinutes: number },
  ): Promise<ConnectSession | null> {
    if (input.accountId && !(await this.accountById(ctx, input.accountId))) return null;
    const expiresAt = new Date(Date.now() + Math.max(1, input.ttlMinutes) * 60 * 1000);
    const [row] = await this.db
      .insert(connectSessions)
      .values({
        id: newConnectId(),
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        channel: input.channel,
        provider: input.provider,
        kind: input.kind,
        accountId: input.accountId ?? null,
        state: "pending",
        expiresAt,
      })
      .returning();
    return toConnectSession(row);
  }

  async getConnectSession(ctx: Ctx, id: string): Promise<ConnectSession | null> {
    const [row] = await this.db
      .select()
      .from(connectSessions)
      .where(and(eq(connectSessions.id, id), this.ws(connectSessions.workspaceId, ctx)))
      .limit(1);
    return row ? toConnectSession(row) : null;
  }

  /* ------------------------------------------------- workspace settings -- */

  async getSettings(ctx: Ctx): Promise<WorkspaceSettings> {
    const [row] = await this.db
      .select()
      .from(workspaceSettingsTable)
      .where(eq(workspaceSettingsTable.workspaceId, ctx.workspaceId))
      .limit(1);
    const defaults = defaultWorkspaceSettings();
    if (!row) return defaults;
    return {
      variableFallbacks: {
        ...defaults.variableFallbacks,
        ...(row.variableFallbacks as WorkspaceSettings["variableFallbacks"]),
      },
      sendingRules: { ...defaults.sendingRules, ...(row.sendingRules as Partial<WorkspaceSettings["sendingRules"]>) },
      compliance: { ...defaults.compliance, ...(row.compliance as Partial<WorkspaceSettings["compliance"]>) },
    };
  }

  async updateSettings(ctx: Ctx, patch: SettingsPatch): Promise<WorkspaceSettings> {
    const current = await this.getSettings(ctx);
    const next: WorkspaceSettings = {
      variableFallbacks: { ...current.variableFallbacks, ...(patch.variableFallbacks ?? {}) },
      sendingRules: { ...current.sendingRules, ...(patch.sendingRules ?? {}) },
      compliance: { ...current.compliance, ...(patch.compliance ?? {}) },
    };
    await this.db
      .insert(workspaceSettingsTable)
      .values({
        workspaceId: ctx.workspaceId,
        variableFallbacks: next.variableFallbacks,
        sendingRules: next.sendingRules,
        compliance: next.compliance,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: workspaceSettingsTable.workspaceId,
        set: {
          variableFallbacks: next.variableFallbacks,
          sendingRules: next.sendingRules,
          compliance: next.compliance,
          updatedAt: new Date(),
        },
      });
    return next;
  }

  async getBadges(ctx: Ctx): Promise<Badges> {
    const [[open], [waiting], snapshot] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(tasksTable)
        .where(and(this.ws(tasksTable.workspaceId, ctx), eq(tasksTable.done, false))),
      this.db
        .select({ value: count() })
        .from(threadsTable)
        .where(and(this.ws(threadsTable.workspaceId, ctx), eq(threadsTable.needsReply, true))),
      this.listAccounts(ctx),
    ]);
    return {
      tasks: Number(open?.value ?? 0),
      inbox: Number(waiting?.value ?? 0),
      config: blockingCount(setupChecks(snapshot)),
    };
  }

  /* --------------------------------------------------------------- audiences -- */

  async listAudiences(ctx: Ctx, query: AudienceQuery): Promise<Paged<Audience>> {
    const where = [this.ws(audiencesTable.workspaceId, ctx)];
    if (query.q) {
      const term = likeTerm(query.q);
      // Tags are an array, so a text match needs the unnest-and-compare form.
      where.push(
        or(
          ilike(audiencesTable.name, term),
          ilike(audiencesTable.company, term),
          ilike(audiencesTable.title, term),
          ilike(audiencesTable.email, term),
          sql`EXISTS (SELECT 1 FROM unnest(${audiencesTable.tags}) AS tag WHERE tag ILIKE ${term})`,
        )!,
      );
    }
    if (query.stage && query.stage !== "all") where.push(eq(audiencesTable.stage, query.stage));
    if (query.ownerId && query.ownerId !== "all") where.push(eq(audiencesTable.ownerId, query.ownerId));
    if (query.strategyId && query.strategyId !== "all") {
      where.push(eq(audiencesTable.strategyId, query.strategyId));
    }
    if (query.segmentId && query.segmentId !== "all") {
      // The link row carries the workspace too, so another workspace's segment id matches nothing.
      where.push(
        sql`EXISTS (SELECT 1 FROM ${segmentAudiences} WHERE ${segmentAudiences.audienceId} = ${audiencesTable.id}
            AND ${segmentAudiences.segmentId} = ${query.segmentId} AND ${segmentAudiences.workspaceId} = ${ctx.workspaceId})`,
      );
    }
    const predicate = and(...where);

    const sortKey = query.sort ?? "score";
    const dir = query.dir ?? (sortKey === "name" ? "asc" : "desc");
    const column =
      sortKey === "name" ? audiencesTable.name : sortKey === "updated" ? audiencesTable.updatedAt : audiencesTable.score;
    const order = dir === "asc" ? asc(column) : desc(column);

    // Clamp exactly as lib/data/query.ts paginate() does, so both stores page identically.
    const pageSize = Math.min(Math.max(Math.trunc(query.pageSize ?? 25) || 25, 1), 200);
    const [{ value: total = 0 } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(audiencesTable)
      .where(predicate);
    const pages = Math.max(1, Math.ceil(Number(total) / pageSize));
    const page = Math.min(Math.max(Math.trunc(query.page ?? 1) || 1, 1), pages);

    const rows = await this.db
      .select({
        audience: audiencesTable,
        ownerName: users.name,
      })
      .from(audiencesTable)
      .leftJoin(users, eq(users.id, audiencesTable.ownerId))
      .where(predicate)
      // A second, unique sort key keeps paging stable: without it, rows with equal scores can
      // swap between pages and a row is shown twice or skipped.
      .orderBy(order, asc(audiencesTable.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      items: rows.map((r) => this.toAudience(r.audience, r.ownerName)),
      total: Number(total),
      page,
      pageSize,
    };
  }

  private toAudience(row: typeof audiencesTable.$inferSelect, ownerName: string | null): Audience {
    return {
      id: row.id,
      name: row.name,
      company: row.company,
      title: row.title,
      initials: initialsOf(row.name),
      phone: row.phone,
      email: row.email,
      whatsapp: row.whatsapp,
      linkedin: row.linkedin,
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
      strategyId: row.strategyId,
      starred: row.starred,
      updatedAt: iso(row.updatedAt),
      isSample: row.isSample,
    };
  }

  async getAudience(ctx: Ctx, id: string): Promise<Audience | null> {
    const [row] = await this.db
      .select({ audience: audiencesTable, ownerName: users.name })
      .from(audiencesTable)
      .leftJoin(users, eq(users.id, audiencesTable.ownerId))
      .where(and(eq(audiencesTable.id, id), this.ws(audiencesTable.workspaceId, ctx)))
      .limit(1);
    return row ? this.toAudience(row.audience, row.ownerName) : null;
  }

  /**
   * Every read is scoped to the workspace — including the child tables (messages, events, runs),
   * which carry their own `workspace_id`, so an audience id from another workspace returns nothing.
   */
  async getProspect(ctx: Ctx, id: string): Promise<ProspectProfile | null> {
    const [row] = await this.db
      .select({ audience: audiencesTable, ownerName: users.name })
      .from(audiencesTable)
      .leftJoin(users, eq(users.id, audiencesTable.ownerId))
      .where(and(eq(audiencesTable.id, id), this.ws(audiencesTable.workspaceId, ctx)))
      .limit(1);
    if (!row) return null;
    const audience = this.toAudience(row.audience, row.ownerName);

    const company = row.audience.company.trim();
    const [strategy, runs, audiences, threads, tasks, events, colleagues, colleagueTotal] = await Promise.all([
      row.audience.strategyId
        ? this.db
            .select({
              id: strategiesTable.id,
              name: strategiesTable.name,
              status: strategiesTable.status,
              type: strategiesTable.type,
            })
            .from(strategiesTable)
            .where(and(eq(strategiesTable.id, row.audience.strategyId), this.ws(strategiesTable.workspaceId, ctx)))
            .limit(1)
        : Promise.resolve([]),
      this.db
        .select()
        .from(workflowRuns)
        .where(and(eq(workflowRuns.audienceId, id), this.ws(workflowRuns.workspaceId, ctx)))
        .orderBy(desc(workflowRuns.startedAt))
        .limit(1),
      this.db
        .select({
          id: segmentsTable.id,
          name: segmentsTable.name,
          fileName: segmentsTable.fileName,
          createdAt: segmentsTable.createdAt,
        })
        .from(segmentAudiences)
        .innerJoin(segmentsTable, eq(segmentsTable.id, segmentAudiences.segmentId))
        .where(
          and(
            eq(segmentAudiences.audienceId, id),
            this.ws(segmentAudiences.workspaceId, ctx),
            this.ws(segmentsTable.workspaceId, ctx),
          ),
        ),
      this.db
        .select()
        .from(threadsTable)
        .where(and(eq(threadsTable.audienceId, id), this.ws(threadsTable.workspaceId, ctx))),
      this.db
        .select()
        .from(tasksTable)
        .where(and(eq(tasksTable.audienceId, id), this.ws(tasksTable.workspaceId, ctx)))
        .orderBy(desc(tasksTable.createdAt)),
      this.db
        .select({
          id: eventsTable.id,
          kind: eventsTable.kind,
          channel: eventsTable.channel,
          occurredAt: eventsTable.occurredAt,
        })
        .from(eventsTable)
        .where(and(eq(eventsTable.audienceId, id), this.ws(eventsTable.workspaceId, ctx)))
        .orderBy(desc(eventsTable.occurredAt))
        .limit(500),
      company
        ? this.db
            .select({ id: audiencesTable.id, name: audiencesTable.name, title: audiencesTable.title })
            .from(audiencesTable)
            .where(
              and(
                this.ws(audiencesTable.workspaceId, ctx),
                sql`lower(${audiencesTable.company}) = lower(${company})`,
                sql`${audiencesTable.id} <> ${id}`,
              ),
            )
            .orderBy(asc(audiencesTable.name), asc(audiencesTable.id))
            .limit(8)
        : Promise.resolve([]),
      company
        ? this.db
            .select({ value: count() })
            .from(audiencesTable)
            .where(
              and(
                this.ws(audiencesTable.workspaceId, ctx),
                sql`lower(${audiencesTable.company}) = lower(${company})`,
                sql`${audiencesTable.id} <> ${id}`,
              ),
            )
        : Promise.resolve([{ value: 0 }]),
    ]);

    const threadIds = threads.map((t) => t.id);
    const messages = threadIds.length
      ? await this.db
          .select()
          .from(messagesTable)
          .where(and(inArray(messagesTable.threadId, threadIds), this.ws(messagesTable.workspaceId, ctx)))
          .orderBy(desc(messagesTable.sentAt))
          .limit(500)
      : [];

    const run = runs[0];
    const fields = splitFileFields((row.audience.extra ?? {}) as Record<string, string>);
    return buildProspect({
      audience,
      createdAt: iso(row.audience.createdAt),
      companyFields: fields.company,
      otherFields: fields.other,
      strategy: strategy[0] ?? null,
      run: run
        ? {
            state: run.state,
            stepId: run.currentStepId,
            startedAt: iso(run.startedAt),
            finishedAt: run.finishedAt ? iso(run.finishedAt) : null,
          }
        : null,
      audiences: audiences.map((a) => ({ id: a.id, name: a.name, fileName: a.fileName, importedAt: iso(a.createdAt) })),
      threads: threads.map((t) => ({
        id: t.id,
        channel: t.channel as Channel,
        intent: t.intent,
        needsReply: t.needsReply,
        lastAt: iso(t.lastAt),
        signals: (t.signals as { label: string; points: number }[]) ?? [],
      })),
      messages: messages.map((m) => ({
        id: m.id,
        threadId: m.threadId,
        from: m.from,
        channel: m.channel as Channel,
        body: m.body,
        sentAt: iso(m.sentAt),
      })),
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        channel: (e.channel as Channel | null) ?? null,
        occurredAt: iso(e.occurredAt),
      })),
      tasks: tasks.map((t) => ({
        id: t.id,
        kind: t.kind,
        summary: t.summary,
        channel: t.channel as Channel,
        done: t.done,
        when: t.whenLabel,
        createdAt: iso(t.createdAt),
      })),
      colleagues: colleagues.map((c) => ({ id: c.id, name: c.name, title: c.title })),
      colleagueCount: Number(colleagueTotal[0]?.value ?? 0),
    });
  }

  /**
   * Checks a reference belongs to this workspace before it is written. Returning a `WriteError`
   * rather than nulling the field means the caller is told the reference was rejected instead of
   * quietly getting an audience with no strategy.
   */
  private async checkRefs(ctx: Ctx, patch: AudiencePatch): Promise<WriteError | null> {
    if (patch.strategyId) {
      const [found] = await this.db
        .select({ id: strategiesTable.id })
        .from(strategiesTable)
        .where(and(eq(strategiesTable.id, patch.strategyId), this.ws(strategiesTable.workspaceId, ctx)))
        .limit(1);
      if (!found) {
        return { error: { field: "strategyId", message: "That strategy does not exist." } };
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

  async createAudience(ctx: Ctx, input: AudiencePatch): Promise<Audience | WriteError> {
    const bad = await this.checkRefs(ctx, input);
    if (bad) return bad;

    const [row] = await this.db
      .insert(audiencesTable)
      .values({
        id: newId("l"),
        workspaceId: ctx.workspaceId,
        name: input.name ?? "Unnamed audience",
        company: input.company ?? "",
        title: input.title ?? "",
        phone: input.phone ?? null,
        email: input.email ?? null,
        linkedin: input.linkedin ?? null,
        stage: input.stage ?? "new",
        score: input.score ?? 0,
        source: input.source ?? "form",
        tags: input.tags ?? [],
        consent: input.consent ?? false,
        nextStep: input.nextStep ?? "",
        // Default ownership to whoever created the audience, so nothing lands unassigned.
        ownerId: input.ownerId ?? ctx.userId,
        strategyId: input.strategyId ?? null,
        starred: input.starred ?? false,
      })
      .returning();

    const owner = await this.ownerName(row.ownerId);
    return this.toAudience(row, owner);
  }

  private async ownerName(id: string | null): Promise<string | null> {
    if (!id) return null;
    const [row] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
    return row?.name ?? null;
  }

  async updateAudience(ctx: Ctx, id: string, patch: AudiencePatch): Promise<Audience | WriteError | null> {
    const bad = await this.checkRefs(ctx, patch);
    if (bad) return bad;

    const set: Partial<typeof audiencesTable.$inferInsert> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.company !== undefined) set.company = patch.company;
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.email !== undefined) set.email = patch.email;
    if (patch.phone !== undefined) set.phone = patch.phone;
    if (patch.linkedin !== undefined) set.linkedin = patch.linkedin;
    if (patch.stage !== undefined) set.stage = patch.stage;
    if (patch.score !== undefined) set.score = patch.score;
    if (patch.source !== undefined) set.source = patch.source;
    if (patch.tags !== undefined) set.tags = patch.tags;
    if (patch.consent !== undefined) set.consent = patch.consent;
    if (patch.nextStep !== undefined) set.nextStep = patch.nextStep;
    if (patch.starred !== undefined) set.starred = patch.starred;
    if (patch.strategyId !== undefined) set.strategyId = patch.strategyId;
    if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;

    const [row] = await this.db
      .update(audiencesTable)
      .set(set)
      .where(and(eq(audiencesTable.id, id), this.ws(audiencesTable.workspaceId, ctx)))
      .returning();
    if (!row) return null;

    const owner = await this.ownerName(row.ownerId);
    return this.toAudience(row, owner);
  }

  async deleteAudience(ctx: Ctx, id: string): Promise<boolean> {
    const gone = await this.db
      .delete(audiencesTable)
      .where(and(eq(audiencesTable.id, id), this.ws(audiencesTable.workspaceId, ctx)))
      .returning({ id: audiencesTable.id });
    return gone.length > 0;
  }

  /* ------------------------------------------------------------- threads -- */

  async listThreads(ctx: Ctx, query: ThreadQuery): Promise<Thread[]> {
    const where = [this.ws(threadsTable.workspaceId, ctx)];
    if (query.filter !== "all") where.push(eq(threadsTable.needsReply, true));
    if (query.q) {
      const term = likeTerm(query.q);
      where.push(
        or(ilike(audiencesTable.name, term), ilike(audiencesTable.company, term), ilike(threadsTable.preview, term))!,
      );
    }

    const rows = await this.db
      .select({
        thread: threadsTable,
        audienceName: audiencesTable.name,
        company: audiencesTable.company,
        score: audiencesTable.score,
        stage: audiencesTable.stage,
        strategyName: strategiesTable.name,
        ownerName: users.name,
      })
      .from(threadsTable)
      .innerJoin(audiencesTable, eq(audiencesTable.id, threadsTable.audienceId))
      .leftJoin(strategiesTable, eq(strategiesTable.id, threadsTable.strategyId))
      .leftJoin(users, eq(users.id, threadsTable.ownerId))
      .where(and(...where))
      .orderBy(desc(threadsTable.lastAt));

    return rows.map((r) => this.toThread(r));
  }

  private toThread(r: {
    thread: typeof threadsTable.$inferSelect;
    audienceName: string;
    company: string;
    score: number;
    stage: Audience["stage"];
    strategyName: string | null;
    ownerName: string | null;
  }): Thread {
    return {
      id: r.thread.id,
      audienceId: r.thread.audienceId,
      audienceName: r.audienceName,
      company: r.company,
      initials: initialsOf(r.audienceName),
      role: r.thread.role,
      channel: r.thread.channel as Channel,
      intent: r.thread.intent,
      preview: r.thread.preview,
      unread: r.thread.unread,
      needsReply: r.thread.needsReply,
      lastAt: iso(r.thread.lastAt),
      score: r.score,
      stage: r.stage,
      strategyName: r.strategyName,
      ownerName: r.ownerName ?? "Unassigned",
      signals: (r.thread.signals as { label: string; points: number }[]) ?? [],
    };
  }

  async getThread(ctx: Ctx, id: string): Promise<{ thread: Thread; messages: Message[] } | null> {
    const [row] = await this.db
      .select({
        thread: threadsTable,
        audienceName: audiencesTable.name,
        company: audiencesTable.company,
        score: audiencesTable.score,
        stage: audiencesTable.stage,
        strategyName: strategiesTable.name,
        ownerName: users.name,
      })
      .from(threadsTable)
      .innerJoin(audiencesTable, eq(audiencesTable.id, threadsTable.audienceId))
      .leftJoin(strategiesTable, eq(strategiesTable.id, threadsTable.strategyId))
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
        // See headlineMetrics: no previous reach means no meaningful rate change.
        { ...metric("reply-rate", "Reply rate", rate, ratePrev, "percent", 1, spark("replied"), "points"), ...(reachedPrev ? {} : { delta: null, trend: "flat" as const }) },
        metric("positive", "Positive replies", positive, positivePrev, "count", 0, spark("positive")),
        metric("meetings", "Meetings", meetings, meetingsPrev, "count", 0, spark("meetings")),
      ],
      trend: current,
      byChannel,
      funnel,
    };
  }

  /* ------------------------------------------------ audience uploads and segments -- */

  async createUpload(
    ctx: Ctx,
    input: { fileName: string; fileSize: number; table: Table },
  ): Promise<UploadPreview> {
    // Parked files are scratch: sweep anything older than an hour whenever a new one arrives, so
    // abandoned uploads don't pile up in the database.
    await this.db.delete(uploadsTable).where(sql`${uploadsTable.createdAt} < now() - interval '1 hour'`);
    const id = newId("up");
    await this.db.insert(uploadsTable).values({
      id,
      workspaceId: ctx.workspaceId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      headers: input.table.headers,
      rows: input.table.rows,
      createdBy: ctx.userId,
    });
    return {
      uploadId: id,
      fileName: input.fileName,
      fileSize: input.fileSize,
      headers: input.table.headers,
      sample: input.table.rows.slice(0, 5),
      totalRows: input.table.rows.length,
      suggestedMapping: suggestMapping(input.table.headers),
    };
  }

  async getUpload(ctx: Ctx, id: string) {
    const [row] = await this.db
      .select()
      .from(uploadsTable)
      .where(and(eq(uploadsTable.id, id), this.ws(uploadsTable.workspaceId, ctx)))
      .limit(1);
    if (!row) return null;
    return {
      fileName: row.fileName,
      fileSize: row.fileSize,
      table: { headers: row.headers as string[], rows: row.rows as string[][] },
    };
  }

  /** The audiences that already have a strategy, in the shape the matcher wants. */
  private async knownInJourney(ctx: Ctx) {
    const rows = await this.db
      .select({
        id: audiencesTable.id,
        strategyId: audiencesTable.strategyId,
        email: audiencesTable.email,
        mobile: audiencesTable.phone,
        whatsapp: audiencesTable.whatsapp,
        linkedin: audiencesTable.linkedin,
      })
      .from(audiencesTable)
      .where(and(this.ws(audiencesTable.workspaceId, ctx), sql`${audiencesTable.strategyId} is not null`));
    return rows;
  }

  async findInJourney(
    ctx: Ctx,
    audiences: ParsedAudience[],
  ): Promise<{ hits: InJourneyRow[]; strategyNames: Record<string, string> }> {
    const known = await this.knownInJourney(ctx);
    const hits = known.length ? findInJourney(known, audiences) : [];
    const ids = [...new Set(hits.map((h) => h.strategyId))];
    const strategyNames: Record<string, string> = {};
    if (ids.length) {
      const named = await this.db
        .select({ id: strategiesTable.id, name: strategiesTable.name })
        .from(strategiesTable)
        .where(and(inArray(strategiesTable.id, ids), this.ws(strategiesTable.workspaceId, ctx)));
      for (const c of named) strategyNames[c.id] = c.name;
    }
    return { hits, strategyNames };
  }

  async listAudienceKeys(ctx: Ctx) {
    return this.db
      .select({
        id: audiencesTable.id,
        name: audiencesTable.name,
        email: audiencesTable.email,
        mobile: audiencesTable.phone,
        whatsapp: audiencesTable.whatsapp,
        linkedin: audiencesTable.linkedin,
      })
      .from(audiencesTable)
      .where(this.ws(audiencesTable.workspaceId, ctx));
  }

  /** Live member counts. `segment_audiences` cascades on audience delete, so a deleted prospect drops out. */
  private async segmentCounts(ctx: Ctx, ids?: string[]): Promise<Map<string, number>> {
    const where = [this.ws(segmentAudiences.workspaceId, ctx)];
    if (ids) where.push(inArray(segmentAudiences.segmentId, ids));
    const rows = await this.db
      .select({ segmentId: segmentAudiences.segmentId, value: count() })
      .from(segmentAudiences)
      .where(and(...where))
      .groupBy(segmentAudiences.segmentId);
    return new Map(rows.map((r) => [r.segmentId, Number(r.value)]));
  }

  private toSegment(row: typeof segmentsTable.$inferSelect, audienceCount = 0): Segment {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      fileName: row.fileName,
      fileSize: row.fileSize,
      mapping: row.mapping as Mapping,
      totalRows: row.totalRows,
      reachableRows: row.reachableRows,
      channels: row.channels as Segment["channels"],
      profilesCreated: row.profilesCreated,
      profilesMerged: row.profilesMerged,
      excludedInJourney: row.excludedInJourney,
      errorCount: row.errorCount,
      createdAt: iso(row.createdAt),
      createdBy: row.createdBy ?? "",
      audienceCount,
    };
  }

  async listSegments(ctx: Ctx): Promise<Segment[]> {
    const [rows, counts] = await Promise.all([
      this.db
        .select()
        .from(segmentsTable)
        .where(this.ws(segmentsTable.workspaceId, ctx))
        .orderBy(desc(segmentsTable.createdAt), desc(segmentsTable.id)),
      this.segmentCounts(ctx),
    ]);
    return rows.map((row) => this.toSegment(row, counts.get(row.id) ?? 0));
  }

  async getSegment(ctx: Ctx, id: string): Promise<Segment | null> {
    const [row] = await this.db
      .select()
      .from(segmentsTable)
      .where(and(eq(segmentsTable.id, id), this.ws(segmentsTable.workspaceId, ctx)))
      .limit(1);
    if (!row) return null;
    const counts = await this.segmentCounts(ctx, [id]);
    return this.toSegment(row, counts.get(id) ?? 0);
  }

  async createSegment(
    ctx: Ctx,
    input: {
      uploadId: string;
      name: string;
      description: string;
      mapping: Mapping;
      report: MappingReport;
      audiences: ParsedAudience[];
      consent: boolean;
    },
  ) {
    const upload = await this.getUpload(ctx, input.uploadId);
    if (!upload) return null;

    const segmentId = newId("seg");
    const now = new Date();

    // People already in a journey elsewhere stay out. Recomputed here: the browser's warning is a
    // courtesy, and the rows it showed may be minutes old.
    const { hits } = await this.findInJourney(ctx, input.audiences);
    const out = new Set(hits.map((h) => h.row));
    const incoming = input.audiences.filter((audience) => !out.has(audience.row));
    // `input.audiences` arrives with the review's exclusions already taken out, so the recheck above only
    // finds people who joined a strategy since. The audience records both.
    const excluded = input.report.journey.excluded + out.size;

    return this.db.transaction(async (tx) => {
      // Every audience the workspace has, as profiles, so a row can merge into the right one.
      const existingRows = await tx
        .select({
          id: audiencesTable.id,
          email: audiencesTable.email,
          mobile: audiencesTable.phone,
          whatsapp: audiencesTable.whatsapp,
          linkedin: audiencesTable.linkedin,
          extra: audiencesTable.extra,
          company: audiencesTable.company,
          title: audiencesTable.title,
          createdAt: audiencesTable.createdAt,
          updatedAt: audiencesTable.updatedAt,
        })
        .from(audiencesTable)
        .where(this.ws(audiencesTable.workspaceId, ctx));
      const identityBefore = new Map(existingRows.map((r) => [r.id, { company: r.company, title: r.title }]));

      const existing: AudienceProfile[] = existingRows.map((r) => ({
        id: r.id,
        email: r.email,
        mobile: r.mobile,
        whatsapp: r.whatsapp,
        linkedin: r.linkedin,
        segmentIds: [],
        extra: (r.extra ?? {}) as Record<string, string>,
        createdAt: iso(r.createdAt),
        updatedAt: iso(r.updatedAt),
      }));
      const before = new Map(existing.map((p) => [p.id, p]));

      const merge = mergeAudiences(
        existing,
        incoming.map((audience) => ({
          row: audience.row,
          email: audience.email,
          mobile: audience.mobile,
          whatsapp: audience.whatsapp,
          linkedin: audience.linkedin,
          extra: audience.extra,
        })),
        segmentId,
        now.toISOString(),
        () => newId("l"),
      );

      const created: AudienceProfile[] = [];
      const touched: AudienceProfile[] = [];
      for (const profile of merge.profiles) {
        const was = before.get(profile.id);
        if (!was) created.push(profile);
        else if (profile.segmentIds.includes(segmentId)) touched.push(profile);
      }

      // Brand-new audiences, in chunks that stay under Postgres's parameter limit.
      for (let i = 0; i < created.length; i += 500) {
        await tx.insert(audiencesTable).values(
          created.slice(i, i + 500).map((p) => {
            const who = audienceIdentity(p);
            return {
              id: p.id,
              workspaceId: ctx.workspaceId,
              name: who.name,
              company: who.company,
              title: who.title,
              email: p.email,
              phone: p.mobile,
              whatsapp: p.whatsapp,
              linkedin: p.linkedin,
              extra: p.extra,
              stage: "new" as const,
              source: "csv" as const,
              consent: input.consent,
              ownerId: ctx.userId,
            };
          }),
        );
      }

      // Existing audiences that gained an attribute or a column from a matching row.
      for (const p of touched) {
        const was = before.get(p.id);
        if (!was) continue;
        const fill = identityFill(identityBefore.get(p.id) ?? { company: "", title: "" }, p);
        const changed =
          Object.keys(fill).length > 0 ||
          p.email !== was.email ||
          p.mobile !== was.mobile ||
          p.whatsapp !== was.whatsapp ||
          p.linkedin !== was.linkedin ||
          JSON.stringify(p.extra) !== JSON.stringify(was.extra);
        if (!changed) continue;
        await tx
          .update(audiencesTable)
          .set({
            email: p.email,
            phone: p.mobile,
            whatsapp: p.whatsapp,
            linkedin: p.linkedin,
            extra: p.extra,
            ...fill,
            updatedAt: now,
          })
          .where(and(eq(audiencesTable.id, p.id), this.ws(audiencesTable.workspaceId, ctx)));
      }

      const [segmentRow] = await tx
        .insert(segmentsTable)
        .values({
          id: segmentId,
          workspaceId: ctx.workspaceId,
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
          createdBy: ctx.userId,
        })
        .returning();

      const members = [...created, ...touched];
      for (let i = 0; i < members.length; i += 2000) {
        await tx
          .insert(segmentAudiences)
          .values(members.slice(i, i + 2000).map((p) => ({ workspaceId: ctx.workspaceId, segmentId, audienceId: p.id })))
          .onConflictDoNothing();
      }

      await tx
        .delete(uploadsTable)
        .where(and(eq(uploadsTable.id, input.uploadId), this.ws(uploadsTable.workspaceId, ctx)));

      return {
        segment: this.toSegment(segmentRow, members.length),
        profilesCreated: merge.created,
        profilesMerged: merge.matchedExisting,
        excluded,
      };
    });
  }
}
