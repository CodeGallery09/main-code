"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Campaign, Overview, Task } from "@/lib/data/types";
import {
  Avatar,
  CHANNEL_LABEL,
  ChannelDots,
  DemoDataNote,
  MetricTile,
  ScoreBadge,
  Segmented,
  Switch,
  fmtNumber,
} from "@/components/app/ui";
import { CheckIcon, ChevronRight, PlusIcon } from "@/components/app/icons";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "call", label: "Calls" },
  { id: "reply", label: "Replies" },
  { id: "review", label: "Approve" },
] as const;

function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen({ initial }: { initial: Overview }) {
  const [tasks, setTasks] = useState<Task[]>(initial.tasks);
  const [campaigns, setCampaigns] = useState<Campaign[]>(initial.campaigns);
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      call: tasks.filter((t) => t.kind === "call").length,
      reply: tasks.filter((t) => t.kind === "reply").length,
      review: tasks.filter((t) => t.kind === "review").length,
    }),
    [tasks],
  );

  const shown = filter === "all" ? tasks : tasks.filter((task) => task.kind === filter);

  const complete = async (id: string) => {
    setBusy(id);
    const previous = tasks;
    setTasks((rows) => rows.filter((row) => row.id !== id)); // optimistic
    try {
      await api.completeTask(id);
    } catch {
      setTasks(previous);
    } finally {
      setBusy(null);
    }
  };

  const toggleCampaign = async (campaign: Campaign) => {
    const next = campaign.status === "live" ? "paused" : "live";
    setCampaigns((rows) => rows.map((row) => (row.id === campaign.id ? { ...row, status: next } : row)));
    try {
      await api.setCampaignStatus(campaign.id, next);
    } catch {
      setCampaigns((rows) =>
        rows.map((row) => (row.id === campaign.id ? { ...row, status: campaign.status } : row)),
      );
    }
  };

  const firstName = initial.user.name.split(" ")[0];

  return (
    <div className="space-y-3.5">
      {/* ---------- greeting ---------- */}
      <section className="lg lg-sheen lg-in r-xl flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6">
        <div>
          <p className="thead">Today</p>
          <h2 className="mt-1.5 text-[clamp(1.6rem,3vw,2rem)] font-bold leading-tight tracking-[-0.035em] text-ink">
            {greeting()}, <span className="text-muted">{firstName}.</span>
          </h2>
          <DemoDataNote className="mt-1.5" />
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="gbtn">
            Last 30 days
          </button>
          <Link href="/dashboard/leads" className="gbtn gbtn-solid">
            <PlusIcon />
            Add leads
          </Link>
        </div>
      </section>

      {/* ---------- metrics ---------- */}
      <section aria-label="Headline metrics" className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {initial.metrics.map((metric, i) => (
          <MetricTile key={metric.id} metric={metric} index={i + 1} />
        ))}
      </section>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* ---------- to do ---------- */}
        <section
          className="lg lg-sheen lg-in r-xl flex flex-col"
          style={{ "--i": 5 } as React.CSSProperties}
          aria-labelledby="todo-title"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
            <h3 id="todo-title" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
              To do
            </h3>
            <Segmented
              label="Filter to-dos"
              value={filter}
              onChange={setFilter}
              items={FILTERS.map((f) => ({ ...f, count: counts[f.id] }))}
            />
          </div>

          <ul className="flex-1">
            {shown.map((task) => (
              <li
                key={task.id}
                className="row-sep row-hover flex items-center gap-3 px-5 py-3.5 first:border-t first:border-black/[0.06]"
              >
                <Avatar initials={task.initials} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-ink">
                    {task.leadName}{" "}
                    <span className="font-normal text-muted">{task.company}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-2">
                    <ScoreBadge score={task.score} />
                    <span className="truncate">{task.summary}</span>
                    <span className="shrink-0 text-muted">· {task.when}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Link
                    href={task.kind === "call" ? "/dashboard/leads" : "/dashboard/inbox"}
                    className="gbtn gbtn-sm gbtn-solid"
                  >
                    {task.kind === "call" ? "Call" : task.kind === "review" ? "Review" : "Reply"}
                  </Link>
                  <button
                    type="button"
                    className="gbtn gbtn-sm gbtn-quiet h-8 w-8 !px-0"
                    onClick={() => complete(task.id)}
                    disabled={busy === task.id}
                    aria-label={`Mark ${task.leadName} handled`}
                  >
                    <CheckIcon />
                  </button>
                </div>
              </li>
            ))}
            {!shown.length && (
              <li className="px-5 py-12 text-center text-[14px] text-muted">
                Nothing waiting on you here. Good place to be.
              </li>
            )}
          </ul>
        </section>

        <div className="flex flex-col gap-3.5">
          {/* ---------- live campaigns ---------- */}
          <section
            className="lg lg-sheen lg-in r-xl"
            style={{ "--i": 6 } as React.CSSProperties}
            aria-labelledby="live-title"
          >
            <div className="flex items-center justify-between px-5 pb-3 pt-4">
              <h3 id="live-title" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
                Campaigns
              </h3>
              <Link href="/dashboard/campaigns" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
                See all <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ul>
              {campaigns.map((campaign) => (
                <li
                  key={campaign.id}
                  className="row-sep row-hover flex items-center gap-3 px-5 py-3 first:border-t first:border-black/[0.06]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ink">{campaign.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted">
                      <ChannelDots channels={campaign.channels} />
                      {campaign.channels.map((c) => CHANNEL_LABEL[c]).join(" · ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13.5px] font-semibold tabular-nums text-ink">
                    {campaign.replyRate !== null ? `${campaign.replyRate}%` : "—"}
                  </span>
                  <Switch
                    checked={campaign.status === "live"}
                    onChange={() => toggleCampaign(campaign)}
                    label={`${campaign.status === "live" ? "Pause" : "Resume"} ${campaign.name}`}
                  />
                </li>
              ))}
            </ul>
          </section>

          {/* ---------- sending caps ---------- */}
          <section
            className="lg lg-sheen lg-in r-xl px-5 py-4"
            style={{ "--i": 7 } as React.CSSProperties}
            aria-labelledby="sending-title"
          >
            <h3 id="sending-title" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
              Sending today
            </h3>
            <p className="mt-1 text-[12.5px] text-muted">
              Daily caps per channel protect your accounts and domains.
            </p>
            <ul className="mt-4 space-y-3.5">
              {initial.quotas.map((quota) => (
                <li key={quota.channel}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="font-medium text-ink">{CHANNEL_LABEL[quota.channel]}</span>
                    <span className="tabular-nums text-muted">
                      {fmtNumber(quota.used)} / {fmtNumber(quota.cap)}
                    </span>
                  </div>
                  <div className="meter mt-1.5">
                    <i style={{ "--fill": quota.used / quota.cap } as React.CSSProperties} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
