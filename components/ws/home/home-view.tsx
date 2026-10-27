"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { INBOX_HREF, SETUP_HREF } from "@/lib/nav";
import { setupChecks, type SetupCheck } from "@/lib/data/setup";
import type { Overview, Task, TaskKind } from "@/lib/data/types";
import { CHANNEL_NAME, CHANNEL_ORDER, channelNames } from "@/lib/ws/channels";
import { metricFooter, metricValue } from "@/lib/ws/format";
import { useAsync } from "@/lib/ws/use-async";
import { cn, fmt } from "@/lib/ws/utils";
import { PageBody, PageHeader, TopBar } from "@/components/ws/shell/page";
import { useWorkspace } from "@/components/ws/shell/workspace-context";
import { DemoNote } from "@/components/ws/shell/demo-note";
import { Card, CardContent, CardDescription, CardHeader, CardScroll, CardTitle, FILL } from "@/components/ws/ui/card";
import { Button, buttonVariants } from "@/components/ws/ui/button";
import { Segmented } from "@/components/ws/ui/segmented";
import { StrategyStatusPill } from "@/components/ws/ui/status-pill";
import { Appear, Row } from "@/components/ws/ui/motion";
import {
  ChannelChip,
  EmptyState,
  Initials,
  LoadError,
  Meter,
  MetricTile,
  Skeleton,
} from "@/components/ws/ui/misc";

type Filter = "all" | TaskKind;

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  call: "Calls",
  reply: "Replies",
  review: "Review",
};

/** Time of day, in the workspace's own timezone. */
function greeting(timeZone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hour12: false }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Home — the screen an operator opens each morning. In order: is anything
 * waiting on me, is sending healthy, is anything broken?
 */
