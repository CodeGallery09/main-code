"use client";

/**
 * Analytics: one report, not three.
 *
 * It had Overview / Channels / Strategies tabs. "Channels" was two rows of the same numbers the
 * Overview's bar chart already draws, so the table now sits under that chart. "Strategies" was the
 * Strategies table again, and it deliberately ignored the range and channel selection above it —
 * with a footnote apologising for that — so it is a link to Strategies instead.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Screen } from "./AppShell";
import { BarChart, Series, Sparkline, TrendChart } from "./charts";
import { Delta, fmt, Segmented } from "./ui";
import { api } from "@/lib/api";
import { toChannelKey } from "@/lib/app/adapt";
import { CHANNEL } from "@/lib/app/channels";
import { CAMPAIGNS_HREF } from "@/lib/nav";
import { SENDING_ENABLED } from "@/lib/capabilities";
import type { Analytics, Channel, Metric, TrendPoint } from "@/lib/data/types";

type Range = "7d" | "30d" | "90d";

const RANGES: [Range, string][] = [
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
];
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** The only channels the product runs today. WhatsApp, calls and SMS are roadmap, so they are
 *  neither offered here nor asked of the API. */
const LIVE: Channel[] = ["linkedin", "email"];

/** The five funnel stages, in the greys the reference uses. */
const SERIES_META = [
  { key: "reached", label: "Reached", color: "#B9BEC6", fill: "rgba(185,190,198,.30)" },
  { key: "engaged", label: "Engaged", color: "#8A9099", fill: "rgba(138,144,153,.30)" },
  { key: "replied", label: "Replied", color: "#555B63", fill: "rgba(85,91,99,.32)" },
  { key: "positive", label: "Positive", color: "#2A8C6C", fill: "rgba(42,140,108,.22)" },
  { key: "meetings", label: "Meetings", color: "#111316", fill: "rgba(17,19,22,.18)" },
] as const;

/* ------------------------------------------------------------------ helpers -- */

const DAY_MS = 86_400_000;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (key: string) => Date.parse(`${key}T00:00:00Z`);
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (key: string) => SHORT_DATE.format(dayMs(key));

