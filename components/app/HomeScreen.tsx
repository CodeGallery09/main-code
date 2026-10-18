"use client";

/**
 * Home: what happened today, how the window is trending, what needs doing, and what is set to send.
 *
 * Everything on this screen is read from the workspace's own data (`/api/overview`,
 * `/api/campaigns`). A brand-new workspace sees the sample campaign's conversations and figures,
 * labelled as sample; once that is removed it sees honest zeros and empty states, not invented
 * numbers. Nothing here can start a campaign: nothing sends yet (`lib/capabilities.ts`).
 *
 * The header's two controls narrow different things on purpose. The strategy select narrows every
 * figure to one campaign; the date range drives the trend chart only, because the tiles are
 * explicitly today's.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Screen } from "./AppShell";
import { SampleBanner } from "./SampleBanner";
import { CheckIcon } from "./icons";
import { TrendChart, type Series } from "./charts";
import { DateRange, dayLabel, presetWindow, windowLabel, type Window } from "./DateRange";
import { Avatar, Delta, Dot, fmt, Meter, Segmented, Switch } from "./ui";
import { api } from "@/lib/api";
import { SENDING_ENABLED, SENDING_OFF_NOTE } from "@/lib/capabilities";
import { toAppCampaign, toChannelKey } from "@/lib/app/adapt";
import { CHANNEL, channelNames } from "@/lib/app/channels";
import { scoreBand } from "@/lib/app/leads";
import type { Campaign, CampaignStatus, Overview, Task, TaskKind, TrendPoint } from "@/lib/data/types";

type Filter = "all" | TaskKind;

/** The button on a to-do, by what it asks of you. */
const TASK_ACTION: Record<TaskKind, { label: string; tone: "pri" | "acc"; href: string }> = {
  reply: { label: "Reply", tone: "pri", href: "/dashboard/inbox" },
  call: { label: "Call", tone: "acc", href: "/dashboard/leads" },
  review: { label: "Review", tone: "pri", href: "/dashboard/workflows" },
};

/** The nested funnel stages the chart draws, widest first. */
const SERIES: { key: keyof Omit<TrendPoint, "date">; label: string; color: string; fill: string }[] = [
  { key: "reached", label: "Reached", color: "#0095FF", fill: "rgba(0,149,255,.30)" },
  { key: "replied", label: "Replied", color: "#FFC400", fill: "rgba(255,196,0,.34)" },
  { key: "meetings", label: "Meetings", color: "#00D98C", fill: "rgba(0,217,140,.50)" },
];

/** Set after mount: the server's clock is not the visitor's, so a greeting computed during the
 *  server render would flash the wrong time of day. */
function useGreeting() {
  const [text, setText] = useState("Welcome back");
  useEffect(() => {
    const hour = new Date().getHours();
    setText(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
  }, []);
  return text;
}

/** Movement between two counts, as a percentage — or nothing to report when both are tiny. */
const change = (now: number, before: number): number | null =>
  Math.round(now) < 1 && Math.round(before) < 1 ? null : before ? ((now - before) / before) * 100 : null;

const rate = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);

