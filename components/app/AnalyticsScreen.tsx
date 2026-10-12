"use client";

import { useMemo, useState } from "react";
import { Screen } from "./AppShell";
import { BarChart, Series, Sparkline, TrendChart } from "./charts";
import { Delta, fmt, Meter, Tabs } from "./ui";
import { ALL_CHANNELS, CHANNELS, type ChannelKey } from "@/lib/app/channels";
import { CAMPAIGNS, hasRun } from "@/lib/app/campaigns";
import {
  buckets,
  DAYS,
  ENGAGED,
  MEETINGS,
  POSITIVE,
  rangeLabel,
  rate,
  REACHED,
  REPLIED,
  shortDate,
  totals,
} from "@/lib/app/metrics";
import { TEAM } from "@/lib/app/workspace";

type View = "overview" | "channels" | "campaigns" | "team";

/** The five funnel stages, in the greys the reference uses. */
const SERIES_META = [
  { key: "reached", label: "Reached", stage: REACHED, color: "#B9BEC6", fill: "rgba(185,190,198,.30)" },
  { key: "engaged", label: "Engaged", stage: ENGAGED, color: "#8A9099", fill: "rgba(138,144,153,.30)" },
  { key: "replied", label: "Replied", stage: REPLIED, color: "#555B63", fill: "rgba(85,91,99,.32)" },
  { key: "positive", label: "Positive", stage: POSITIVE, color: "#2A8C6C", fill: "rgba(42,140,108,.22)" },
  { key: "meetings", label: "Meetings", stage: MEETINGS, color: "#111316", fill: "rgba(17,19,22,.18)" },
];