const percent = (part: number, whole: number, digits = 1) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(digits)}%` : "—";

const ZERO = { reached: 0, engaged: 0, replied: 0, positive: 0, meetings: 0 };

/**
 * One point per calendar day in the window. The API only returns days that have a rollup, so a
 * quiet day would otherwise be missing from the axis and the line would skip over it. Days are
 * UTC, like the rollups. Today has no row until the rollup has run, so the chart stops at the
 * last day that can have data instead of drawing a false drop to zero.
 */
function fillDays(trend: TrendPoint[], days: number, today: string): TrendPoint[] {
  const byDate = new Map(trend.map((p) => [p.date, p]));
  const end = byDate.has(today) ? dayMs(today) : dayMs(today) - DAY_MS;
  const start = dayMs(today) - (days - 1) * DAY_MS;
  const out: TrendPoint[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const date = dayKey(t);
    out.push(byDate.get(date) ?? { date, ...ZERO });
  }
  return out;
}

const hasActivity = (trend: TrendPoint[]) =>
  trend.some((p) => p.reached + p.engaged + p.replied + p.positive + p.meetings > 0);

function metricValue(m: Metric | undefined): string {
  if (!m) return "—";
  return m.format === "percent" ? `${m.value.toFixed(m.decimals)}%` : fmt(m.value);
}

type Loaded = { data: Analytics; range: Range; channels: Channel[]; today: string };

/* ------------------------------------------------------------------- screen -- */

export function AnalyticsScreen() {
  const [range, setRange] = useState<Range>("30d");
  const [active, setActive] = useState<Channel[]>(LIVE);
  const [hidden, setHidden] = useState<string[]>([]);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Guards against an out-of-order response overwriting a newer one. */
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const data = await api.analytics({ range, channels: active.join(",") });
      if (id !== requestId.current) return;
      setLoaded({ data, range, channels: active, today: dayKey(Date.now()) });
      setError(null);
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : "Could not load analytics.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [range, active]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (channel: Channel) =>
    setActive((current) => {
      if (!current.includes(channel)) return LIVE.filter((c) => c === channel || current.includes(c));
      // At least one channel stays on: with none selected the API would answer for all of them.
      return current.length > 1 ? current.filter((c) => c !== channel) : current;
    });

  /* ---- everything below is derived from the last successful response ---- */

  const days = loaded ? RANGE_DAYS[loaded.range] : RANGE_DAYS[range];
  const daily = useMemo(
    () => (loaded ? fillDays(loaded.data.trend, RANGE_DAYS[loaded.range], loaded.today) : []),
    [loaded],
  );
  const empty = loaded ? !hasActivity(loaded.data.trend) : false;

  const series: Series[] = useMemo(
    () =>
      SERIES_META.map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        fill: s.fill,
        values: daily.map((p) => p[s.key]),
      })),
    [daily],
  );

  // About seven labels along the axis, with the last day always closing it.
  const labels = useMemo(() => {
    if (!daily.length) return [];
    const last = daily.length - 1;
    const gap = Math.max(1, Math.ceil(daily.length / 7));
    const out: { at: number; text: string }[] = [];
    for (let i = 0; i < last - Math.floor(gap / 2); i += gap) out.push({ at: i, text: shortDate(daily[i].date) });
    out.push({ at: last, text: shortDate(daily[last].date) });
    return out;
  }, [daily]);

  const windowLabel = daily.length ? `${shortDate(daily[0].date)} – ${shortDate(daily[daily.length - 1].date)}` : "";

  const kpis = useMemo(() => {
    if (!loaded) return [];
    const byId = new Map(loaded.data.metrics.map((m) => [m.id, m]));
    // Sparklines come from the zero-filled days, so a quiet day shows as a dip rather than being skipped.
    const tail = daily.slice(-14);
    const rows: { id: string; label: string; spark: number[] }[] = [
      { id: "reached", label: "Reached", spark: tail.map((p) => p.reached) },
      { id: "reply-rate", label: "Reply rate", spark: tail.map((p) => (p.reached ? (p.replied / p.reached) * 100 : 0)) },
      { id: "positive", label: "Positive replies", spark: tail.map((p) => p.positive) },
      { id: "meetings", label: "Meetings", spark: tail.map((p) => p.meetings) },
    ];
    // The API reports a reply-rate change against an empty previous period as the whole rate
    // ("up 16.7pp"). With nothing reached before, there is no baseline, so show a dash.
    const noBaseline = byId.get("reached")?.delta == null;
    return rows.map((r) => {
      const metric = byId.get(r.id);
      const delta = r.id === "reply-rate" && noBaseline ? null : (metric?.delta ?? null);
      return { ...r, metric, delta };
    });
  }, [loaded, daily]);

  const channelRows = useMemo(
    () =>
      (loaded?.data.byChannel ?? [])
        .filter((row) => loaded?.channels.includes(row.channel))
        .map((row) => {
          const key = toChannelKey(row.channel);
          return { ...row, key, meta: CHANNEL[key] };
        }),
    [loaded],
  );

  const barGroups = useMemo(
    () =>
      (
        [
          ["Reached", "reached"],
          ["Replies", "replies"],
          ["Meetings", "meetings"],
        ] as const
      ).map(([label, field]) => ({
        label,
        values: Object.fromEntries(channelRows.map((row) => [row.key, row[field]])),
      })),
    [channelRows],
  );

  const ranged = `last ${days} days`;

  return (
    <Screen title="Analytics">
      <div className="fbar">
          {LIVE.map((channel) => {
            const meta = CHANNEL[toChannelKey(channel)];
            const on = active.includes(channel);
            const last = on && active.length === 1;
            return (
              <button
                className="chtog"
                key={channel}
                aria-pressed={on}
                aria-disabled={last || undefined}
                title={last ? "At least one channel stays selected" : undefined}
                onClick={() => toggle(channel)}
              >
                <i className="cdot" style={{ background: meta.hex }} />
                {meta.name}
                <span className={"sw" + (on ? " on" : "")} aria-hidden="true" />
              </button>
            );
          })}
        <span className="sp" />
        <Segmented<Range> value={range} onChange={setRange} items={RANGES} />
      </div>

      {error && (
        <p className="empty" role="status">
          {error}{" "}
          <button className="sortb" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      {!loaded && loading && <p className="empty">Loading analytics…</p>}

      {loaded && !error && empty && (
        <section className="card">
          <p className="empty">
            <b>No activity in the {ranged}</b>
            <span>
              {SENDING_ENABLED
                ? "Reached, replies and meetings appear here once strategies start sending."
                : "Nothing is sent from Flightpath yet, so there is nothing to report. Reached, replies and meetings will appear here once strategies send."}
            </span>
          </p>
        </section>
      )}

      {loaded && !error && !empty && (
        <div style={loading ? { opacity: 0.6, transition: "opacity .2s" } : undefined} aria-busy={loading}>
          <div className="kpis">
            {kpis.map((k) => (
              <section className="card kpi" key={k.id}>
                <span className="eyebrow">{k.label}</span>
                <div className="row" style={{ alignItems: "baseline" }}>
                  <span className="v">{metricValue(k.metric)}</span>
                  <Delta v={k.delta} pp={k.metric?.deltaUnit === "points"} />
                </div>
                <Sparkline values={k.spark} />
              </section>
            ))}
          </div>

          <section className="card trendcard">
            <div className="card-h">
              <h3>Strategy trend</h3>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {windowLabel} · {loaded.channels.map((c) => CHANNEL[toChannelKey(c)].name).join(" + ")} · UTC days
              </span>
            </div>
            <div className="card-b">
              <div className="trend">
                <div className="tlegend" role="group" aria-label="Series">
                  {SERIES_META.map((s) => (
                    <button
                      key={s.key}
                      aria-pressed={!hidden.includes(s.key)}
                      onClick={() =>
                        setHidden((h) => (h.includes(s.key) ? h.filter((k) => k !== s.key) : [...h, s.key]))
                      }
                    >
                      <i style={{ background: s.color }} />
                      {s.label}
                    </button>
                  ))}
                </div>
                <TrendChart series={series} labels={labels} hidden={hidden} />
              </div>
            </div>
          </section>

          <div className="g-an" style={{ marginTop: 16 }}>
            <section className="card">
              <div className="card-h">
                <h3>Activity by channel</h3>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {ranged}
                </span>
              </div>
              <div className="card-b">
                <BarChart
                  groups={barGroups}
                  channels={channelRows.map((row) => ({ k: row.key, name: row.meta.name, hex: row.meta.hex }))}
                />
                <div className="legend">
                  {channelRows.map((row) => (
                    <span key={row.key}>
                      <i style={{ background: row.meta.hex }} />
                      {row.meta.name}
                    </span>
                  ))}
                </div>
                <div className="tblw" style={{ marginTop: 12 }}>
                  <table className="tbl audiences">
                    <thead>
                      <tr>
                        <th>Channel</th>
                        <th className="r">Reached</th>
                        <th className="r">Replies</th>
                        <th className="r">Reply rate</th>
                        <th className="r">Meetings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelRows.map((row) => (
                        <tr key={row.channel}>
                          <td>
                            <span className="chname">
                              <i className="cdot" style={{ background: row.meta.hex }} />
                              {row.meta.name}
                            </span>
                          </td>
                          <td className="r num">{fmt(row.reached)}</td>
                          <td className="r num">{fmt(row.replies)}</td>
                          <td className="r num">{percent(row.replies, row.reached)}</td>
                          <td className="r num">{fmt(row.meetings)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="card">
              <div className="card-h">
                <h3>Funnel</h3>
              </div>
              <div className="card-b funnel">
                {loaded.data.funnel.map((stage, i, all) => {
                  // Each step is quoted against the step above it; the bar against the top.
                  const previous = i === 0 ? stage.count : all[i - 1].count;
                  return (
                    <div className="fr" key={stage.stage}>
                      <div className="t">
                        <span>{stage.stage}</span>
                        <span>
                          <b>{fmt(stage.count)}</b>
                          {i > 0 && <small> · {percent(stage.count, previous, 0)}</small>}
                        </span>
                      </div>
                      <div className="bar">
                        <i style={{ width: `${Math.max(0, Math.min(1, stage.share)) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}

      {loaded && !error && !empty && (
        <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
          Daily totals recorded for this workspace, by UTC day. Change is against the previous {days} days.
          Per-strategy totals are on <Link href={CAMPAIGNS_HREF}>Strategies</Link>.
        </p>
      )}
    </Screen>
  );
}
