"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Strategy, StrategyStatus } from "@/lib/data/types";
import { CHANNEL_NAME, CHANNEL_ORDER, channelNames } from "@/lib/ws/channels";
import { whenLabel } from "@/lib/ws/format";
import { useAsync } from "@/lib/ws/use-async";
import { cn, fmt } from "@/lib/ws/utils";
import { PageBody, PageHeader, TopBar } from "@/components/ws/shell/page";
import { Card } from "@/components/ws/ui/card";
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
];

/**
 * Columns. Fixed widths for the numbers and the actions so every row lines up
 * no matter how long a strategy's name is; the table scrolls sideways rather
 * than squeezing them.
 */
const COLS = "grid-cols-[minmax(260px,2.4fr)_110px_90px_90px_96px_96px_96px_112px]";
const HEADS = ["Strategy", "Status", "Audiences", "Sent", "Delivered", "Open rate", "Reply rate", "Actions"];

/** Numbers a strategy has not produced yet read "—", never a fabricated 0. */
const num = (v: number | null) => (v === null ? "—" : fmt(v));
const rate = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);

export function StrategiesView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Strategy | null>(null);

  const list = useAsync(() => api.strategies(), []);
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

  async function toggle(s: Strategy) {
    setBusy(s.id);
    try {
      await api.setStrategyStatus(s.id, s.status === "live" ? "paused" : "live");
      list.reload();
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
              list.state === "ready"
                ? `A strategy is an audience plus the sequence that reaches it. ${live === 0 ? "None are running right now." : `${live} ${live === 1 ? "is" : "are"} running right now.`}`
                : "A strategy is an audience plus the sequence that reaches it."
            }
            actions={
              <Link href="/dashboard/strategies/new" className={buttonVariants({ size: "lg" })}>
                <Plus aria-hidden strokeWidth={2} />
                New strategy
              </Link>
            }
          />
        </Appear>

        <Appear index={1}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
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
                <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-card px-[18px] pb-[14px] pt-[16px]">
                  <Skeleton className="h-[11px] w-[70px]" />
                  <Skeleton className="h-[32px] w-[90px]" />
                  <Skeleton className="h-[11px] w-[110px]" />
                </div>
              ))
            )}
          </div>
        </Appear>

        <Appear index={2}>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[18px] py-[14px]">
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

            <div className="overflow-x-auto">
              <div className="min-w-[940px]">
                <div className={cn("grid gap-3 border-b border-border bg-chrome px-[18px] py-[10px]", COLS)}>
                  {HEADS.map((h, i) => (
                    <span key={h} className={cn("label-mono text-[10.5px] tracking-[0.07em]", i >= 2 && "text-right")}>
                      {h}
                    </span>
                  ))}
                </div>

                {list.state === "loading" ? (
                  Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={cn("grid items-center gap-3 border-b border-divider px-[18px] py-[15px]", COLS)}>
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
                    <div key={s.id} className={cn("grid items-center gap-3 border-b border-divider px-[18px] py-[13px]", COLS)}>
                      <span className="flex min-w-0 flex-col gap-[3px]">
                        <span className={cn("truncate text-[13.5px] font-medium", s.isSample && "text-body")}>
                          {s.name}
                          {s.isSample ? <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">Sample</span> : null}
                        </span>
                        <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                          {channelNames(s.channels)} · {whenLabel(s.status, s.startedAt)}
                        </span>
                      </span>
                      <span>
                        <StrategyStatusPill status={s.status} />
                      </span>
                      <span className="text-right font-mono text-[12.5px]">{fmt(s.audiences)}</span>
                      <span className="text-right font-mono text-[12.5px]">{num(s.sent)}</span>
                      <span className="text-right font-mono text-[12.5px]">{num(s.delivered)}</span>
                      <span className="text-right font-mono text-[12.5px]">{rate(s.openRate)}</span>
                      <span className="text-right font-mono text-[12.5px] font-medium">{rate(s.replyRate)}</span>
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
                        {s.status === "live" || s.status === "paused" ? (
                          <Button
                            variant="outline"
                            size="icon-sm"
                            disabled={busy === s.id}
                            aria-label={s.status === "live" ? `Pause ${s.name}` : `Resume ${s.name}`}
                            onClick={() => void toggle(s)}
                          >
                            {s.status === "live" ? <Pause aria-hidden strokeWidth={1.9} /> : <Play aria-hidden strokeWidth={1.9} />}
                          </Button>
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

            <div className="flex flex-wrap items-center justify-between gap-[10px] px-[18px] py-3">
              <span className="text-[12.5px] text-muted-foreground">
                {rows.length} of {all.length} strategies
              </span>
              <span className="text-[12.5px] text-muted-foreground">
                A lead is only ever in one strategy, so a new one skips anyone already in another.
              </span>
            </div>
          </Card>
        </Appear>
      </PageBody>

      <Confirm
        open={confirming !== null}
        title={`Delete ${confirming?.name ?? ""}?`}
        body={
          <>
            The strategy and its plan are removed. The {fmt(confirming?.audiences ?? 0)} leads in it stay in your
            audiences — they are released from this strategy and can be added to another. Nothing further would have
            been sent to them anyway, because nothing sends yet.
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
