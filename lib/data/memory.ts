/**
 * In-memory implementation of `Repository`, backed by the demo seed.
 *
 * It deliberately does the same filtering, sorting and paging work a database would, through the
 * shared helpers in lib/data/query.ts, so swapping in a real store cannot change behaviour.
 * Writes (completing a task, pausing a strategy, sending a reply) mutate module state: they last
 * until the server restarts, which is all a prototype needs.
 */

import {
  deltaPercent,
  matchesFacet,
  matchesText,
  paginate,
  rangeDays,
  rollupWindows,
  sortBy,
  sumOf,
  trendOf,
  type RollupRow,
} from "@/lib/data/query";
import {
  ACCOUNTS,
  CAMPAIGNS,
  DEMO_USER,
  DOMAINS,
  LEADS,
  MESSAGES,
  QUOTAS,
  ROLLUPS,
  TASKS,
  TEAM,
  THREADS,
  WORKSPACE,
} from "@/lib/data/seed";
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
import { AUDIENCE_CAMPAIGN, AUDIENCE_WORKSPACE, graphFromTemplate, type WorkflowGraph } from "@/lib/app/workflow";
import { runStep } from "@/lib/engine/steps";
import { journeyRows } from "@/lib/engine/journey";
import { SENDING_ENABLED } from "@/lib/capabilities";
import { defaultWorkspaceSettings } from "@/lib/app/configuration";
import type { AccountSettingsPatch, StrategyPatch, AudiencePatch } from "@/lib/data/validate";
import { findInJourney, mergeAudiences, type InJourneyRow, type AudienceProfile } from "@/lib/audiences/merge";
import { identityFill, audienceIdentity, splitFileFields } from "@/lib/audiences/profile";
import { buildProspect } from "@/lib/audiences/prospect";
import { blockingCount, setupChecks } from "@/lib/data/setup";
import type { MappingReport, Segment, UploadPreview } from "@/lib/audiences/segments";
import { suggestMapping, type Mapping, type ParsedAudience } from "@/lib/audiences/validation";
import type { Table } from "@/lib/audiences/table";
import type {
  AccountActivity,
  AccountsSnapshot,
  Analytics,
  Badges,
  Strategy,
  StrategyStatus,
  LaunchResult,
  Journeys,
  JourneyStrategy,
  RunActivity,
  RunSummary,
  Channel,
  ChannelAccount,
  ChannelBreakdown,
  ConnectSession,
  FunnelStage,
  Audience,
  AudienceQuery,
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
 * route handler separately, so a module-level array is a different copy in `/api/audiences` than in
 * `/api/audiences/[id]`: an upload parked by one route was "no longer available" in the next, and a
 * starred audience looked unstarred in the list. One process, one store — the same fix as the cached
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
 * every other write in this store. Uploaded rows merge into `audienceRows`, the same audience list the
 * Audiences screen shows, so memory mode behaves like the database.
 */
const uploads = shared("uploads", () => new Map<string, { fileName: string; fileSize: number; table: Table; at: number }>());
const segments = shared<Segment[]>("segments", () => []);
const segmentMembers = shared("segmentMembers", () => new Map<string, Set<string>>());
/** What the `Audience` shape has no field for: the kept file columns and the creation time. Seed audiences
 *  have neither, so their profiles say so rather than invent one. */
const audienceExtra = shared("audienceExtra", () => new Map<string, Record<string, string>>());
const audienceCreatedAt = shared("audienceCreatedAt", () => new Map<string, string>());
const seq = shared("seq", () => ({ segment: 1, upload: 1 }));

/** Parsed files are scratch space; drop anything older than an hour. */
function sweepUploads() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, upload] of uploads) if (upload.at < cutoff) uploads.delete(id);
}