export function AnalyticsScreen() {
  const [view, setView] = useState<View>("overview");
  const [off, setOff] = useState<ChannelKey[]>([]);
  const [campaign, setCampaign] = useState<number | "all">("all");
  const [hidden, setHidden] = useState<string[]>([]);
  const [activity, setActivity] = useState<"reached" | "replied" | "meetings">("replied");

  const channels = ALL_CHANNELS.filter((k) => !off.includes(k));
  const from = DAYS - 30;
  const to = DAYS - 1;

  const { tot, byCh } = useMemo(
    () => totals(from, to, channels, campaign),
    [channels, campaign, from, to],
  );
  const before = useMemo(
    () => totals(from - 30, from - 1, channels, campaign).tot,
    [channels, campaign, from],
  );

  const daily = useMemo(
    () => buckets(from, to, channels, campaign, REACHED, 1),
    [channels, campaign, from, to],
  );

  const series: Series[] = useMemo(
    () =>
      SERIES_META.map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        fill: s.fill,
        values: buckets(from, to, channels, campaign, s.stage, 1).map((b) =>
          channels.reduce((sum, c) => sum + (b.v[c] ?? 0), 0),
        ),
      })),
    [channels, campaign, from, to],
  );

  // A label every four days, with the range's last day always closing the axis.
  const labels = useMemo(() => {
    const last = daily.length - 1;
    const out: { at: number; text: string }[] = [];
    for (let i = 0; i < last - 1; i += 4) out.push({ at: i, text: shortDate(from + i) });
    out.push({ at: last, text: shortDate(to) });
    return out;
  }, [daily.length, from, to]);

  const activityStage = activity === "reached" ? REACHED : activity === "replied" ? REPLIED : MEETINGS;
  const activityGroups = useMemo(
    () =>
      buckets(from, to, channels, campaign, activityStage, 2).map((b) => ({
        label: shortDate(b.start),
        values: b.v,
      })),
    [channels, campaign, from, to, activityStage],
  );

  const change = (now: number, then: number) => (then ? ((now - then) / then) * 100 : null);

  const kpis = [
    { label: "Reached", value: fmt(tot[REACHED]), delta: change(tot[REACHED], before[REACHED]), stage: REACHED },
    {
      label: "Reply rate",
      value: `${rate(tot[REPLIED], tot[REACHED]).toFixed(1)}%`,
      delta: rate(tot[REPLIED], tot[REACHED]) - rate(before[REPLIED], before[REACHED]),
      pp: true,
      stage: REPLIED,
    },
    { label: "Positive replies", value: fmt(tot[POSITIVE]), delta: change(tot[POSITIVE], before[POSITIVE]), stage: POSITIVE },
    { label: "Meetings", value: fmt(tot[MEETINGS]), delta: change(tot[MEETINGS], before[MEETINGS]), stage: MEETINGS },
  ];

  const sparks = useMemo(
    () =>
      kpis.map((k) =>
        buckets(from, to, channels, campaign, k.stage, 2).map((b) =>
          channels.reduce((sum, c) => sum + (b.v[c] ?? 0), 0),
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channels, campaign, from, to],
  );

  return (
    <Screen title="Analytics">
      <Tabs<View>
        value={view}
        onChange={setView}
        items={[
          ["overview", "Overview"],
          ["channels", "Channels"],
          ["campaigns", "Campaigns"],
          ["team", "Team"],
        ]}
      />

      <div className="fbar">
        {CHANNELS.map((c) => {
          const on = !off.includes(c.k);
          return (
            <button
              className="chtog"
              key={c.k}
              aria-pressed={on}
              onClick={() => setOff((o) => (on ? [...o, c.k] : o.filter((k) => k !== c.k)))}
            >
              <i className="cdot" style={{ background: c.hex }} />
              {c.name}
              <span className={"sw" + (on ? " on" : "")} aria-hidden="true" />
            </button>
          );
        })}
        <span className="sp" />
        <select
          className="sel"
          aria-label="Campaign"
          style={{ width: "auto", height: 34, borderRadius: 999 }}
          value={campaign}
          onChange={(e) => setCampaign(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">All campaigns</option>
          {CAMPAIGNS.filter(hasRun).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="drp">
          <button className="drbtn" aria-haspopup="dialog" aria-expanded="false">
            <span className="num">{rangeLabel(from, to)}</span>
            <span className="chev" aria-hidden="true">
              ⌄
            </span>
          </button>
        </div>
      </div>

      {view === "overview" && (
        <>
          <div className="kpis">
            {kpis.map((k, i) => (
              <section className="card kpi" key={k.label}>
                <span className="eyebrow">{k.label}</span>
                <div className="row" style={{ alignItems: "baseline" }}>
                  <span className="v">{k.value}</span>
                  <Delta v={k.delta} pp={k.pp} />
                </div>
                <Sparkline values={sparks[i]} />
              </section>
            ))}
          </div>

          <section className="card trendcard">
            <div className="card-h">
              <h3>Campaign trend</h3>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {rangeLabel(from, to)} · {off.length ? `${channels.length} channels` : "all channels"}
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

          <div className="g-an">
            <section className="card">
              <div className="card-h">
                <h3>Activity by channel</h3>
                <Tabs<"reached" | "replied" | "meetings">
                  value={activity}
                  onChange={setActivity}
                  items={[
                    ["reached", "Reached"],
                    ["replied", "Replies"],
                    ["meetings", "Meetings"],
                  ]}
                />
              </div>
              <div className="card-b">
                <BarChart
                  groups={activityGroups}
                  channels={CHANNELS.filter((c) => channels.includes(c.k)).map((c) => ({
                    k: c.k,
                    name: c.name,
                    hex: c.hex,
                  }))}
                />
                <div className="legend">
                  {CHANNELS.filter((c) => channels.includes(c.k)).map((c) => (
                    <span key={c.k}>
                      <i style={{ background: c.hex }} />
                      {c.name}
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
                {SERIES_META.map((s, i) => {
                  const value = tot[s.stage];
                  // Each step is quoted against the step above it, not against the top.
                  const previous = i === 0 ? value : tot[SERIES_META[i - 1].stage];
                  return (
                    <div className="fr" key={s.key}>
                      <div className="t">
                        <span>{s.label}</span>
                        <span>
                          <b>{fmt(value)}</b>
                          {i > 0 && <small> · {rate(value, previous).toFixed(0)}%</small>}
                        </span>
                      </div>
                      <div className="bar">
                        <i style={{ width: `${rate(value, tot[REACHED])}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      )}

      {view === "channels" && (
        <div className="card ltable">
          <div className="tblw">
            <table className="tbl leads">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th className="r">Reached</th>
                  <th className="r">Engaged</th>
                  <th className="r">Replies</th>
                  <th className="r">Reply rate</th>
                  <th className="r">Meetings</th>
                  <th className="r hide-m">Healthy band</th>
                </tr>
              </thead>
              <tbody>
                {CHANNELS.filter((c) => channels.includes(c.k)).map((c) => {
                  const f = byCh[c.k];
                  return (
                    <tr key={c.k}>
                      <td>
                        <span className="chname">
                          <i className="cdot" style={{ background: c.hex }} />
                          {c.name}
                        </span>
                      </td>
                      <td className="r num">{fmt(f[REACHED])}</td>
                      <td className="r num">{fmt(f[ENGAGED])}</td>
                      <td className="r num">{fmt(f[REPLIED])}</td>
                      <td className="r num">{f[REACHED] ? `${rate(f[REPLIED], f[REACHED]).toFixed(1)}%` : "—"}</td>
                      <td className="r num">{fmt(f[MEETINGS])}</td>
                      <td className="r num hide-m">
                        {c.bench[0]}–{c.bench[1]}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "campaigns" && (
        <div className="card ltable">
          <div className="tblw">
            <table className="tbl leads">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th className="r">Reached</th>
                  <th className="r">Replies</th>
                  <th className="r">Reply rate</th>
                  <th className="r">Meetings</th>
                </tr>
              </thead>
              <tbody>
                {CAMPAIGNS.filter(hasRun).map((c) => {
                  const f = totals(from, to, c.channels, c.id).tot;
                  return (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td className="r num">{fmt(f[REACHED])}</td>
                      <td className="r num">{fmt(f[REPLIED])}</td>
                      <td className="r num">{f[REACHED] ? `${rate(f[REPLIED], f[REACHED]).toFixed(1)}%` : "—"}</td>
                      <td className="r num">{fmt(f[MEETINGS])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "team" && (
        <div className="g-an">
          {TEAM.map((person) => (
            <section className="card" key={person.email}>
              <div className="card-h">
                <h3>{person.name}</h3>
                <span className="muted">{person.role}</span>
              </div>
              <div className="card-b cap">
                <div>
                  <div className="t">
                    <span>Share of replies</span>
                    <span className="num muted">{Math.round(person.share * 100)}%</span>
                  </div>
                  <Meter value={person.share} max={1} color="var(--accent)" />
                </div>
                <div>
                  <div className="t">
                    <span>Median first response</span>
                    <span className="num muted">{person.respondsIn}</span>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Figures on this page are illustrative demo data.
      </p>
    </Screen>
  );
}