export function HomeView() {
  const { user, refreshBadges } = useWorkspace();
  const [hello, setHello] = useState("Hello");
  const [filter, setFilter] = useState<Filter>("all");
  const [done, setDone] = useState<string[]>([]);

  // Computed after mount: the server has no business guessing the viewer's clock.
  useEffect(() => setHello(greeting(user.timeZone)), [user.timeZone]);

  const overview = useAsync<Overview>(() => api.overview("7d"), []);
  const accounts = useAsync(() => api.accounts(), []);

  const data = overview.data;
  const tasks = useMemo(() => (data?.tasks ?? []).filter((t) => !done.includes(t.id)), [data, done]);
  const shown = filter === "all" ? tasks : tasks.filter((t) => t.kind === filter);
  const countOf = (f: Filter) => (f === "all" ? tasks.length : tasks.filter((t) => t.kind === f).length);

  const live = (data?.strategies ?? []).filter((s) => s.status === "live");
  const replies = data?.metrics.find((m) => m.id === "replies");
  const meetings = data?.metrics.find((m) => m.id === "meetings");

  async function complete(task: Task) {
    setDone((ids) => [...ids, task.id]); // optimistic: the row is gone the moment it is clicked
    try {
      await api.completeTask(task.id);
      refreshBadges();
    } catch {
      setDone((ids) => ids.filter((id) => id !== task.id));
    }
  }

  return (
    <>
      <TopBar title="Home" />
      <PageBody>
        <Appear>
          <PageHeader
            title={
              <>
                {hello}, <span className="font-normal italic text-muted-foreground">{user.name.split(" ")[0]}.</span>
              </>
            }
            subtitle={
              data
                ? `${fmt(replies?.value ?? 0)} ${replies?.value === 1 ? "reply" : "replies"} and ${fmt(meetings?.value ?? 0)} ${meetings?.value === 1 ? "meeting" : "meetings"} in the last 7 days across ${live.length} live ${live.length === 1 ? "strategy" : "strategies"}.`
                : "Reading the last seven days."
            }
          />
        </Appear>

        <DemoNote />

        {/* KPIs */}
        <Appear index={1}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {overview.state === "ready"
              ? overview.data.metrics.map((m) => (
                  <MetricTile
                    key={m.id}
                    label={m.label}
                    value={metricValue(m)}
                    footer={metricFooter(m, "7d")}
                    series={m.spark}
                  />
                ))
              : [0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 pb-[10px] pt-3">
                    <Skeleton className="h-[11px] w-[64px]" />
                    <Skeleton className="h-[32px] w-[92px]" />
                    <Skeleton className="h-[11px] w-[108px]" />
                  </div>
                ))}
          </div>
        </Appear>

        <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:grid-rows-1">
          <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
            <Appear index={2} className={FILL}>
              <Card className={FILL}>
                <CardHeader>
                  <div className="flex items-baseline gap-[9px]">
                    <CardTitle>To do</CardTitle>
                    <CardDescription>needs a person</CardDescription>
                  </div>
                  <Segmented<Filter>
                    label="Filter the to-do list"
                    value={filter}
                    onChange={setFilter}
                    options={(["all", "call", "reply", "review"] as Filter[]).map((f) => ({
                      value: f,
                      label: FILTER_LABEL[f],
                      count: countOf(f),
                    }))}
                  />
                </CardHeader>

                {overview.state === "loading" ? (
                  <RowSkeletons n={4} />
                ) : overview.state === "failed" ? (
                  <LoadError message="We couldn't load what's waiting on you." onRetry={overview.reload} />
                ) : shown.length === 0 ? (
                  <EmptyState>
                    Nothing waiting on you here. Replies and calls that need a person show up in this list.
                  </EmptyState>
                ) : (
                  <CardScroll>
                  <ul>
                    <AnimatePresence initial={false}>
                      {shown.map((t) => (
                        <Row
                          key={t.id}
                          className="flex items-center gap-[13px] border-b border-divider px-4 py-[9px]"
                        >
                          <Initials text={t.initials} />
                          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                            <span className="truncate text-[12.5px] font-medium">
                              {t.audienceName}
                              {t.company ? ` · ${t.company}` : ""}
                            </span>
                            <span className="truncate text-[11.5px] text-muted-foreground">{t.summary}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-[10px]">
                            <ChannelChip>{CHANNEL_NAME[t.channel]}</ChannelChip>
                            <span className="w-[52px] text-right font-mono text-[11px] text-muted-foreground">
                              {t.when}
                            </span>
                            {t.kind === "reply" ? (
                              <Link href={INBOX_HREF} className={buttonVariants({ variant: "outline", size: "sm" })}>
                                Reply
                              </Link>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => void complete(t)}>
                                Mark done
                              </Button>
                            )}
                          </span>
                        </Row>
                      ))}
                    </AnimatePresence>
                  </ul>
                  </CardScroll>
                )}

                <div className="border-t border-divider px-4 py-2">
                  <Link href={INBOX_HREF} className="text-[12px] font-medium hover:underline">
                    Open inbox
                  </Link>
                </div>
              </Card>
            </Appear>

            <Appear index={3}>
              <Card>
                <CardHeader>
                  <CardTitle>Sending today</CardTitle>
                  <span className="font-mono text-[11px] text-muted-foreground">Resets at midnight</span>
                </CardHeader>
                <CardContent className="pb-[10px] pt-[2px]">
                  {overview.state === "ready" ? (
                    CHANNEL_ORDER.map((channel) => {
                      const quota = overview.data.quotas.find((q) => q.channel === channel);
                      const label = !quota || quota.cap === 0 ? "Not connected" : `${fmt(quota.used)} / ${fmt(quota.cap)}`;
                      const pct = quota && quota.cap > 0 ? (quota.used / quota.cap) * 100 : 0;
                      return (
                        <div
                          key={channel}
                          className="flex items-center gap-[14px] border-b border-divider py-[8px] last:border-b-0"
                        >
                          <span className="shrink-0 basis-[92px] text-[12px]">{CHANNEL_NAME[channel]}</span>
                          <Meter pct={pct} label={`${CHANNEL_NAME[channel]}: ${label}`} className="flex-1" />
                          <span className="shrink-0 basis-[108px] text-right font-mono text-[11.5px] text-body">
                            {label}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <RowSkeletons n={5} bare />
                  )}
                  <p className="mt-3 text-[11.5px] text-muted-foreground">
                    Limits come from your connected accounts and are shared by every strategy.{" "}
                    <Link href={SETUP_HREF} className="font-medium text-foreground hover:underline">
                      See connected accounts
                    </Link>
                  </p>
                </CardContent>
              </Card>
            </Appear>
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
            <Appear index={4} className={FILL}>
              <Card className={FILL}>
                <CardHeader>
                  <CardTitle>Strategies</CardTitle>
                  <Link href="/dashboard/strategies" className="text-[12px] font-medium hover:underline">
                    See all
                  </Link>
                </CardHeader>
                {overview.state === "loading" ? (
                  <RowSkeletons n={3} />
                ) : overview.state === "failed" ? (
                  <LoadError message="We couldn't load your strategies." onRetry={overview.reload} />
                ) : overview.data.strategies.length === 0 ? (
                  <EmptyState>Nothing is running yet.</EmptyState>
                ) : (
                  <CardScroll>
                  <ul>
                    {overview.data.strategies.slice(0, 6).map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 border-b border-divider px-4 py-[9px] last:border-b-0"
                      >
                        <span className="flex min-w-0 flex-col gap-[3px]">
                          <span className={cn("truncate text-[12.5px] font-medium", s.isSample && "text-body")}>
                            {s.name}
                          </span>
                          <span className="truncate font-mono text-[11px] text-muted-foreground">
                            {channelNames(s.channels)}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-[10px]">
                          <span className="font-mono text-[11.5px] font-medium">
                            {s.replyRate === null ? "—" : `${s.replyRate.toFixed(1)}%`}
                          </span>
                          <StrategyStatusPill status={s.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                  </CardScroll>
                )}
              </Card>
            </Appear>

            <Appear index={5}>
              <SetupHealth
                checks={accounts.state === "ready" ? setupChecks(accounts.data) : null}
                failed={accounts.state === "failed"}
                onRetry={accounts.reload}
              />
            </Appear>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function RowSkeletons({ n, bare }: { n: number; bare?: boolean }) {
  return (
    <div className={bare ? undefined : "px-4"}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-divider py-[10px] last:border-b-0">
          <Skeleton className="size-[30px] rounded-full" />
          <Skeleton className="h-[12px] flex-1" />
          <Skeleton className="h-[12px] w-[52px]" />
        </div>
      ))}
    </div>
  );
}

/** Setup health is computed from the workspace's own accounts, never typed in. */
function SetupHealth({
  checks,
  failed,
  onRetry,
}: {
  checks: SetupCheck[] | null;
  failed: boolean;
  onRetry: () => void;
}) {
  const total = checks?.length ?? 0;
  const passing = checks?.filter((c) => c.tone === "ok").length ?? 0;
  const issues = checks?.filter((c) => c.tone !== "ok") ?? [];
  const score = total ? Math.round((passing / total) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup health</CardTitle>
        {checks ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {passing} / {total} checks
          </span>
        ) : null}
      </CardHeader>

      {failed ? (
        <LoadError message="We couldn't read your connected accounts." onRetry={onRetry} />
      ) : !checks ? (
        <div className="flex flex-col gap-3 px-4 py-4">
          <Skeleton className="h-[30px] w-[88px]" />
          <Skeleton className="h-[6px] w-full rounded-none" />
        </div>
      ) : (
        <>
          <div className="px-4 pb-[4px] pt-3">
            <div className="mb-[10px] flex items-baseline gap-[10px]">
              <span className="font-mono text-[22px] font-bold leading-none tracking-[-0.02em]">{score}%</span>
              <span className="text-[11.5px] text-muted-foreground">
                {issues.length === 0
                  ? "Everything we can check is in order"
                  : `${issues.length} ${issues.length === 1 ? "thing needs" : "things need"} you`}
              </span>
            </div>
            <Meter pct={score} label={`${passing} of ${total} setup checks passing`} />
          </div>
          <ul className="flex flex-col gap-[2px] px-4 pb-3 pt-2 lg:max-h-[170px] lg:overflow-y-auto">
            {issues.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={`${SETUP_HREF}${issue.goes ? `?tab=${issue.goes}` : ""}`}
                  className="-mx-[10px] flex items-center gap-[10px] rounded-lg p-[10px] transition-colors hover:bg-accent"
                >
                  <TriangleAlert
                    aria-hidden
                    className={cn("size-[15px] shrink-0", issue.tone === "bad" ? "text-destructive" : "text-warning")}
                    strokeWidth={1.9}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="text-[12px] font-medium">{issue.title}</span>
                    <span className="text-[11.5px] text-muted-foreground">{issue.detail}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-[15px] shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