// Mutable copies, so prototype writes are visible on the next read.
const strategies = shared<Strategy[]>("strategies", () => CAMPAIGNS.map((c) => ({ ...c })));
const messages = shared<Message[]>("messages", () => MESSAGES.map((m) => ({ ...m })));
const threads = shared<Thread[]>("threads", () => THREADS.map((t) => ({ ...t })));
const audienceRows = shared<Audience[]>("audienceRows", () => LEADS.map((l) => ({ ...l })));
const rollups = shared<RollupRow[]>("rollups", () => ROLLUPS.map((r) => ({ ...r })));
const accounts = shared<ChannelAccount[]>("accounts", () => ACCOUNTS.map((a) => structuredClone(a)));
const domains = shared("domains", () => DOMAINS.map((d) => ({ ...d })));

/** The demo workspace's Configuration settings (Variables, Sending rules, Compliance). Module
 * state like everything else here: a save lasts until the server restarts. */
const settings = shared("settings", () => ({ row: defaultWorkspaceSettings() as WorkspaceSettings }));

/** Monotonic ids for prototype creates, so two audiences made in the same millisecond differ. */
/** Workflows saved in this process, by strategy id. Seed strategies fall back to the demo graphs. */
const workflowRows = shared("workflowRows", () => new Map<string, WorkflowRecord>());

/** The dry-run engine's state: one run per audience per strategy, its queued steps, and its log. */
type MemRun = { id: string; strategyId: string; audienceId: string; state: "active" | "completed" | "stopped" };
type MemJob = { id: string; runId: string; stepId: string; runAt: number; done: boolean };
const runs = shared<MemRun[]>("runs", () => []);
const jobs = shared<MemJob[]>("jobs", () => []);
const runLog = shared<(RunActivity & { strategyId: string; audienceId: string; step: string })[]>("runLog", () => []);

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

const tasks = shared<Task[]>("tasks", () => TASKS.map((t) => ({ ...t })));

