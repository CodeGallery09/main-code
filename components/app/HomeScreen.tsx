"use client";

/**
 * Home: what needs doing, how the workspace is doing, and what is set to send.
 *
 * Everything on this screen is read from the workspace's own data (`/api/overview`,
 * `/api/campaigns`). A brand-new workspace sees the sample campaign's conversations and figures,
 * labelled as sample; once that is removed it sees honest zeros and empty states, not invented
 * numbers. Nothing here can start a campaign: nothing sends yet (`lib/capabilities.ts`).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Screen } from "./AppShell";
import { SampleBanner } from "./SampleBanner";
import { CheckIcon } from "./icons";
import { Avatar, Delta, Dot, fmt, Meter, Segmented } from "./ui";
import { api } from "@/lib/api";
import { toAppCampaign, toChannelKey } from "@/lib/app/adapt";
import { CHANNEL, channelNames } from "@/lib/app/channels";
import { STATUS_TAG } from "@/lib/app/campaigns";
import { scoreBand } from "@/lib/app/leads";
import type { Campaign, Metric, Overview, Task, TaskKind } from "@/lib/data/types";

type Filter = "all" | TaskKind;
type Range = "7d" | "30d" | "90d";

const RANGE_LABEL: Record<Range, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" };

/** The button on a to-do, by what it asks of you. */
const TASK_ACTION: Record<TaskKind, { label: string; tone: "pri" | "acc"; href: string }> = {
  reply: { label: "Reply", tone: "pri", href: "/dashboard/inbox" },
  call: { label: "Call", tone: "acc", href: "/dashboard/leads" },
  review: { label: "Review", tone: "pri", href: "/dashboard/workflows" },
};

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

const metricValue = (m: Metric | undefined) =>
  !m ? "—" : m.format === "percent" ? `${m.value.toFixed(m.decimals)}%` : fmt(m.value);

export function HomeScreen({ user }: { user: { name: string } }) {
  const greeting = useGreeting();
  const firstName = user.name.split(" ")[0];
  const [range, setRange] = useState<Range>("7d");
  const [filter, setFilter] = useState<Filter>("all");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyTask, setBusyTask] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [next, list] = await Promise.all([api.overview(range), api.campaigns()]);
      setOverview(next);
      setCampaigns(list.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your workspace.");
    }
  }, [range]);

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

  const tasks = overview?.tasks ?? [];
  const count = (kind: Filter) => tasks.filter((t) => kind === "all" || t.kind === kind).length;
  const shown = tasks.filter((t) => filter === "all" || t.kind === filter);
  const metric = (id: string) => overview?.metrics.find((m) => m.id === id);
  const recent = (campaigns ?? []).slice(0, 5);

  return (
    <Screen title="Home">
      <SampleBanner onRemoved={() => void load()} />

      <div className="hello">
        <h2>
          {greeting}, <em>{firstName}.</em>
        </h2>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Segmented<Range>
            value={range}
            onChange={setRange}
            items={[
              ["7d", "7 days"],
              ["30d", "30 days"],
              ["90d", "90 days"],
            ]}
          />
          <Link className="btn line" href="/dashboard/leads">
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

      <div className="stats" aria-label={RANGE_LABEL[range]}>
        {(["replies", "meetings", "reply-rate", "active-leads"] as const).map((id) => {
          const m = metric(id);
          return (
            <Stat
              key={id}
              label={m?.label ?? { replies: "Replies", meetings: "Meetings", "reply-rate": "Reply rate", "active-leads": "Active leads" }[id]}
              value={metricValue(m)}
              delta={m && id !== "active-leads" ? <Delta v={m.delta} pp={m.deltaUnit === "points"} /> : undefined}
            />
          );
        })}
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
                ["review", "Review", count("review")],
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
                        <span className="muted">· {task.when}</span>
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
              <h3>Campaigns</h3>
              <Link className="link" href="/dashboard/campaigns">
                See all
              </Link>
            </div>
            {campaigns && recent.length === 0 ? (
              <p className="empty">
                No campaigns yet. <Link href="/dashboard/campaigns">Create your first one.</Link>
              </p>
            ) : (
              <ul className="card-b wfmini">
                {recent.map((c) => {
                  const app = toAppCampaign(c);
                  const tag = STATUS_TAG[c.status];
                  return (
                    <li key={c.id}>
                      <Link className="nm" href={c.type === "multichannel" ? `/dashboard/workflows/${c.id}` : "/dashboard/campaigns"}>
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
                      <span className={"tag " + tag.tone}>{tag.label}</span>
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
