"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Screen } from "./AppShell";
import { CheckIcon, ClockIcon } from "./icons";
import { Avatar, Delta, Dot, fmt, Meter, Segmented, Switch } from "./ui";
import { CHANNEL, channelNames } from "@/lib/app/channels";
import { CAMPAIGNS, hasRun } from "@/lib/app/campaigns";
import { TASK_ACTION, TASKS, type TaskKind } from "@/lib/app/inbox";
import { leadById, scoreBand } from "@/lib/app/leads";
import { campaignMetrics, DAYS, rangeLabel, rate, REACHED, REPLIED, totals } from "@/lib/app/metrics";
import { SENDING_TODAY } from "@/lib/app/workspace";

type Filter = "all" | "call" | "reply" | "approve";

/** Greeting that matches the time of day, like the reference. */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen({ user }: { user: { name: string } }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [done, setDone] = useState<string[]>([]);
  const [paused, setPaused] = useState<number[]>([]);
  const firstName = user.name.split(" ")[0];

  // This week against the one before it, so the stat cards can show movement.
  const stats = useMemo(() => {
    const from = DAYS - 7;
    const to = DAYS - 1;
    const now = totals(from, to).tot;
    const before = totals(from - 7, from - 1).tot;
    const change = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);
    return {
      label: rangeLabel(from, to),
      replies: now[REPLIED],
      repliesDelta: change(now[REPLIED], before[REPLIED]),
      meetings: now[4],
      meetingsDelta: change(now[4], before[4]),
      replyRate: rate(now[REPLIED], now[REACHED]),
      replyRateDelta: rate(now[REPLIED], now[REACHED]) - rate(before[REPLIED], before[REACHED]),
      activeLeads: 1284,
    };
  }, []);

  const open = TASKS.filter((t) => !done.includes(t.id));
  const count = (kind: Filter) => open.filter((t) => kind === "all" || t.type === kind).length;
  const shown = open.filter((t) => filter === "all" || t.type === filter);

  const live = CAMPAIGNS.filter((c) => c.status === "live").slice(0, 5);

  return (
    <Screen title="Home">
      <div className="hello">
        <h2>
          {greeting()}, <em>{firstName}.</em>
        </h2>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <div className="drp">
            <button className="drbtn" aria-haspopup="dialog" aria-expanded="false">
              <span className="num">{stats.label}</span>
              <span className="chev" aria-hidden="true">
                ⌄
              </span>
            </button>
          </div>
          <Link className="btn line" href="/dashboard/leads">
            Add leads
          </Link>
          {/* This screen still reads the demo constants in lib/app/, not the workspace's own
              data, so say so: a real account would otherwise take these for its own numbers. */}
          <span className="samp">Illustrative demo data</span>
        </div>
      </div>

      <div className="stats">
        <Stat label="Replies" value={fmt(stats.replies)} delta={<Delta v={stats.repliesDelta} />} />
        <Stat label="Meetings" value={fmt(stats.meetings)} delta={<Delta v={stats.meetingsDelta} />} />
        <Stat
          label="Reply rate"
          value={`${stats.replyRate.toFixed(1)}%`}
          delta={<Delta v={stats.replyRateDelta} pp />}
        />
        <Stat label="Active leads" value={fmt(stats.activeLeads)} />
      </div>

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
                ["approve", "Approve", count("approve")],
              ]}
            />
          </div>

          {shown.length === 0 ? (
            <p className="empty">Nothing waiting on you. Enjoy it.</p>
          ) : (
            <ul className="todo" style={{ marginTop: 10 }}>
              {shown.map((task) => {
                const lead = leadById(task.lead);
                if (!lead) return null;
                const action = TASK_ACTION[task.type as TaskKind];
                return (
                  <li key={task.id}>
                    <Avatar name={lead.n} />
                    <div>
                      <div className="t1">
                        <b>{lead.n}</b>
                        <span>{lead.c}</span>
                      </div>
                      <div className="t2">
                        <span className={"score " + scoreBand(lead.score)}>{lead.score}</span>
                        {task.why}
                        <span className="muted">· {task.due}</span>
                      </div>
                    </div>
                    <div className="acts">
                      <Link className={"btn sm " + action.tone} href="/dashboard/inbox">
                        {action.label}
                      </Link>
                      <button className="ib sm" title="Snooze to tomorrow" aria-label="Snooze">
                        <ClockIcon />
                      </button>
                      <button
                        className="ib sm"
                        title="Done"
                        aria-label="Done"
                        onClick={() => setDone((d) => [...d, task.id])}
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
              <h3>Campaigns</h3>
              <Link className="link" href="/dashboard/campaigns">
                See all
              </Link>
            </div>
            <ul className="card-b wfmini">
              {live.map((c) => {
                const m = hasRun(c) ? campaignMetrics(c.id, c.channels, DAYS - 30, DAYS - 1) : null;
                const on = !paused.includes(c.id);
                return (
                  <li key={c.id}>
                    <Link className="nm" href="/dashboard/campaigns">
                      <b>{c.name}</b>
                      <small className="muted" style={{ fontSize: 12 }}>
                        {c.type === "single"
                          ? `${CHANNEL[c.channels[0]].name} · Standalone`
                          : channelNames(c.channels)}
                      </small>
                    </Link>
                    <span className="num" style={{ fontWeight: 600 }}>
                      {m && m.sent >= 1 ? `${rate(m.replied, m.sent).toFixed(1)}%` : "—"}
                    </span>
                    <Switch
                      on={on}
                      label={`${c.name} live`}
                      onChange={() =>
                        setPaused((p) => (on ? [...p, c.id] : p.filter((id) => id !== c.id)))
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card">
            <div className="card-h">
              <h3>Sending today</h3>
            </div>
            <div className="card-b cap">
              {SENDING_TODAY.map((row) => (
                <div key={row.k}>
                  <div className="t">
                    <span>
                      <Dot k={row.k} />
                      {CHANNEL[row.k].name}
                    </span>
                    <span className="num muted">
                      {row.used} / {row.cap}
                    </span>
                  </div>
                  <Meter value={row.used} max={row.cap} color={CHANNEL[row.k].hex} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Screen>
  );
}

function Stat({ label, value, delta }: { label: string; value: string; delta?: React.ReactNode }) {
  return (
    <button className="card stat">
      <span className="eyebrow">{label}</span>
      <span className="v">
        {value}
        {delta}
      </span>
    </button>
  );
}
