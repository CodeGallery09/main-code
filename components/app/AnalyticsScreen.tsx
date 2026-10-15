"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Screen } from "./AppShell";
import { SampleBanner } from "./SampleBanner";
import { BarChart, Series, Sparkline, TrendChart } from "./charts";
import { Delta, fmt, Segmented, Tabs } from "./ui";
import { api } from "@/lib/api";
import { toChannelKey } from "@/lib/app/adapt";
import { CHANNEL } from "@/lib/app/channels";
import { SENDING_ENABLED } from "@/lib/capabilities";
import type { Analytics, Campaign, CampaignStatus, Channel, Metric, TrendPoint } from "@/lib/data/types";

type View = "overview" | "channels" | "campaigns";
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

const STATUS_TAG: Record<CampaignStatus, { label: string; tone: string }> = {
  live: { label: "Live", tone: "pos" },
  scheduled: { label: "Scheduled", tone: "" },
  paused: { label: "Paused", tone: "hl" },
  draft: { label: "Draft", tone: "" },
  completed: { label: "Completed", tone: "" },
};

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
  const [view, setView] = useState<View>("overview");
  const [range, setRange] = useState<Range>("30d");
  const [active, setActive] = useState<Channel[]>(LIVE);
  const [hidden, setHidden] = useState<string[]>([]);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  /** Guards against an out-of-order response overwriting a newer one. */
  const requestId = useRef(0);
  const campaignRequestId = useRef(0);

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

  const loadCampaigns = useCallback(async () => {
    const id = ++campaignRequestId.current;
    setCampaignsLoading(true);
    try {
      const result = await api.campaigns();
      if (id !== campaignRequestId.current) return;
      setCampaigns(result.items);
      setCampaignsError(null);
    } catch (caught) {
      if (id !== campaignRequestId.current) return;
      setCampaignsError(caught instanceof Error ? caught.message : "Could not load campaigns.");
    } finally {
      if (id === campaignRequestId.current) setCampaignsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const reloadAll = () => {
    void load();
    void loadCampaigns();
  };

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
      <SampleBanner onRemoved={reloadAll} />

      <Tabs<View>
        value={view}
        onChange={setView}
        items={[
          ["overview", "Overview"],
          ["channels", "Channels"],
          ["campaigns", "Campaigns"],
        ]}
      />

      {view !== "campaigns" && (
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
      )}

      {view !== "campaigns" && error && (
        <p className="empty" role="status">
          {error}{" "}
          <button className="sortb" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      {view !== "campaigns" && !loaded && loading && <p className="empty">Loading analytics…</p>}

      {view !== "campaigns" && loaded && !error && empty && (
        <section className="card">
          <p className="empty">
            <b>No activity in the {ranged}</b>
            <span>
              {SENDING_ENABLED
                ? "Reached, replies and meetings appear here once campaigns start sending."
                : "Nothing is sent from Flightpath yet, so there is nothing to report. Reached, replies and meetings will appear here once campaigns send."}
            </span>
          </p>
        </section>
      )}

      {view === "overview" && loaded && !error && !empty && (
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
              <h3>Campaign trend</h3>
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

      {view === "channels" && loaded && !error && !empty && (
        <div
          className="card ltable"
          style={loading ? { opacity: 0.6, transition: "opacity .2s" } : undefined}
          aria-busy={loading}
        >
          <div className="tblw">
            <table className="tbl leads">
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
      )}

      {view === "campaigns" && (
        <>
          {campaignsError && (
            <p className="empty" role="status">
              {campaignsError}{" "}
              <button className="sortb" onClick={() => void loadCampaigns()}>
                Retry
              </button>
            </p>
          )}
          {campaignsLoading && !campaigns && <p className="empty">Loading campaigns…</p>}
          {campaigns && campaigns.length === 0 && !campaignsError && (
            <section className="card">
              <p className="empty">
                <b>No campaigns yet</b>
                <span>Create a campaign and its figures will appear here.</span>
              </p>
            </section>
          )}
          {campaigns && campaigns.length > 0 && (
            <div className="card ltable" aria-busy={campaignsLoading}>
              <div className="tblw">
                <table className="tbl leads">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Status</th>
                      <th className="r">Leads</th>
                      <th className="r hide-m">Sent</th>
                      <th className="r">Delivered</th>
                      <th className="r">Open rate</th>
                      <th className="r">Reply rate</th>
                      <th className="r hide-m">Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => {
                      const tag = STATUS_TAG[c.status];
                      // A campaign that has not sent anything has no figures, not zeros.
                      const sent = (c.sent ?? 0) >= 1;
                      const cell = (render: () => string) => (sent ? render() : "—");
                      return (
                        <tr key={c.id}>
                          <td>
                            {c.name}
                            {c.isSample && (
                              <span className="tag" style={{ marginLeft: 8 }}>
                                Sample
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={"tag " + tag.tone}>{tag.label}</span>
                          </td>
                          <td className="r num">{fmt(c.leads)}</td>
                          <td className="r num hide-m">{cell(() => fmt(c.sent ?? 0))}</td>
                          <td className="r num">{cell(() => fmt(c.delivered ?? 0))}</td>
                          <td className="r num">
                            {cell(() => (c.openRate === null ? "—" : `${c.openRate.toFixed(1)}%`))}
                          </td>
                          <td className="r num">
                            {cell(() => (c.replyRate === null ? "—" : `${c.replyRate.toFixed(1)}%`))}
                          </td>
                          <td className="r num hide-m">
                            {cell(() => ((c.clicks ?? 0) >= 1 ? fmt(c.clicks ?? 0) : "—"))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            Campaign figures are totals to date. They do not follow the range or channel selection, which only
            apply to the Overview and Channels views.
          </p>
        </>
      )}

      {view !== "campaigns" && loaded && !error && !empty && (
        <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
          Daily totals recorded for this workspace, by UTC day. Change is against the previous {days} days.
        </p>
      )}
    </Screen>
  );
}
