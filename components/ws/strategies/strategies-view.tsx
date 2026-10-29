"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Pause, Pencil, Plus, Rocket, Trash2 } from "lucide-react";
import { api, fieldErrorsOf } from "@/lib/api";
import { LIVE_SEND_NOTE } from "@/lib/capabilities";
import type { Strategy, StrategyStatus } from "@/lib/data/types";
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
 */
const COLS = "grid-cols-[minmax(230px,2.2fr)_100px_84px_104px_80px_90px_84px_84px_176px]";
const HEADS = ["Strategy", "Status", "Audiences", "Touchpoints", "Sent", "Delivered", "Open rate", "Reply rate", "Actions"];

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
  const totals = list.data?.totals;
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
        }, () => undefined),
      10_000,
    );
    return () => window.clearInterval(timer);
  }, [live, reload, reloadJourneys]);

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

        <Appear index={1}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {list.state === "ready" && totals ? (
              <>
                <MetricTile
                  label="Running now"
                  value={fmt(live)}
                  footer={scheduled ? `${scheduled} scheduled to start` : "Nothing scheduled"}
                />
                <MetricTile label="Audiences" value={fmt(totals.audiences)} footer="Across every strategy" />
                <MetricTile label="Delivered · 7 days" value={fmt(totals.delivered)} footer="Messages that landed" />
                <MetricTile label="Reply rate" value={rate(totals.replyRate)} footer="Across every strategy" />
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
                  {HEADS.map((h, i) => (
                    <span key={h} className={cn("label-mono text-[10.5px] tracking-[0.07em]", i >= 2 && "text-right")}>
                      {h}
                    </span>
                  ))}
                </div>

                {list.state === "loading" ? (
                  Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={cn("grid items-center gap-3 border-b border-divider px-4 py-[10px]", COLS)}>
                      <Skeleton className="h-[12px] w-[70%]" />
                      {HEADS.slice(1).map((h) => (
                        <Skeleton key={h} className="h-[12px]" />
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
                    <div key={s.id} className={cn("grid items-center gap-3 border-b border-divider px-4 py-[9px]", COLS)}>
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
                      <span className="flex items-center justify-end gap-1">
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
                              onClick={() => setLaunching(s)}
                            >
                              <Rocket aria-hidden strokeWidth={1.9} />
                              {busy === s.id ? "Starting…" : s.status === "paused" ? "Resume" : "Launch"}
                            </Button>
                          )
                        ) : null}
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
          </>
        }
        confirmLabel={launching?.status === "paused" ? "Resume it" : "Launch it"}
        busy={busy === launching?.id}
        onCancel={() => setLaunching(null)}
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
