"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Copy, Pause, Pencil, Plus, Rocket, Trash2 } from "lucide-react";
import { api, fieldErrorsOf } from "@/lib/api";
import { LIVE_SEND_NOTE } from "@/lib/capabilities";
import type { RunSummary, Strategy, StrategyStatus } from "@/lib/data/types";
import { blankCopySteps } from "@/lib/app/workflow";
import { CHANNEL_NAME, CHANNEL_ORDER, channelNames } from "@/lib/ws/channels";
import { whenLabel } from "@/lib/ws/format";
import { useAsync } from "@/lib/ws/use-async";
import { cn, fmt } from "@/lib/ws/utils";
import { PageBody, PageHeader, TopBar } from "@/components/ws/shell/page";
import { Card, FILL } from "@/components/ws/ui/card";
import { Button, buttonVariants } from "@/components/ws/ui/button";
import { Confirm } from "@/components/ws/ui/confirm";
import { Segmented } from "@/components/ws/ui/segmented";
import { StrategyStatusPill } from "@/components/ws/ui/status-pill";
import { Appear } from "@/components/ws/ui/motion";
import { DemoNote } from "@/components/ws/shell/demo-note";
import { EmptyState, LoadError, MetricTile, NativeSelect, SearchInput, Skeleton } from "@/components/ws/ui/misc";

type Filter = "all" | StrategyStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "scheduled", label: "Scheduled" },
  { value: "draft", label: "Draft" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Finished" },
];

/**
 * Columns. Fixed widths for the numbers and the actions so every row lines up
 * no matter how long a strategy's name is; the table scrolls sideways rather
 * than squeezing them.
 *
 * **The actions come second, not last.** The table is wider than the frame at every width the
 * workspace supports, so it scrolls sideways — and with the actions on the right, Launch and Pause
 * were the first things to go off the edge, which reads as "there is no Launch button". A sticky
 * column cannot fix that: a grid item is confined to its own grid area, so `sticky right-0` on the
 * last cell does not move. Putting the actions where the scroll never reaches does fix it, and the
 * metrics — which are the part you scroll to read — go to the right of them.
 */
const COLS = "grid-cols-[minmax(230px,2.2fr)_224px_100px_84px_104px_80px_90px_84px_84px]";
/** Column headings, in the order `COLS` lays them out. Only the figures are right-aligned. */
const HEADS: { label: string; right?: boolean }[] = [
  { label: "Strategy" },
  { label: "Actions" },
  { label: "Status" },
  { label: "Audiences", right: true },
  { label: "Touchpoints", right: true },
  { label: "Sent", right: true },
  { label: "Delivered", right: true },
  { label: "Open rate", right: true },
  { label: "Reply rate", right: true },
];

/** Numbers a strategy has not produced yet read "—", never a fabricated 0. */
const num = (v: number | null) => (v === null ? "—" : fmt(v));
const rate = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);