/** The window ending today and the one before it, read off the funnel rows like the SQL store does. */
function windows(days: number, channels: Channel[] | null = null) {
  const { current, previous } = rollupWindows(rollups, days, channels);
  return { current, previous, sum: sumOf };
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
  const active = audienceRows.filter((l) => l.stage !== "closed").length;
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
    // No earlier reach means no meaningful change in rate; comparing with 0 would read as a gain.
    { ...metric("reply-rate", "Reply rate", rate, ratePrev, "percent", 1, spark("replied"), "points"), ...(reachedPrev ? {} : { delta: null, trend: "flat" as const }) },
    metric("active-audiences", "Active audiences", active, active, "count", 0, spark("engaged")),
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
    return {
      ...WORKSPACE,
      quotas: QUOTAS.map((q) => ({ ...q })),
      sample: {
        strategies: strategies.filter((c) => c.isSample).length,
        audiences: audienceRows.filter((l) => l.isSample).length,
      },
    };
  }

  async getOverview(ctx: Ctx, range: RangeKey): Promise<Overview> {
    const [user, open, live] = await Promise.all([
      this.getUser(ctx),
      this.listTasks(ctx, { kind: "all" }),
      this.listStrategies(ctx, { status: "live" }),
    ]);
    return {
      user,
      metrics: headlineMetrics(range),
      tasks: open,
      strategies: live.items.slice(0, 5),
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

  async listStrategies(
    _ctx: Ctx,
    query: StrategyQuery,
  ): Promise<{ items: Strategy[]; totals: StrategyTotals }> {
    const items = strategies.filter(
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
    const mean = (rows: Strategy[], key: "openRate" | "replyRate") =>
      rows.length
        ? Number((rows.reduce((sum, c) => sum + (c[key] ?? 0), 0) / rows.length).toFixed(1))
        : null;

    return {
      items: items.map((c) => this.withMembers(c)),
      totals: {
        audiences: items.reduce((sum, c) => sum + c.audiences, 0),
        delivered: delivered || sent,
        openRate: mean(withOpen, "openRate"),
        replyRate: mean(withReply, "replyRate"),
      },
    };
  }

  async getStrategy(_ctx: Ctx, id: string): Promise<Strategy | null> {
    const found = strategies.find((c) => c.id === id);
    return found ? this.withMembers(found) : null;
  }

  /** The demo strategy keeps its stored figure; every real one reports who is actually in it. */
  private withMembers(strategy: Strategy): Strategy {
    return strategy.isSample ? { ...strategy } : { ...strategy, audiences: audienceRows.filter((a) => a.strategyId === strategy.id).length };
  }

  async createStrategy(_ctx: Ctx, input: StrategyPatch): Promise<Strategy> {
    const row: Strategy = {
      id: `c_${nextId("strategy")}`,
      name: input.name ?? "Untitled strategy",
      status: input.status ?? "draft",
      type: input.type ?? "standalone",
      channels: input.channels ?? [],
      version: input.type === "multichannel" ? "v1" : null,
      startedAt: input.startedAt ?? new Date().toISOString(),
      audiences: 0,
      sent: null,
      delivered: null,
      openRate: null,
      replyRate: null,
      clicks: null,
    };
    strategies.unshift(row);
    return { ...row };
  }

  async updateStrategy(_ctx: Ctx, id: string, patch: StrategyPatch): Promise<Strategy | null> {
    const found = strategies.find((c) => c.id === id);
    if (!found) return null;
    if (patch.name !== undefined) found.name = patch.name;
    if (patch.status !== undefined) found.status = patch.status;
    if (patch.type !== undefined) found.type = patch.type;
    if (patch.channels !== undefined) found.channels = patch.channels;
    if (patch.startedAt !== undefined && patch.startedAt !== null) found.startedAt = patch.startedAt;
    return { ...found };
  }

  async deleteStrategy(_ctx: Ctx, id: string): Promise<boolean> {
    const at = strategies.findIndex((c) => c.id === id);
    if (at < 0) return false;
    strategies.splice(at, 1);
    workflowRows.delete(id);
    // Mirror the database's ON DELETE SET NULL so an audience never points at a strategy that is gone.
    for (const audience of audienceRows) if (audience.strategyId === id) audience.strategyId = null;
    return true;
  }

  async setStrategyStatus(_ctx: Ctx, id: string, status: StrategyStatus): Promise<Strategy | null> {
    const found = strategies.find((c) => c.id === id);
    if (!found) return null;
    found.status = status;
    return { ...found };
  }

  /* ----------------------------------------------------------- workflows -- */

  async getWorkflow(_ctx: Ctx, strategyId: string): Promise<WorkflowRecord | null> {
    const saved = workflowRows.get(strategyId);
    if (saved) return structuredClone(saved);
    // The demo strategy has no saved graph until someone edits it: it starts from the same outbound
    // template a database workspace's sample strategy is seeded with, reading the strategy's own audiences.
    const strategy = strategies.find((c) => c.id === strategyId);
    if (!strategy || !strategy.isSample) return null;
    return {
      strategyId,
      name: strategy.name,
      graph: graphFromTemplate("outbound", AUDIENCE_CAMPAIGN),
      updatedAt: strategy.startedAt,
    };
  }

  async listWorkflows(ctx: Ctx): Promise<WorkflowRecord[]> {
    const out: WorkflowRecord[] = [];
    for (const c of strategies) {
      if (c.type !== "multichannel") continue;
      const found = await this.getWorkflow(ctx, c.id);
      if (found) out.push(found);
    }
    return out;
  }

  async saveWorkflow(
    _ctx: Ctx,
    strategyId: string,
    input: { name: string; graph: WorkflowGraph },
  ): Promise<WorkflowRecord | WriteError | null> {
    const strategy = strategies.find((c) => c.id === strategyId);
    if (!strategy) return null;
    if (strategy.type !== "multichannel") {
      return { error: { field: "strategy", message: "Only multichannel strategies have a workflow." } };
    }
    strategy.name = input.name;
    const record: WorkflowRecord = {
      strategyId,
      name: input.name,
      graph: structuredClone(input.graph),
      updatedAt: new Date().toISOString(),
    };
    workflowRows.set(strategyId, record);
    return structuredClone(record);
  }


  /* ------------------------------------------------------------------ engine -- */

  async launchStrategy(ctx: Ctx, id: string): Promise<LaunchResult | WriteError | null> {
    const refuse = (message: string): WriteError => ({ error: { field: "strategy", message } });
    const strategy = strategies.find((c) => c.id === id);
    if (!strategy) return null;
    if (strategy.isSample) {
      return refuse("The demo strategy is an example and can't be launched. Make your own strategy to run a plan.");
    }
    if (strategy.type !== "multichannel") return refuse("Only a strategy with a workflow can be launched.");

    const flow = await this.getWorkflow(ctx, id);
    if (!flow) return refuse("Save the plan before launching it.");
    const root = flow.graph.nodes.find((n) => n.kind === "audience");
    if (!root || flow.graph.nodes.length < 2) return refuse("Add at least one step before launching.");

    const list = String(root.data.list ?? AUDIENCE_CAMPAIGN);
    const candidates =
      list === AUDIENCE_CAMPAIGN
        ? audienceRows.filter((a) => a.strategyId === id)
        : list === AUDIENCE_WORKSPACE
          ? audienceRows
          : audienceRows.filter((a) => segmentMembers.get(list)?.has(a.id));
    const mine = candidates.filter((a) => !a.strategyId || a.strategyId === id);
    const inOtherStrategy = candidates.length - mine.length;
    const eligible = mine.filter((a) => a.consent);
    const withoutConsent = mine.length - eligible.length;

    let enrolled = 0;
    const now = Date.now();
    for (const a of eligible) {
      if (runs.some((r) => r.strategyId === id && r.audienceId === a.id)) continue;
      const run: MemRun = { id: nextId("run"), strategyId: id, audienceId: a.id, state: "active" };
      runs.push(run);
      jobs.push({ id: nextId("job"), runId: run.id, stepId: root.id, runAt: now, done: false });
      a.strategyId = id;
      enrolled += 1;
    }
    if (!runs.some((r) => r.strategyId === id)) {
      return refuse(
        candidates.length === 0
          ? "There is nobody in this plan's audience yet. Choose an audience with leads in it on the first step."
          : "Nobody in this plan's audience can be enrolled: they are in another strategy, or no consent is recorded.",
      );
    }
    if (strategy.status === "draft") strategy.startedAt = new Date().toISOString();
    strategy.status = "live";
    return {
      strategy: structuredClone(strategy),
      enrolled,
      alreadyIn: eligible.length - enrolled,
      inOtherStrategy,
      withoutConsent,
    };
  }

  async runDueSteps(ctx: Ctx, limit = 300): Promise<{ processed: number }> {
    let processed = 0;
    while (processed < limit) {
      const job = jobs.find((j) => {
        if (j.done || j.runAt > Date.now()) return false;
        const run = runs.find((r) => r.id === j.runId);
        return run?.state === "active" && strategies.find((s) => s.id === run.strategyId)?.status === "live";
      });
      if (!job) break;
      const run = runs.find((r) => r.id === job.runId)!;
      const person = audienceRows.find((a) => a.id === run.audienceId);
      const flow = await this.getWorkflow(ctx, run.strategyId);
      const result =
        person && flow
          ? runStep({
              nodes: flow.graph.nodes,
              edges: flow.graph.edges,
              stepId: job.stepId,
              audience: { id: person.id, name: person.name, company: person.company, score: person.score },
              now: Date.now(),
            })
          : { effects: [], next: null, finish: "stopped" as const };

      for (const effect of result.effects) {
        if (effect.type === "log") {
          runLog.unshift({
            at: new Date().toISOString(),
            text: effect.text,
            audienceName: person?.name ?? "",
            channel: effect.channel,
            strategyId: run.strategyId,
            audienceId: run.audienceId,
            step: effect.step,
          });
        } else if (person) {
          tasks.unshift({
            id: `t_${nextId("task")}`,
            kind: "call",
            audienceId: person.id,
            audienceName: person.name,
            company: person.company,
            initials: person.initials,
            score: person.score,
            summary: effect.summary,
            when: "Today",
            channel: "call",
            done: false,
          });
        }
      }
      job.done = true;
      if (result.next) {
        jobs.push({ id: nextId("job"), runId: run.id, stepId: result.next.stepId, runAt: result.next.runAt, done: false });
      }
      if (result.finish) run.state = result.finish;
      processed += 1;
    }

    for (const s of strategies) {
      const mineRuns = runs.filter((r) => r.strategyId === s.id);
      if (s.status === "live" && mineRuns.length > 0 && mineRuns.every((r) => r.state !== "active")) s.status = "completed";
    }
    return { processed };
  }

  async runSummary(_ctx: Ctx, id: string): Promise<RunSummary | null> {
    if (!strategies.some((s) => s.id === id)) return null;
    const mine = runs.filter((r) => r.strategyId === id);
    const pending = jobs.filter((j) => !j.done && mine.some((r) => r.id === j.runId && r.state === "active"));
    const next = pending.reduce<number | null>((min, j) => (min === null || j.runAt < min ? j.runAt : min), null);
    return {
      enrolled: mine.length,
      active: mine.filter((r) => r.state === "active").length,
      completed: mine.filter((r) => r.state === "completed").length,
      stopped: mine.filter((r) => r.state === "stopped").length,
      waiting: pending.filter((j) => j.runAt > Date.now()).length,
      nextDueAt: next === null ? null : new Date(next).toISOString(),
      recent: runLog.filter((l) => l.strategyId === id).slice(0, 8).map((l) => ({ at: l.at, text: l.text, audienceName: l.audienceName, channel: l.channel })),
    };
  }

  async getJourneys(ctx: Ctx, range: RangeKey): Promise<Journeys> {
    const days = rangeDays(range);
    const launched = strategies.filter((s) => runs.some((r) => r.strategyId === s.id));
    const out: JourneyStrategy[] = [];
    for (const s of launched) {
      const flow = await this.getWorkflow(ctx, s.id);
      if (!flow) continue;
      const mine = runs.filter((r) => r.strategyId === s.id);
      const log = runLog.filter((l) => l.strategyId === s.id);
      const reachedBy = new Map<string, number>();
      for (const step of new Set(log.map((l) => l.step))) {
        reachedBy.set(step, new Set(log.filter((l) => l.step === step).map((l) => l.audienceId)).size);
      }
      const hereBy = new Map<string, number>();
      for (const j of jobs) {
        const run = mine.find((r) => r.id === j.runId);
        if (!j.done && run?.state === "active") hereBy.set(j.stepId, (hereBy.get(j.stepId) ?? 0) + 1);
      }
      out.push({
        id: s.id,
        name: s.name,
        status: s.status,
        enrolled: mine.length,
        active: mine.filter((r) => r.state === "active").length,
        completed: mine.filter((r) => r.state === "completed").length,
        stopped: mine.filter((r) => r.state === "stopped").length,
        touchpoints: log.filter((l) => l.channel !== null).length,
        steps: journeyRows(flow.graph.nodes, flow.graph.edges, reachedBy, hereBy, mine.length) as JourneyStrategy["steps"],
      });
    }

    const day = (d: Date) => d.toISOString().slice(0, 10);
    const axis = Array.from({ length: days }, (_, i) => day(new Date(Date.now() - (days - 1 - i) * 86_400_000)));
    const touches = runLog.filter((l) => l.channel !== null && day(new Date(l.at)) >= axis[0]);
    const perChannel = new Map<Channel, number>();
    for (const t of touches) perChannel.set(t.channel as Channel, (perChannel.get(t.channel as Channel) ?? 0) + 1);
    return {
      strategies: out,
      touchpoints: {
        total: touches.length,
        byChannel: [...perChannel].map(([channel, count]) => ({ channel, count })).sort((x, y) => y.count - x.count),
        byDay: axis.map((date) => ({ date, count: touches.filter((t) => day(new Date(t.at)) === date).length })),
      },
      dryRun: !SENDING_ENABLED,
    };
  }

  /** The demo workspace is born with its demo strategy and nothing removes it. */
  async ensureDemo(_ctx: Ctx): Promise<void> {}

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

  async setAccountStrategies(_ctx: Ctx, id: string, strategyIds: string[]): Promise<ChannelAccount | WriteError | null> {
    const found = accounts.find((a) => a.id === id);
    if (!found) return null;
    if (strategyIds.some((cid) => !strategies.some((c) => c.id === cid))) {
      return { error: { field: "strategyIds", message: "One of those strategies doesn't exist." } };
    }
    found.strategyIds = [...strategyIds];
    return this.account(found);
  }

  async getBadges(ctx: Ctx): Promise<Badges> {
    return {
      tasks: tasks.filter((t) => !t.done).length,
      inbox: threads.filter((t) => t.needsReply).length,
      config: blockingCount(setupChecks(await this.listAccounts(ctx))),
    };
  }

  async listAudiences(_ctx: Ctx, query: AudienceQuery): Promise<Paged<Audience>> {
    const segmentIds =
      query.segmentId && query.segmentId !== "all" ? (segmentMembers.get(query.segmentId) ?? new Set<string>()) : null;
    const filtered = audienceRows.filter(
      (audience) =>
        matchesText([audience.name, audience.company, audience.title, audience.email ?? "", ...audience.tags], query.q) &&
        matchesFacet(audience.stage, query.stage) &&
        matchesFacet(audience.ownerId, query.ownerId) &&
        matchesFacet(audience.strategyId, query.strategyId) &&
        (!segmentIds || segmentIds.has(audience.id)),
    );
    const key = query.sort ?? "score";
    const dir = query.dir ?? (key === "name" ? "asc" : "desc");
    const sorted = sortBy(
      filtered,
      (audience) => (key === "name" ? audience.name : key === "updated" ? audience.updatedAt : audience.score),
      dir,
    );
    const page = paginate(sorted, query.page, query.pageSize);
    return { ...page, items: page.items.map((audience) => ({ ...audience })) };
  }

  async getAudience(_ctx: Ctx, id: string): Promise<Audience | null> {
    const found = audienceRows.find((audience) => audience.id === id);
    return found ? { ...found } : null;
  }

  async getProspect(_ctx: Ctx, id: string): Promise<ProspectProfile | null> {
    const audience = audienceRows.find((l) => l.id === id);
    if (!audience) return null;

    const strategy = audience.strategyId ? strategies.find((c) => c.id === audience.strategyId) : undefined;
    const own = threads.filter((t) => t.audienceId === id);
    const ownIds = new Set(own.map((t) => t.id));
    const company = audience.company.trim().toLowerCase();
    const colleagues = company
      ? audienceRows.filter((l) => l.id !== id && l.company.trim().toLowerCase() === company)
      : [];
    const fields = splitFileFields(audienceExtra.get(id) ?? {});

    return buildProspect({
      audience: { ...audience },
      createdAt: audienceCreatedAt.get(id) ?? null,
      companyFields: fields.company,
      otherFields: fields.other,
      strategy: strategy ? { id: strategy.id, name: strategy.name, status: strategy.status, type: strategy.type } : null,
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
        .filter((t) => t.audienceId === id)
        .map((t) => ({ id: t.id, kind: t.kind, summary: t.summary, channel: t.channel, done: t.done, when: t.when, createdAt: null })),
      colleagues: sortBy(colleagues, (l) => l.name, "asc")
        .slice(0, 8)
        .map((l) => ({ id: l.id, name: l.name, title: l.title })),
      colleagueCount: colleagues.length,
    });
  }

  async createAudience(_ctx: Ctx, input: AudiencePatch): Promise<Audience | WriteError> {
    if (input.strategyId && !strategies.some((c) => c.id === input.strategyId)) {
      return { error: { field: "strategyId", message: "That strategy does not exist." } };
    }
    const name = input.name ?? "Unnamed audience";
    const owner = TEAM.find((m) => m.id === input.ownerId) ?? TEAM[0];
    const row: Audience = {
      id: `l_${nextId("audience")}`,
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
      strategyId: input.strategyId ?? null,
      starred: input.starred ?? false,
      updatedAt: new Date().toISOString(),
    };
    audienceRows.unshift(row);
    audienceCreatedAt.set(row.id, row.updatedAt);
    return { ...row };
  }

  async updateAudience(_ctx: Ctx, id: string, patch: AudiencePatch): Promise<Audience | WriteError | null> {
    const found = audienceRows.find((audience) => audience.id === id);
    if (!found) return null;
    if (patch.strategyId && !strategies.some((c) => c.id === patch.strategyId)) {
      return { error: { field: "strategyId", message: "That strategy does not exist." } };
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
    if (patch.strategyId !== undefined) found.strategyId = patch.strategyId;
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

  async deleteAudience(_ctx: Ctx, id: string): Promise<boolean> {
    const at = audienceRows.findIndex((audience) => audience.id === id);
    if (at < 0) return false;
    audienceRows.splice(at, 1);
    // Mirrors the database's cascade: a deleted prospect leaves every audience.
    for (const members of segmentMembers.values()) members.delete(id);
    audienceExtra.delete(id);
    audienceCreatedAt.delete(id);
    return true;
  }

  async listThreads(_ctx: Ctx, query: ThreadQuery): Promise<Thread[]> {
    const items = threads.filter(
      (t) =>
        matchesText([t.audienceName, t.company, t.preview], query.q) &&
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
    const { current, previous, sum } = windows(days, channels);
    const { rows } = rollupWindows(rollups, days, channels);
    const cutoff = current[0]?.date ?? "";

    const reached = sum(current, "reached");
    const reachedPrev = sum(previous, "reached");
    const replied = sum(current, "replied");
    const repliedPrev = sum(previous, "replied");
    const positive = sum(current, "positive");
    const positivePrev = sum(previous, "positive");
    const meetings = sum(current, "meetings");
    const meetingsPrev = sum(previous, "meetings");
    const engaged = sum(current, "engaged");
    const rate = reached ? Number(((replied / reached) * 100).toFixed(1)) : 0;
    const ratePrev = reachedPrev ? Number(((repliedPrev / reachedPrev) * 100).toFixed(1)) : 0;
    const spark = (key: keyof Omit<TrendPoint, "date">) => current.slice(-14).map((row) => row[key]);

    // Real per-channel grouping from the funnel rows, the way the SQL store does it.
    const picked: Channel[] = channels && channels.length ? channels : ["linkedin", "email", "whatsapp", "call", "sms"];
    const byChannel: ChannelBreakdown[] = picked.map((channel) => {
      const inWindow = rows.filter((r) => r.channel === channel && r.day >= cutoff);
      return {
        channel,
        reached: inWindow.reduce((total, r) => total + r.reached, 0),
        replies: inWindow.reduce((total, r) => total + r.replied, 0),
        meetings: inWindow.reduce((total, r) => total + r.meetings, 0),
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
        { ...metric("reply-rate", "Reply rate", rate, ratePrev, "percent", 1, spark("replied"), "points"), ...(reachedPrev ? {} : { delta: null, trend: "flat" as const }) },
        metric("positive", "Positive replies", positive, positivePrev, "count", 0, spark("positive")),
        metric("meetings", "Meetings", meetings, meetingsPrev, "count", 0, spark("meetings")),
      ],
      trend: current,
      byChannel,
      funnel,
    };
  }

  /* ---- audience uploads and segments ---------------------------------------- */

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
    audiences: ParsedAudience[],
  ): Promise<{ hits: InJourneyRow[]; strategyNames: Record<string, string> }> {
    const known = audienceRows.map((l) => ({
      id: l.id,
      strategyId: l.strategyId,
      email: l.email,
      mobile: l.phone,
      whatsapp: l.whatsapp ?? null,
      linkedin: l.linkedin ?? null,
    }));
    const hits = findInJourney(known, audiences);
    const strategyNames: Record<string, string> = {};
    for (const hit of hits) {
      const strategy = strategies.find((c) => c.id === hit.strategyId);
      if (strategy) strategyNames[strategy.id] = strategy.name;
    }
    return { hits, strategyNames };
  }

  async listAudienceKeys(_ctx: Ctx) {
    return audienceRows.map((l) => ({
      id: l.id,
      name: l.name,
      email: l.email,
      mobile: l.phone,
      whatsapp: l.whatsapp ?? null,
      linkedin: l.linkedin ?? null,
    }));
  }

  /** Counted against the live audience list, so a prospect removed by any path drops out. */
  private withCount(segment: Segment): Segment {
    const members = segmentMembers.get(segment.id);
    const audienceCount = members ? audienceRows.filter((l) => members.has(l.id)).length : 0;
    return { ...segment, audienceCount };
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
      audiences: ParsedAudience[];
      consent: boolean;
    },
  ) {
    const upload = uploads.get(input.uploadId);
    if (!upload) return null;

    const id = "seg_" + seq.segment++;
    const now = new Date().toISOString();
    const { hits } = await this.findInJourney(ctx, input.audiences);
    const out = new Set(hits.map((h) => h.row));
    const incoming = input.audiences.filter((audience) => !out.has(audience.row));
    // The review already took its exclusions out of `input.audiences`; record those plus any found now.
    const excluded = input.report.journey.excluded + out.size;

    const existing: AudienceProfile[] = audienceRows.map((l) => ({
      id: l.id,
      email: l.email,
      mobile: l.phone,
      whatsapp: l.whatsapp ?? null,
      linkedin: l.linkedin ?? null,
      segmentIds: [],
      extra: { ...(audienceExtra.get(l.id) ?? {}) },
      createdAt: l.updatedAt,
      updatedAt: l.updatedAt,
    }));
    const known = new Set(existing.map((p) => p.id));
    const merge = mergeAudiences(
      existing,
      incoming.map((audience) => ({ row: audience.row, email: audience.email, mobile: audience.mobile, whatsapp: audience.whatsapp, linkedin: audience.linkedin, extra: audience.extra })),
      id,
      now,
      () => "l_" + nextId("audience"),
    );

    const members = new Set<string>();
    for (const profile of merge.profiles) {
      if (!known.has(profile.id)) {
        const who = audienceIdentity(profile);
        audienceRows.push({
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
          strategyId: null,
          starred: false,
          updatedAt: now,
        });
        audienceExtra.set(profile.id, profile.extra);
        audienceCreatedAt.set(profile.id, now);
        members.add(profile.id);
      } else if (profile.segmentIds.includes(id)) {
        const audience = audienceRows.find((l) => l.id === profile.id);
        if (audience) {
          Object.assign(audience, identityFill(audience, profile));
          audience.email = profile.email;
          audience.phone = profile.mobile;
          audience.whatsapp = profile.whatsapp;
          audience.linkedin = profile.linkedin;
          audience.updatedAt = now;
          audienceExtra.set(profile.id, profile.extra);
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
      audienceCount: members.size,
    };
    segments.push(segment);
    segmentMembers.set(id, members);
    uploads.delete(input.uploadId);

    return { segment: { ...segment }, profilesCreated: merge.created, profilesMerged: merge.matchedExisting, excluded };
  }
}
