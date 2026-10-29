"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { RangeKey } from "@/lib/data/types";
import { CHANNEL_NAME } from "@/lib/ws/channels";
import { metricFooter, metricValue } from "@/lib/ws/format";
import { useAsync } from "@/lib/ws/use-async";
import { fmt } from "@/lib/ws/utils";
import { PageBody, PageHeader, TopBar } from "@/components/ws/shell/page";
import { DemoNote } from "@/components/ws/shell/demo-note";
import { Card, CardContent, CardHeader, CardTitle, FILL } from "@/components/ws/ui/card";
import { Segmented } from "@/components/ws/ui/segmented";
import { Appear } from "@/components/ws/ui/motion";
import { EmptyState, LoadError, Meter, MetricTile, Skeleton } from "@/components/ws/ui/misc";
import { AreaChart, BarRows } from "./charts";
import { JourneysPanel } from "./journeys-panel";

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

/** Analytics — the same figures as Home, over a longer window and broken down. */
type Tab = "results" | "journeys";

export function AnalyticsView() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [tab, setTab] = useState<Tab>("results");
  const report = useAsync(() => api.analytics({ range }), [range]);
  const journeys = useAsync(() => api.journeys({ range }), [range]);

  // Open on the journeys the first time one exists: that is what a launch changes.
  const chosen = useRef(false);
  const launched = journeys.state === "ready" ? journeys.data.journeys.strategies : null;
  useEffect(() => {
    if (launched && launched.length > 0 && !chosen.current) {
      chosen.current = true;
      setTab("journeys");
    }
  }, [launched]);

  // A running strategy moves while this screen is open: run what has come due, then re-read.
  const running = launched?.some((s) => s.status === "live") ?? false;
  const reloadJourneys = journeys.reload;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void api.runEngine().then(reloadJourneys, () => undefined), 10_000);
    return () => window.clearInterval(timer);
  }, [running, reloadJourneys]);

  return (
    <>
      <TopBar title="Analytics" />
      <PageBody>
        <Appear>
          <PageHeader
            title="Analytics"
            subtitle={
              tab === "results"
                ? "What has been recorded: people reached, replies, meetings. Nothing here is projected."
                : "Where launched strategies' audiences are in their plans, and every touchpoint made."
            }
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Segmented<Tab>
                  label="Analytics view"
                  value={tab}
                  onChange={(next) => {
                    chosen.current = true;
                    setTab(next);
                  }}
                  options={[
                    { value: "results", label: "Results" },
                    { value: "journeys", label: "Journeys", count: launched?.length },
                  ]}
                />
                <Segmented<RangeKey> label="Date range" value={range} onChange={setRange} options={RANGES} />
              </div>
            }
          />
        </Appear>

        {tab === "journeys" ? (
          journeys.state === "ready" ? (
            <JourneysPanel data={journeys.data.journeys} range={range} />
          ) : journeys.state === "failed" ? (
            <Card>
              <LoadError message="We couldn't load your journeys." onRetry={journeys.reload} />
            </Card>
          ) : (
            <Skeleton className="h-[92px] rounded-xl" />
          )
        ) : null}

        {tab === "results" ? <DemoNote /> : null}

        {tab === "results" ? (
        <Appear index={1}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {report.state === "ready"
              ? report.data.metrics.map((m) => (
                  <MetricTile
                    key={m.id}
                    label={m.label}
                    value={metricValue(m)}
                    footer={metricFooter(m, range)}
                    series={m.spark}
                  />
                ))
              : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)}
          </div>
        </Appear>
        ) : null}

        {tab === "results" && report.state === "failed" && (
          <Card>
            <LoadError message="We couldn't load your analytics." onRetry={report.reload} />
          </Card>
        )}

        {tab === "results" && report.state === "ready" && (
          <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:grid-rows-1">
            <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
              <Appear index={2}>
                <Card>
                  <CardHeader>
                    <CardTitle>People reached</CardTitle>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {fmt(report.data.trend.reduce((n, p) => n + p.reached, 0))} in this window
                    </span>
                  </CardHeader>
                  <CardContent>
                    <AreaChart
                      label="People reached per day"
                      height={130}
                      points={report.data.trend.map((p) => ({ x: p.date, y: p.reached }))}
                    />
                  </CardContent>
                </Card>
              </Appear>

              <Appear index={3} className={FILL}>
                <Card className={FILL}>
                  <CardHeader>
                    <CardTitle>By channel</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-[6px] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                    {report.data.byChannel.length === 0 ? (
                      <EmptyState>Nothing has gone out on any channel yet.</EmptyState>
                    ) : (
                      <BarRows
                        label="People reached by channel"
                        rows={report.data.byChannel.map((c) => ({
                          name: CHANNEL_NAME[c.channel],
                          value: c.reached,
                          note: `${fmt(c.reached)} reached · ${fmt(c.replies)} replies`,
                        }))}
                      />
                    )}
                  </CardContent>
                </Card>
              </Appear>
            </div>

            <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
              <Appear index={4} className={FILL}>
                <Card className={FILL}>
                  <CardHeader>
                    <CardTitle>Funnel</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-[12px] pt-[10px] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                    {report.data.funnel.length === 0 ? (
                      <EmptyState>No funnel yet.</EmptyState>
                    ) : (
                      report.data.funnel.map((stage) => (
                        <div key={stage.stage} className="flex flex-col gap-[6px]">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="text-[12px]">{stage.stage}</span>
                            <span className="font-mono text-[11.5px] text-body">
                              {fmt(stage.count)} · {(stage.share * 100).toFixed(0)}%
                            </span>
                          </span>
                          <Meter pct={stage.share * 100} label={`${stage.stage}: ${fmt(stage.count)}`} />
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </Appear>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
