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
import { Avatar, Delta, fmt, Segmented } from "./ui";
import { api } from "@/lib/api";
import { toAppCampaign } from "@/lib/app/adapt";
import { channelNames } from "@/lib/app/channels";
import { STATUS_TAG } from "@/lib/app/campaigns";
import { scoreBand } from "@/lib/app/leads";
import { ANALYTICS_HREF, CAMPAIGNS_HREF, INBOX_HREF, LEADS_HREF } from "@/lib/nav";
import type { Campaign, Metric, Overview, Task, TaskKind } from "@/lib/data/types";

type Filter = "all" | TaskKind;

/** Home reports the last seven days. Ranges belong to Analytics, which owns the real report. */
const RANGE = "7d";

/**
 * The button on a to-do, by what it asks of you — pointed at the thing itself, not at the list it
 * lives in. A to-do names a person; sending the user to an unfiltered Inbox or Leads list made
 * them find that person again by hand.
 */
const TASK_ACTION: Record<TaskKind, { label: string; tone: "pri" | "acc"; href: (task: Task) => string }> = {
  reply: { label: "Reply", tone: "pri", href: (t) => `${INBOX_HREF}?lead=${encodeURIComponent(t.leadId)}` },
  call: { label: "Call", tone: "acc", href: (t) => `${LEADS_HREF}?lead=${encodeURIComponent(t.leadId)}` },
  review: { label: "Review", tone: "pri", href: () => CAMPAIGNS_HREF },
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
  const [filter, setFilter] = useState<Filter>("all");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyTask, setBusyTask] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [next, list] = await Promise.all([api.overview(RANGE), api.campaigns()]);
      setOverview(next);
      setCampaigns(list.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your workspace.");
    }
  }, []);

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
        <Link className="btn line" href={ANALYTICS_HREF}>
          See the full report
        </Link>
      </div>

      {error && (
        <p className="empty" role="status">
          {error}{" "}
          <button className="sortb" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      <div className="stats" aria-label="Last 7 days">
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
                      <Link className={"btn sm " + action.tone} href={action.href(task)}>
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
              <Link className="link" href={CAMPAIGNS_HREF}>
                See all
              </Link>
            </div>
            {campaigns && recent.length === 0 ? (
              <p className="empty">
                No campaigns yet. <Link href={CAMPAIGNS_HREF}>Create your first one.</Link>
              </p>
            ) : (
              <ul className="card-b wfmini">
                {recent.map((c) => {
                  const app = toAppCampaign(c);
                  const tag = STATUS_TAG[c.status];
                  return (
                    <li key={c.id}>
                      <Link className="nm" href={c.type === "multichannel" ? `/dashboard/workflows/${c.id}` : CAMPAIGNS_HREF}>
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
