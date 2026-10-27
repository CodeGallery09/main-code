"use client";

import { useState } from "react";
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

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

/** Analytics — the same figures as Home, over a longer window and broken down. */
export function AnalyticsView() {
  const [range, setRange] = useState<RangeKey>("30d");
  const report = useAsync(() => api.analytics({ range }), [range]);

  return (
    <>
      <TopBar title="Analytics" />
      <PageBody>
        <Appear>
          <PageHeader
            title="Analytics"
            subtitle="What has been recorded: people reached, replies, meetings. Nothing here is projected."
            actions={
              <Segmented<RangeKey> label="Date range" value={range} onChange={setRange} options={RANGES} />
            }
          />
        </Appear>

        <DemoNote />

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

        {report.state === "failed" && (
          <Card>
            <LoadError message="We couldn't load your analytics." onRetry={report.reload} />
          </Card>
        )}

        {report.state === "ready" && (
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
