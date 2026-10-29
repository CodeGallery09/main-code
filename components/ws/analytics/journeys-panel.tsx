"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Journeys, RangeKey } from "@/lib/data/types";
import { CHANNEL_NAME } from "@/lib/ws/channels";
import { fmt } from "@/lib/ws/utils";
import { Appear } from "@/components/ws/ui/motion";
import { Card, CardContent, CardHeader, CardTitle, FILL } from "@/components/ws/ui/card";
import { EmptyState, Meter, MetricTile, NativeSelect } from "@/components/ws/ui/misc";
import { AreaChart, BarRows } from "./charts";

/**
 * Journeys — where launched strategies' audiences are in their plans, and the touchpoints made.
 * Read from the run records and their log, so it moves while a plan runs. While nothing sends,
 * every touchpoint is a dry-run one and the panel says so.
 */
export function JourneysPanel({ data, range }: { data: Journeys; range: RangeKey }) {
  const { strategies, touchpoints } = data;
  const [picked, setPicked] = useState<string | null>(null);
  // Follow the first strategy until the person chooses one, and fall back if it disappears.
  const current = strategies.find((s) => s.id === picked) ?? strategies[0];
  useEffect(() => {
    if (picked && !strategies.some((s) => s.id === picked)) setPicked(null);
  }, [picked, strategies]);

  const active = strategies.reduce((n, s) => n + s.active, 0);
  const finished = strategies.reduce((n, s) => n + s.completed + s.stopped, 0);
  const windowLabel = range === "7d" ? "7 days" : range === "30d" ? "30 days" : "90 days";

  if (strategies.length === 0) {
    return (
      <Card>
        <EmptyState className="py-10">
          No strategy has been launched yet. Launch one from{" "}
          <Link href="/dashboard/strategies" className="font-medium text-foreground underline">
            Strategies
          </Link>{" "}
          and its journey and touchpoints show up here.
        </EmptyState>
      </Card>
    );
  }

  return (
    <>
      {data.dryRun ? (
        <p className="rounded-[10px] border border-border bg-card px-[14px] py-[9px] text-[12px] text-body">
          <span className="font-medium">Dry run.</span> A touchpoint here is what a step would have sent, or a call
          to-do that was added. Nobody has been contacted, so none of this feeds the reach, reply or meeting figures.
        </p>
      ) : null}

      <Appear index={1}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <MetricTile
            label="Touchpoints"
            value={fmt(touchpoints.total)}
            footer={`In the last ${windowLabel}`}
            series={touchpoints.byDay.map((d) => d.count)}
          />
          <MetricTile label="In a journey now" value={fmt(active)} footer="Audiences mid-plan" />
          <MetricTile label="Finished" value={fmt(finished)} footer="Reached the end of a plan" />
          <MetricTile
            label="Launched"
            value={fmt(strategies.length)}
            footer={strategies.length === 1 ? "Strategy" : "Strategies"}
          />
        </div>
      </Appear>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:grid-rows-1">
        <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
          <Appear index={2}>
            <Card>
              <CardHeader>
                <CardTitle>Touchpoints per day</CardTitle>
                <span className="font-mono text-[11px] text-muted-foreground">{fmt(touchpoints.total)} in this window</span>
              </CardHeader>
              <CardContent>
                <AreaChart
                  label="Touchpoints per day"
                  height={130}
                  points={touchpoints.byDay.map((d) => ({ x: d.date, y: d.count }))}
                />
              </CardContent>
            </Card>
          </Appear>
          <Appear index={3} className={FILL}>
            <Card className={FILL}>
              <CardHeader>
                <CardTitle>Touchpoints by channel</CardTitle>
              </CardHeader>
              <CardContent className="pt-[6px] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {touchpoints.byChannel.length === 0 ? (
                  <EmptyState>No step has reached a channel yet.</EmptyState>
                ) : (
                  <BarRows
                    label="Touchpoints by channel"
                    rows={touchpoints.byChannel.map((c) => ({
                      name: CHANNEL_NAME[c.channel],
                      value: c.count,
                      note: `${fmt(c.count)} ${c.count === 1 ? "touchpoint" : "touchpoints"}`,
                    }))}
                  />
                )}
              </CardContent>
            </Card>
          </Appear>
        </div>

        <Appear index={4} className={FILL}>
          <Card className={FILL}>
            <CardHeader>
              <CardTitle>Journey</CardTitle>
              <NativeSelect
                id="journey-strategy"
                label="Strategy"
                hideLabel
                value={current.id}
                onChange={setPicked}
                options={strategies.map((s) => ({ value: s.id, label: s.name }))}
              />
            </CardHeader>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-divider px-4 py-[7px] font-mono text-[11px] text-muted-foreground">
              <span>{fmt(current.enrolled)} enrolled</span>
              <span>{fmt(current.active)} in plan</span>
              <span>{fmt(current.completed + current.stopped)} finished</span>
              <span>{fmt(current.touchpoints)} touchpoints</span>
            </div>
            <CardContent className="flex flex-col gap-[12px] pt-[10px] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {current.steps.map((step) => {
                const share = current.enrolled ? step.reached / current.enrolled : 0;
                return (
                  <div key={step.id} className="flex flex-col gap-[6px]" style={{ paddingLeft: Math.min(step.depth, 4) * 10 }}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px]">
                        {step.label}
                        {step.channel ? (
                          <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">
                            {CHANNEL_NAME[step.channel]}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-[11.5px] text-body">
                        {fmt(step.reached)} · {(share * 100).toFixed(0)}%
                        {step.here ? ` · ${fmt(step.here)} waiting` : ""}
                      </span>
                    </span>
                    <Meter pct={share * 100} label={`${step.label}: ${fmt(step.reached)} of ${fmt(current.enrolled)}`} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </Appear>
      </div>
    </>
  );
}
