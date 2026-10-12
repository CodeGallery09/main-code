"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Analytics, Channel } from "@/lib/data/types";
import {
  CHANNEL_LABEL,
  ChannelMark,
  DemoDataNote,
  ErrorNote,
  MetricTile,
  Segmented,
  Switch,
  fmtNumber,
  smoothPath,
} from "@/components/app/ui";

const ALL_CHANNELS: Channel[] = ["linkedin", "email", "whatsapp", "call", "sms"];

type SeriesKey = "reached" | "engaged" | "replied" | "positive" | "meetings";

const SERIES: { key: SeriesKey; label: string; opacity: number }[] = [
  { key: "reached", label: "Reached", opacity: 0.1 },
  { key: "engaged", label: "Engaged", opacity: 0.22 },
  { key: "replied", label: "Replied", opacity: 0.4 },
  { key: "positive", label: "Positive", opacity: 0.62 },
  { key: "meetings", label: "Meetings", opacity: 0.85 },
];

export function AnalyticsScreen({ initial }: { initial: Analytics }) {
  const [range, setRange] = useState("30d");
  const [channels, setChannels] = useState<Channel[]>(ALL_CHANNELS);
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<"reached" | "replies" | "meetings">("replies");

  useEffect(() => {
    let live = true;
    api
      .analytics({ range, channels: channels.join(",") })
      .then((next) => live && (setData(next), setError(null)))
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [range, channels]);

  const toggleChannel = (channel: Channel) =>
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((c) => c !== channel)
        : [...current, channel].sort((a, b) => ALL_CHANNELS.indexOf(a) - ALL_CHANNELS.indexOf(b)),
    );

  return (
    <div className="space-y-3.5">
      {/* ---------- controls ---------- */}
      <section className="lg lg-sheen lg-in r-xl flex flex-wrap items-center gap-2.5 px-4 py-3.5">
        <Segmented
          label="Date range"
          value={range}
          onChange={setRange}
          items={[
            { id: "7d", label: "7 days" },
            { id: "30d", label: "30 days" },
            { id: "90d", label: "90 days" },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {ALL_CHANNELS.map((channel) => (
            <label
              key={channel}
              className="flex items-center gap-2 rounded-full bg-white/60 py-1 pl-2.5 pr-1.5 text-[13px] shadow-[0_0_0_0.5px_rgb(0_0_0/0.07)]"
            >
              <ChannelMark channel={channel} className="h-3.5 w-3.5 text-ink-2" />
              <span className="text-ink-2">{CHANNEL_LABEL[channel]}</span>
              <Switch
                checked={channels.includes(channel)}
                onChange={() => toggleChannel(channel)}
                label={`Include ${CHANNEL_LABEL[channel]}`}
              />
            </label>
          ))}
        </div>
      </section>

      {error && <ErrorNote message={error} />}

      {/* ---------- metrics ---------- */}
      <section aria-label="Headline metrics" className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {data.metrics.map((item, i) => (
          <MetricTile key={item.id} metric={item} index={i + 1} />
        ))}
      </section>

      {/* ---------- trend ---------- */}
      <section
        className="lg lg-sheen lg-in r-xl px-5 py-4"
        style={{ "--i": 5 } as React.CSSProperties}
        aria-labelledby="trend-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="trend-title" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
            Campaign trend
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            {SERIES.map((series) => (
              <span key={series.key} className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                <span
                  className="h-2.5 w-2.5 rounded-full bg-ink"
                  style={{ opacity: series.opacity }}
                  aria-hidden="true"
                />
                {series.label}
              </span>
            ))}
          </div>
        </div>
        <TrendChart data={data} />
        <DemoDataNote className="mt-3" />
      </section>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* ---------- by channel ---------- */}
        <section
          className="lg lg-sheen lg-in r-xl px-5 py-4"
          style={{ "--i": 6 } as React.CSSProperties}
          aria-labelledby="channel-title"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="channel-title" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
              Activity by channel
            </h3>
            <Segmented
              label="Channel metric"
              value={metric}
              onChange={(id) => setMetric(id as typeof metric)}
              items={[
                { id: "reached", label: "Reached" },
                { id: "replies", label: "Replies" },
                { id: "meetings", label: "Meetings" },
              ]}
            />
          </div>
          <ChannelBars data={data} metric={metric} />
        </section>

        {/* ---------- funnel ---------- */}
        <section
          className="lg lg-sheen lg-in r-xl px-5 py-4"
          style={{ "--i": 7 } as React.CSSProperties}
          aria-labelledby="funnel-title"
        >
          <h3 id="funnel-title" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
            Funnel
          </h3>
          <ul className="mt-4 space-y-3.5">
            {data.funnel.map((stage) => (
              <li key={stage.stage}>
                <div className="flex items-baseline justify-between text-[13.5px]">
                  <span className="font-medium text-ink">{stage.stage}</span>
                  <span className="tabular-nums text-ink-2">
                    {fmtNumber(stage.count)}
                    <span className="text-muted"> · {(stage.share * 100).toFixed(stage.share < 0.1 ? 1 : 0)}%</span>
                  </span>
                </div>
                <div className="meter mt-1.5">
                  <i style={{ "--fill": Math.max(stage.share, 0.012) } as React.CSSProperties} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Stacked area chart drawn as plain SVG — no chart library, so the bundle stays small. */
function TrendChart({ data }: { data: Analytics }) {
  const { paths, ticks, max } = useMemo(() => {
    const rows = data.trend;
    if (rows.length < 2) return { paths: [], ticks: [], max: 0 };
    const peak = Math.max(...rows.map((row) => row.reached), 1);
    const x = (i: number) => (i / (rows.length - 1)) * 100;
    const y = (value: number) => 100 - (value / peak) * 100;

    const built = SERIES.map((series) => ({
      key: series.key,
      opacity: series.opacity,
      d: `${smoothPath(rows.map((row, i) => [x(i), y(row[series.key])] as const))} L100,100 L0,100 Z`,
    }));

    const step = Math.max(1, Math.floor(rows.length / 5));
    const labels = rows
      .map((row, i) => ({ i, date: row.date }))
      .filter(({ i }) => i % step === 0 || i === rows.length - 1)
      .map(({ i, date }) => ({
        x: x(i),
        label: new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      }));

    return { paths: built, ticks: labels, max: peak };
  }, [data]);

  return (
    <figure className="mt-4">
      <div className="relative h-[240px] w-full">
        {/* gridlines */}
        <div className="absolute inset-0 flex flex-col justify-between" aria-hidden="true">
          {[1, 0.75, 0.5, 0.25, 0].map((fraction) => (
            <div key={fraction} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
                {fmtNumber(Math.round(max * fraction))}
              </span>
              <span className="h-px flex-1 bg-black/[0.07]" />
            </div>
          ))}
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-y-0 right-0 h-full w-[calc(100%-3.25rem)] text-ink"
          role="img"
          aria-label={`Daily activity across ${data.trend.length} days. Peak reach ${fmtNumber(max)}.`}
        >
          {paths.map((path) => (
            <path key={path.key} d={path.d} fill="currentColor" opacity={path.opacity} />
          ))}
        </svg>
      </div>
      <div className="relative ml-[3.25rem] mt-2 h-4">
        {ticks.map((tick) => (
          <span
            key={tick.x}
            className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-muted"
            style={{ left: `${tick.x}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

function ChannelBars({ data, metric }: { data: Analytics; metric: "reached" | "replies" | "meetings" }) {
  const peak = Math.max(...data.byChannel.map((row) => row[metric]), 1);
  return (
    <ul className="mt-5 space-y-3">
      {data.byChannel.map((row) => (
        <li key={row.channel} className="flex items-center gap-3">
          <span className="flex w-28 shrink-0 items-center gap-2 text-[13.5px] text-ink-2">
            <ChannelMark channel={row.channel} className="h-4 w-4" />
            {CHANNEL_LABEL[row.channel]}
          </span>
          <span className="meter h-2.5 flex-1">
            <i style={{ "--fill": row[metric] / peak } as React.CSSProperties} />
          </span>
          <span className="w-16 shrink-0 text-right text-[13px] font-semibold tabular-nums text-ink">
            {fmtNumber(row[metric])}
          </span>
        </li>
      ))}
      {!data.byChannel.length && (
        <li className="py-8 text-center text-[13.5px] text-muted">Turn a channel on to see it here.</li>
      )}
    </ul>
  );
}