export function HomeScreen({ user }: { user: { name: string } }) {
  const greeting = useGreeting();
  const firstName = user.name.split(" ")[0];
  // Mounted, not rendered on the server: the window is anchored on today, and the server's day
  // is not necessarily the viewer's.
  const [window, setWindow] = useState<Window | null>(null);
  const [campaignId, setCampaignId] = useState("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [hidden, setHidden] = useState<string[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [busyCampaign, setBusyCampaign] = useState<string | null>(null);

  useEffect(() => setWindow(presetWindow(7)), []);

  const load = useCallback(async () => {
    if (!window) return;
    try {
      const [next, list] = await Promise.all([
        api.overview({ from: window.from, to: window.to, campaignId }),
        api.campaigns(),
      ]);
      setOverview(next);
      setCampaigns(list.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your workspace.");
    }
  }, [window, campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function complete(task: Task) {
    if (!overview) return;
    setBusyTask(task.id);
    const before = overview;
    setOverview({ ...overview, tasks: overview.tasks.filter((t) => t.id !== task.id) });
    try {
      await api.completeTask(task.id);
    } catch {
      setOverview(before);
      setError("Could not mark that done. Try again.");
    } finally {
      setBusyTask(null);
    }
  }

  /** The switch on a strategy writes a real status change, as the Campaigns screen does. */
  async function toggle(campaign: Campaign) {
    const next: CampaignStatus = campaign.status === "paused" ? "live" : "paused";
    // Nothing sends yet, so switching a campaign on would be a false claim. Switching off is fine.
    if (next === "live" && !SENDING_ENABLED) {
      setError(SENDING_OFF_NOTE);
      return;
    }
    setBusyCampaign(campaign.id);
    setCampaigns((rows) => (rows ?? []).map((c) => (c.id === campaign.id ? { ...c, status: next } : c)));
    try {
      await api.setCampaignStatus(campaign.id, next);
    } catch {
      setCampaigns((rows) => (rows ?? []).map((c) => (c.id === campaign.id ? { ...c, status: campaign.status } : c)));
      setError("Could not change that strategy's status.");
    } finally {
      setBusyCampaign(null);
      void load();
    }
  }

  const tasks = overview?.tasks ?? [];
  const count = (kind: Filter) => tasks.filter((t) => kind === "all" || t.kind === kind).length;
  const shown = tasks.filter((t) => filter === "all" || t.kind === filter);
  const today = overview?.today;
  const running = (campaigns ?? []).filter((c) => c.status === "live" || c.status === "paused");
  const selectable = (campaigns ?? []).filter((c) => c.status !== "draft");
  const scopeLabel = campaignId === "all" ? "All strategies" : selectable.find((c) => c.id === campaignId)?.name ?? "Strategy";

  const trend = useMemo(() => overview?.trend ?? [], [overview]);
  const series: Series[] = useMemo(
    () => SERIES.map((s) => ({ key: s.key, label: s.label, color: s.color, fill: s.fill, values: trend.map((p) => p[s.key]) })),
    [trend],
  );
  const labels = useMemo(() => {
    if (!trend.length) return [];
    const every = Math.max(1, Math.ceil(trend.length / 7));
    return trend
      .map((p, at) => ({ at, text: dayLabel(p.date) }))
      .filter((l, i) => i % every === 0 || i === trend.length - 1);
  }, [trend]);

  return (
    <Screen title="Home">
      <SampleBanner onRemoved={() => void load()} />

      <div className="hello">
        <div>
          <h2>
            {greeting}, <em>{firstName}.</em>
          </h2>
          <p className="sub muted">Here&rsquo;s where things stand today.</p>
        </div>
        <div className="hello-r">
          <select
            className="sel pill"
            aria-label="Strategy"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="all">All strategies</option>
            {selectable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {window && <DateRange value={window} onChange={setWindow} />}
          <Link className="btn line sm" href="/dashboard/leads">
            Add leads
          </Link>
        </div>
      </div>

      {error && (
        <p className="empty" role="status">
          {error}{" "}
          <button className="sortb" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      <div className="stats" aria-label="Today">
        <div className="card stat lead">
          <span className="eyebrow">Reachouts today</span>
          <span className="v">
            {fmt(today?.current.reached ?? 0)}
            <Delta v={change(today?.current.reached ?? 0, today?.previous.reached ?? 0)} />
          </span>
          <div className="chbreak">
            {(today?.byChannel ?? []).map((row) => (
              <span className="chb" key={row.channel}>
                {CHANNEL[toChannelKey(row.channel)].name} <b>{fmt(row.reached)}</b>
              </span>
            ))}
          </div>
        </div>

        <Stat
          label="Reply rate"
          value={`${rate(today?.current.replied ?? 0, today?.current.reached ?? 0).toFixed(1)}%`}
          delta={
            <Delta
              v={
                rate(today?.current.replied ?? 0, today?.current.reached ?? 0) -
                rate(today?.previous.replied ?? 0, today?.previous.reached ?? 0)
              }
              pp
            />
          }
        />
        <Stat
          label="Click rate"
          value={`${rate(today?.current.engaged ?? 0, today?.current.reached ?? 0).toFixed(1)}%`}
          delta={
            <Delta
              v={
                rate(today?.current.engaged ?? 0, today?.current.reached ?? 0) -
                rate(today?.previous.engaged ?? 0, today?.previous.reached ?? 0)
              }
              pp
            />
          }
        />
        <Stat
          label="Meetings today"
          value={fmt(today?.current.meetings ?? 0)}
          delta={<Delta v={change(today?.current.meetings ?? 0, today?.previous.meetings ?? 0)} />}
        />
        <Stat label="Active leads" value={fmt(overview?.activeLeads ?? 0)} />
      </div>

      <section className="card trendcard">
        <div className="card-h">
          <h3>Performance</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            {window ? windowLabel(window) : "—"} · {scopeLabel} · hover for the full funnel
          </span>
        </div>
        <div className="card-b">
          {trend.length < 2 ? (
            <p className="empty">
              Nothing to chart for this window yet. Reached, replies and meetings appear here as campaigns run.
            </p>
          ) : (
            <div className="trend">
              <div className="tlegend" role="group" aria-label="Series">
                {SERIES.map((s) => (
                  <button
                    key={s.key}
                    className={hidden.includes(s.key) ? "off" : ""}
                    aria-pressed={!hidden.includes(s.key)}
                    onClick={() =>
                      setHidden((h) => {
                        const next = h.includes(s.key) ? h.filter((k) => k !== s.key) : [...h, s.key];
                        // Hiding the last visible series leaves an empty chart; keep one on.
                        return next.length === SERIES.length ? h : next;
                      })
                    }
                  >
                    <i style={{ background: s.color }} />
                    {s.label}
                  </button>
                ))}
              </div>
              <TrendChart
                series={series}
                labels={labels}
                hidden={hidden}
                title="Performance over the selected window"
                tooltip={(i) => <FunnelTip point={trend[i]} />}
              />
            </div>
          )}
        </div>
      </section>

      <div className="g-home">
        <section className="card">
          <div className="card-h">
            <h3>To do</h3>
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              items={[
                ["all", "All", count("all")],
                ["call", "Calls", count("call")],
                ["reply", "Replies", count("reply")],
                ["review", "Approve", count("review")],
              ]}
            />
          </div>

          {!overview ? (
            <p className="empty">Loading…</p>
          ) : shown.length === 0 ? (
            <p className="empty">
              {tasks.length === 0
                ? "Nothing waiting on you. Replies and calls that need a person will show up here."
                : "Nothing in this list."}
            </p>
          ) : (
            <ul className="todo" style={{ marginTop: 10 }}>
              {shown.map((task) => {
                const action = TASK_ACTION[task.kind];
                return (
                  <li key={task.id}>
                    <Avatar name={task.leadName} />
                    <div>
                      <div className="t1">
                        <b>{task.leadName}</b>
                        <span>{task.company}</span>
                      </div>
                      <div className="t2">
                        <span className={"score " + scoreBand(task.score)}>{task.score}</span>
                        {task.summary}
                        <span className="muted">
                          · {CHANNEL[toChannelKey(task.channel)].name} · {task.when}
                        </span>
                      </div>
                    </div>
                    <div className="acts">
                      <Link className={"btn sm " + action.tone} href={action.href}>
                        {action.label}
                      </Link>
                      <button
                        className="ib sm"
                        title="Done"
                        aria-label={`Mark ${task.leadName} done`}
                        disabled={busyTask === task.id}
                        onClick={() => void complete(task)}
                      >
                        <CheckIcon />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="stack">
          <section className="card">
            <div className="card-h">
              <h3>Strategies</h3>
              <span className="muted" style={{ fontSize: 12 }}>
                {campaigns ? `${running.length} total` : ""}
              </span>
            </div>
            {campaigns && running.length === 0 ? (
              <p className="empty">
                Nothing running yet. <Link href="/dashboard/campaigns">Create your first strategy.</Link>
              </p>
            ) : (
              <ul className="card-b wfmini">
                {running.map((c) => {
                  const app = toAppCampaign(c);
                  return (
                    <li key={c.id}>
                      <Link
                        className="nm"
                        href={c.type === "multichannel" ? `/dashboard/workflows/${c.id}` : "/dashboard/campaigns"}
                      >
                        <b>
                          {c.name}
                          {c.isSample && (
                            <span className="tag" style={{ marginLeft: 6 }}>
                              Sample
                            </span>
                          )}
                        </b>
                        <small className="muted" style={{ fontSize: 12 }}>
                          {app.channels.length ? channelNames(app.channels) : "No channels yet"}
                          {c.type === "standalone" ? " · Standalone" : ""}
                        </small>
                      </Link>
                      <span className="num" style={{ fontWeight: 600 }} title="Reply rate">
                        {c.replyRate !== null && (c.sent ?? 0) >= 1 ? `${c.replyRate.toFixed(1)}%` : "—"}
                      </span>
                      <Switch
                        label={`${c.name} live`}
                        on={c.status === "live"}
                        disabled={busyCampaign === c.id || (c.status !== "live" && !SENDING_ENABLED)}
                        title={c.status !== "live" && !SENDING_ENABLED ? SENDING_OFF_NOTE : undefined}
                        onChange={() => void toggle(c)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-h">
              <h3>Sending today</h3>
            </div>
            <div className="card-b cap">
              {(overview?.quotas ?? []).map((row) => {
                const key = toChannelKey(row.channel);
                return (
                  <div key={row.channel}>
                    <div className="t">
                      <span>
                        <Dot k={key} />
                        {CHANNEL[key].name}
                      </span>
                      <span className="num muted">
                        {row.used} / {row.cap}
                      </span>
                    </div>
                    <Meter value={row.used} max={row.cap} color={CHANNEL[key].hex} />
                  </div>
                );
              })}
              <small className="muted">Daily limits for the channels that can send. Nothing is sent yet.</small>
            </div>
          </section>
        </div>
      </div>
    </Screen>
  );
}

/** The readout under the pointer: the day's stages, plus the two rates derived from them. */
function FunnelTip({ point }: { point: TrendPoint | undefined }) {
  if (!point) return null;
  const rows: [string, string][] = [
    ["Reached", fmt(point.reached)],
    ["Replied", fmt(point.replied)],
    ["Meetings", fmt(point.meetings)],
  ];
  return (
    <>
      <div className="h">{dayLabel(point.date)}</div>
      {rows.map(([label, value], i) => (
        <div className="r" key={label}>
          <i className="cdot" style={{ background: SERIES[i].color }} />
          <span>{label}</span>
          <b>{value}</b>
        </div>
      ))}
      <div className="r tot">
        <span />
        <span>Reply rate</span>
        <b>{point.reached ? `${rate(point.replied, point.reached).toFixed(1)}%` : "—"}</b>
      </div>
      <div className="r">
        <span />
        <span>Click/open rate</span>
        <b>{point.reached ? `${rate(point.engaged, point.reached).toFixed(1)}%` : "—"}</b>
      </div>
    </>
  );
}

function Stat({ label, value, delta }: { label: string; value: string; delta?: React.ReactNode }) {
  return (
    <div className="card stat">
      <span className="eyebrow">{label}</span>
      <span className="v">
        {value}
        {delta}
      </span>
    </div>
  );
}