export function StrategiesView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Strategy | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [launched, setLaunched] = useState<string | null>(null);
  const [launching, setLaunching] = useState<Strategy | null>(null);
  /** What the plan about to be launched has left blank, read from the plan itself. */
  const [blank, setBlank] = useState<string[] | null>(null);
  /** Which row has its activity open, and what the server last said about it. */
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, RunSummary | "failed">>({});

  const list = useAsync(() => api.strategies(), []);
  // Where each launched strategy's audiences are, and how many touchpoints have gone out.
  const journeys = useAsync(() => api.journeys({ range: "90d" }), []);
  const journeyOf = useMemo(
    () => new Map((journeys.data?.journeys.strategies ?? []).map((j) => [j.id, j])),
    [journeys.data],
  );
  const all = useMemo(() => list.data?.items ?? [], [list.data]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (s) =>
        (filter === "all" || s.status === filter) &&
        (channel === "all" || s.channels.includes(channel as Strategy["channels"][number])) &&
        (!needle || s.name.toLowerCase().includes(needle)),
    );
  }, [all, filter, channel, q]);

  const count = (f: Filter) => (f === "all" ? all.length : all.filter((s) => s.status === f).length);

  /**
   * The tiles describe **the strategies on screen**, not the workspace.
   *
   * They used to read the server's workspace-wide `totals`, which sums every strategy including
   * the sample one — so a workspace with a single real strategy that had sent nothing showed "401
   * delivered · 7.1% reply rate", entirely the demo's invented figures, right above a row reading
   * "—". Summing the filtered rows means the Live tab describes what is live, and a strategy that
   * has produced nothing reads "—" rather than a borrowed number.
   */
  const shown = useMemo(() => {
    const audiences = rows.reduce((sum, s) => sum + s.audiences, 0);
    const withSent = rows.filter((s) => s.sent !== null || s.delivered !== null);
    const delivered = withSent.length
      ? withSent.reduce((sum, s) => sum + (s.delivered ?? s.sent ?? 0), 0)
      : null;
    const replied = rows.filter((s) => s.replyRate !== null);
    const replyRate = replied.length
      ? Number((replied.reduce((sum, s) => sum + (s.replyRate ?? 0), 0) / replied.length).toFixed(1))
      : null;
    return { audiences, delivered, replyRate, sample: rows.some((s) => s.isSample) };
  }, [rows]);

  /** What the tiles are counting, in words, so a filtered number is never mistaken for the whole. */
  const scope =
    rows.length === 0
      ? "Nothing shown"
      : rows.length === all.length
        ? `Across all ${all.length} ${all.length === 1 ? "strategy" : "strategies"}`
        : rows.length === 1
          ? `In ${rows[0].name}`
          : `Across the ${rows.length} shown`;
  const live = all.filter((s) => s.status === "live").length;
  const scheduled = all.filter((s) => s.status === "scheduled").length;

  // A running strategy moves while this screen is open: run what has come due, then re-read.
  const reload = list.reload;
  const reloadJourneys = journeys.reload;
  useEffect(() => {
    if (live === 0) return;
    const timer = window.setInterval(
      () =>
        void api.runEngine().then(() => {
          reload();
          reloadJourneys();
          if (openRun) void loadRun(openRun);
        }, () => undefined),
      10_000,
    );
    return () => window.clearInterval(timer);
  }, [live, reload, reloadJourneys, openRun]);

  /** What the plan has actually done, as the server records it. */
  async function loadRun(id: string) {
    try {
      const { summary } = await api.strategyRuns(id);
      setRuns((current) => ({ ...current, [id]: summary }));
    } catch {
      setRuns((current) => ({ ...current, [id]: "failed" }));
    }
  }

  function toggleRun(id: string) {
    const next = openRun === id ? null : id;
    setOpenRun(next);
    if (next) void loadRun(next);
  }

  /**
   * Opens the launch confirmation, having first read the plan it is about to run.
   *
   * A step with nothing written in it still sends — an invite with an empty note goes out as a bare
   * connection request — so the question is asked while it can still be answered, not logged after
   * the fact.
   */
  function askToLaunch(s: Strategy) {
    setLaunching(s);
    setBlank(null);
    void api
      .workflow(s.id)
      .then(({ workflow }) => setBlank(blankCopySteps(workflow.graph).map((step) => step.label)))
      .catch(() => setBlank([]));
  }

  /** Pausing is a status change; starting or resuming is a launch, which enrols the audience and queues the steps. */
  async function toggle(s: Strategy) {
    setBusy(s.id);
    setProblem(null);
    setLaunched(null);
    try {
      if (s.status === "live") {
        await api.setStrategyStatus(s.id, "paused");
      } else {
        setLaunching(null);
        const { launch } = await api.launchStrategy(s.id);
        const skipped = launch.inOtherStrategy + launch.withoutConsent;
        setLaunched(
          `${launch.strategy.name} is live: ${launch.enrolled} ${launch.enrolled === 1 ? "lead" : "leads"} in the plan${skipped ? `, ${skipped} skipped (already in another strategy, or no consent recorded)` : ""}. The first step goes out within a minute.`,
        );
        // It is running now, so show it where running strategies are.
        setFilter("live");
      }
      list.reload();
      journeys.reload();
    } catch (caught) {
      const fields = fieldErrorsOf(caught);
      setProblem(fields ? Object.values(fields)[0] : "That couldn't be changed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  /** A copy is only a copy if the plan comes with it, so the workflow is copied too. */
  async function duplicate(s: Strategy) {
    setBusy(s.id);
    try {
      const { strategy } = await api.createStrategy({
        name: `${s.name} (copy)`,
        status: "draft",
        type: s.type,
        channels: s.channels,
      });
      if (s.type === "multichannel") {
        const { workflow } = await api.workflow(s.id);
        await api.saveWorkflow(strategy.id, { name: strategy.name, graph: workflow.graph });
      }
      list.reload();
    } finally {
      setBusy(null);
    }
  }

  async function remove(s: Strategy) {
    setBusy(s.id);
    try {
      await api.deleteStrategy(s.id);
      setConfirming(null);
      list.reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <TopBar title="Strategies" />
      <PageBody>
        <Appear>
          <PageHeader
            title="Strategies"
            subtitle={
              list.state === "ready" && live > 0
                ? `${live} running right now.`
                : "An audience plus the sequence that reaches it."
            }
            actions={
              <Link href="/dashboard/strategies/new" className={buttonVariants()}>
                <Plus aria-hidden strokeWidth={2} />
                New strategy
              </Link>
            }
          />
        </Appear>

        {launched ? (
          <p role="status" className="rounded-[10px] border border-border bg-card px-[14px] py-[9px] text-[12px] text-body">
            {launched}
          </p>
        ) : null}

        {problem ? (
          <p role="alert" className="rounded-[10px] border border-warning-border bg-warning-bg px-[14px] py-[9px] text-[12px] text-warning">
            {problem}
          </p>
        ) : null}

        {shown.sample ? (
          <Appear index={1}>
            <DemoNote />
          </Appear>
        ) : null}

        <Appear index={1}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {list.state === "ready" ? (
              <>
                <MetricTile
                  label="Running now"
                  value={fmt(live)}
                  footer={scheduled ? `${scheduled} scheduled to start` : "Nothing scheduled"}
                />
                <MetricTile label="Audiences" value={fmt(shown.audiences)} footer={scope} />
                <MetricTile label="Delivered" value={num(shown.delivered)} footer={scope} />
                <MetricTile label="Reply rate" value={rate(shown.replyRate)} footer={scope} />
              </>
            ) : (
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 pb-[10px] pt-3">
                  <Skeleton className="h-[11px] w-[70px]" />
                  <Skeleton className="h-[32px] w-[90px]" />
                  <Skeleton className="h-[11px] w-[110px]" />
                </div>
              ))
            )}
          </div>
        </Appear>

        <Appear index={2} className={FILL}>
          <Card className={FILL}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-[10px]">
              <Segmented<Filter>
                label="Filter by status"
                value={filter}
                onChange={setFilter}
                options={FILTERS.map((f) => ({ ...f, count: count(f.value) }))}
              />
              <div className="flex flex-wrap items-center gap-2">
                <SearchInput
                  id="strategy-search"
                  placeholder="Search strategies"
                  value={q}
                  onChange={setQ}
                  className="w-[220px]"
                />
                <NativeSelect
                  id="strategy-channel"
                  label="Channel"
                  hideLabel
                  value={channel}
                  onChange={setChannel}
                  options={[
                    { value: "all", label: "All channels" },
                    ...CHANNEL_ORDER.map((c) => ({ value: c, label: CHANNEL_NAME[c] })),
                  ]}
                />
              </div>
            </div>

            <div className="overflow-x-auto lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <div className="min-w-[1120px]">
                <div className={cn("sticky top-0 z-[1] grid gap-3 border-b border-border bg-chrome px-4 py-[7px]", COLS)}>
                  {HEADS.map((h) => (
                    <span
                      key={h.label}
                      className={cn("label-mono text-[10.5px] tracking-[0.07em]", h.right && "text-right")}
                    >
                      {h.label}
                    </span>
                  ))}
                </div>

                {list.state === "loading" ? (
                  Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={cn("grid items-center gap-3 border-b border-divider px-4 py-[10px]", COLS)}>
                      <Skeleton className="h-[12px] w-[70%]" />
                      {HEADS.slice(1).map((h) => (
                        <Skeleton key={h.label} className="h-[12px]" />
                      ))}
                    </div>
                  ))
                ) : list.state === "failed" ? (
                  <LoadError message="We couldn't load your strategies." onRetry={list.reload} />
                ) : rows.length === 0 ? (
                  <EmptyState>
                    {all.length === 0
                      ? "No strategies yet. New strategy starts one."
                      : `No ${filter === "all" ? "matching" : filter} strategies.`}
                  </EmptyState>
                ) : (
                  rows.map((s) => (
                    <div key={s.id} className="border-b border-divider">
                    <div className={cn("grid items-center gap-3 px-4 py-[9px]", COLS)}>
                      <span className="flex min-w-0 flex-col gap-[3px]">
                        <span className={cn("truncate text-[12.5px] font-medium", s.isSample && "text-body")}>
                          {s.name}
                          {s.isSample ? <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">Sample</span> : null}
                        </span>
                        <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                          {channelNames(s.channels)} · {whenLabel(s.status, s.startedAt)}
                        </span>
                        {journeyOf.has(s.id) ? (
                          <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                            {journeyOf.get(s.id)!.active} in journey · {journeyOf.get(s.id)!.completed + journeyOf.get(s.id)!.stopped} finished
  
                          </span>
                        ) : null}
                      </span>
                      <span className="flex items-center gap-1">
                        {s.type === "multichannel" ? (
                          <Link
                            href={`/dashboard/workflows/${s.id}`}
                            aria-label={`Edit ${s.name}`}
                            className={buttonVariants({ variant: "outline", size: "icon-sm" })}
                          >
                            <Pencil aria-hidden strokeWidth={1.8} />
                          </Link>
                        ) : null}
                        {s.type === "multichannel" && !s.isSample && s.status !== "completed" ? (
                          s.status === "live" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy === s.id}
                              aria-label={`Pause ${s.name}`}
                              onClick={() => void toggle(s)}
                            >
                              <Pause aria-hidden strokeWidth={1.9} />
                              Pause
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={busy === s.id}
                              title={LIVE_SEND_NOTE}
                              aria-label={`${s.status === "paused" ? "Resume" : "Launch"} ${s.name}`}
                              onClick={() => askToLaunch(s)}
                            >
                              <Rocket aria-hidden strokeWidth={1.9} />
                              {busy === s.id ? "Starting…" : s.status === "paused" ? "Resume" : "Launch"}
                            </Button>
                          )
                        ) : null}
                        {s.type !== "multichannel" ? (
                          <span className="font-mono text-[10.5px] text-muted-foreground">No plan</span>
                        ) : (
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-expanded={openRun === s.id}
                            aria-label={`What ${s.name} is doing`}
                            onClick={() => toggleRun(s.id)}
                          >
                            <ChevronDown
                              aria-hidden
                              strokeWidth={1.9}
                              className={cn("transition-transform", openRun === s.id && "rotate-180")}
                            />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="icon-sm"
                          disabled={busy === s.id}
                          aria-label={`Duplicate ${s.name}`}
                          onClick={() => void duplicate(s)}
                        >
                          <Copy aria-hidden strokeWidth={1.8} />
                        </Button>
                        <Button variant="danger" size="icon-sm" aria-label={`Delete ${s.name}`} onClick={() => setConfirming(s)}>
                          <Trash2 aria-hidden strokeWidth={1.8} />
                        </Button>
                      </span>
                      <span>
                        <StrategyStatusPill status={s.status} />
                      </span>
                      <span className="text-right font-mono text-[11.5px]">{fmt(s.audiences)}</span>
                      <span className="text-right font-mono text-[11.5px]">
                        {journeyOf.has(s.id) ? fmt(journeyOf.get(s.id)!.touchpoints) : "—"}
                      </span>
                      <span className="text-right font-mono text-[11.5px]">{num(s.sent)}</span>
                      <span className="text-right font-mono text-[11.5px]">{num(s.delivered)}</span>
                      <span className="text-right font-mono text-[11.5px]">{rate(s.openRate)}</span>
                      <span className="text-right font-mono text-[11.5px] font-medium">{rate(s.replyRate)}</span>
                    </div>
                    {openRun === s.id ? <Activity summary={runs[s.id]} /> : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-[10px] border-t border-divider px-4 py-2">
              <span className="text-[11.5px] text-muted-foreground">
                {rows.length} of {all.length} strategies
              </span>
              <span className="text-[11.5px] text-muted-foreground">
                A lead is only ever in one strategy.
              </span>
            </div>
          </Card>
        </Appear>
      </PageBody>

      <Confirm
        open={launching !== null}
        title={`${launching?.status === "paused" ? "Resume" : "Launch"} ${launching?.name ?? ""}?`}
        body={
          <>
            This starts the plan for real. {LIVE_SEND_NOTE} Only leads with consent recorded, and who
            are not already in another strategy, are enrolled; your account&rsquo;s daily limits and the
            plan&rsquo;s sending window still apply, and you can pause it at any time.
            {blank && blank.length > 0 ? (
              <>
                {" "}
                <strong className="font-semibold">
                  This plan has nothing written in {blank.join(", ")}.
                </strong>{" "}
                A connection request with no note goes out bare, and a sent invitation cannot be taken
                back — write the copy in the builder first if that is not what you meant.
              </>
            ) : null}
          </>
        }
        confirmLabel={launching?.status === "paused" ? "Resume it" : "Launch it"}
        busy={busy === launching?.id}
        onCancel={() => {
          setLaunching(null);
          setBlank(null);
        }}
        onConfirm={() => launching && void toggle(launching)}
      />

      <Confirm
        open={confirming !== null}
        title={`Delete ${confirming?.name ?? ""}?`}
        body={
          <>
            The strategy and its plan are removed. The {fmt(confirming?.audiences ?? 0)} leads in it stay in your
            audiences, released from this strategy and free to join another. Anything already sent stays sent.
          </>
        }
        confirmLabel="Delete it"
        busy={busy === confirming?.id}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && void remove(confirming)}
      />
    </>
  );
}

/** A moment a person reads, in their own zone: "Mon 09:30" for soon, with the date when it is not. */
function clock(iso: string): string {
  const at = new Date(iso);
  const sameDay = at.toDateString() === new Date().toDateString();
  return at.toLocaleString(undefined, {
    ...(sameDay ? {} : { weekday: "short", day: "numeric", month: "short" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * What a launched plan has actually done — the panel that answers "it says live, so why has
 * nothing gone out?".
 *
 * Every refusal the runner makes is written down with its reason (no consent recorded, outside the
 * account's hours, today's cap spent, no healthy account), and until now those lines were only
 * visible inside the builder. They belong here, next to the Launch button that started it: a plan
 * that is quiet because it is waiting for Monday morning looks exactly like a plan that is broken,
 * and the difference is one sentence the server already knows.
 */
function Activity({ summary }: { summary: RunSummary | "failed" | undefined }) {
  if (summary === undefined) {
    return (
      <div className="flex flex-col gap-2 bg-chrome px-4 py-3">
        <Skeleton className="h-[12px] w-[40%]" />
        <Skeleton className="h-[12px] w-[70%]" />
      </div>
    );
  }
  if (summary === "failed") {
    return (
      <p className="bg-chrome px-4 py-3 text-[11.5px] text-muted-foreground">
        We couldn&rsquo;t read what this plan is doing. Close this and open it again.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-[9px] bg-chrome px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="label-mono">What this plan is doing</h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {fmt(summary.active)} in the plan · {fmt(summary.waiting)} waiting ·{" "}
          {fmt(summary.completed + summary.stopped)} finished
        </span>
        {summary.nextDueAt ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            next step {clock(summary.nextDueAt)}
          </span>
        ) : null}
      </div>

      {summary.recent.length ? (
        <ul className="flex flex-col gap-[5px]">
          {summary.recent.map((line, i) => (
            <li key={`${line.at}-${i}`} className="flex gap-[9px] text-[11.5px] leading-[1.5] text-body">
              <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{clock(line.at)}</span>
              <span className="min-w-0">{line.text}</span>
            </li>
          ))}
        </ul>
      ) : summary.enrolled === 0 ? (
        <p className="text-[11.5px] leading-[1.55] text-muted-foreground">
          Nobody is in this plan. Launch enrols the leads its first step points at — the ones with consent
          recorded who are not already in another strategy.
        </p>
      ) : (
        <p className="text-[11.5px] text-muted-foreground">Nothing has run yet.</p>
      )}
    </div>
  );
}
