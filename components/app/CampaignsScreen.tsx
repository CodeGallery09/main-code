"use client";

import { useMemo, useState } from "react";
import { Screen } from "./AppShell";
import { SearchIcon } from "./icons";
import { Dot, fmt, Kpi, Segmented, Switch, Tabs } from "./ui";
import { CHANNEL, CHANNELS, type ChannelKey } from "@/lib/app/channels";
import {
  CAMPAIGNS,
  hasRun,
  scheduleLabel,
  STATUS_TAG,
  type Campaign,
  type CampaignStatus,
} from "@/lib/app/campaigns";
import { campaignMetrics, DAYS, rangeLabel, rate } from "@/lib/app/metrics";

type StatusFilter = "all" | CampaignStatus;
type TypeFilter = "all" | "single" | "multi";
type Period = "7d" | "30d" | "90d";

const WINDOW: Record<Period, number> = { "7d": 7, "30d": 30, "90d": 90 };

export function CampaignsScreen() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [channel, setChannel] = useState<ChannelKey | "all">("all");
  const [period, setPeriod] = useState<Period>("30d");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState<number[]>([]);

  const range = { from: DAYS - WINDOW[period], to: DAYS - 1 };

  // Everything but the status tabs narrows the set the tab counts are taken from.
  const scoped = CAMPAIGNS.filter(
    (c) =>
      (type === "all" || c.type === type) &&
      (channel === "all" || c.channels.includes(channel)) &&
      (!query || c.name.toLowerCase().includes(query.toLowerCase())),
  );

  const countFor = (s: StatusFilter) => scoped.filter((c) => s === "all" || c.status === s).length;

  const rows = useMemo(
    () =>
      scoped
        .filter((c) => status === "all" || c.status === status)
        .map((c) => ({ c, m: hasRun(c) ? campaignMetrics(c.id, c.channels, range.from, range.to) : null })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, type, channel, query, period],
  );

  const totals = rows.reduce(
    (acc, { c, m }) =>
      m
        ? {
            leads: acc.leads + c.leads,
            delivered: acc.delivered + m.delivered,
            opened: acc.opened + m.opened,
            openBase: acc.openBase + m.openBase,
            sent: acc.sent + m.sent,
            replied: acc.replied + m.replied,
          }
        : { ...acc, leads: acc.leads + c.leads },
    { leads: 0, delivered: 0, opened: 0, openBase: 0, sent: 0, replied: 0 },
  );

  /** Columns read "—" until a campaign has actually sent something. */
  const cell = (m: ReturnType<typeof campaignMetrics> | null, render: (v: NonNullable<typeof m>) => string) =>
    m && m.sent >= 1 ? render(m) : "—";

  const isOn = (c: Campaign) =>
    (c.status === "live" || c.status === "scheduled") && !paused.includes(c.id);

  return (
    <Screen title="Campaigns">
      <div className="wfhead">
        <Tabs<StatusFilter>
          value={status}
          onChange={setStatus}
          items={[
            ["all", "All", countFor("all")],
            ["live", "Live", countFor("live")],
            ["scheduled", "Scheduled", countFor("scheduled")],
            ["paused", "Paused", countFor("paused")],
            ["draft", "Draft", countFor("draft")],
          ]}
        />
        <button className="btn pri">Create campaign</button>
      </div>

      <div className="lfilters">
        <label className="q wide">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search campaigns"
            aria-label="Search campaigns"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <Segmented<TypeFilter>
          value={type}
          onChange={setType}
          items={[
            ["all", "All types"],
            ["single", "Standalone"],
            ["multi", "Multichannel"],
          ]}
        />

        <select
          className="sel pill"
          aria-label="Channel"
          value={channel}
          onChange={(e) => setChannel(e.target.value as ChannelKey | "all")}
        >
          <option value="all">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c.k} value={c.k}>
              {c.name}
            </option>
          ))}
        </select>

        <span className="sp" />

        <div className="drpre">
          <Segmented<Period>
            value={period}
            onChange={setPeriod}
            items={[
              ["7d", "7D"],
              ["30d", "30D"],
              ["90d", "90D"],
            ]}
          />
          <div className="drp">
            <button className="drbtn" aria-haspopup="dialog" aria-expanded="false">
              <span className="num">{rangeLabel(range.from, range.to)}</span>
              <span className="chev" aria-hidden="true">
                ⌄
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Leads" value={fmt(totals.leads)} />
        <Kpi label="Delivered" value={fmt(totals.delivered)} />
        <Kpi
          label="Open rate"
          value={totals.openBase ? `${rate(totals.opened, totals.openBase).toFixed(1)}%` : "—"}
        />
        <Kpi label="Reply rate" value={totals.sent ? `${rate(totals.replied, totals.sent).toFixed(1)}%` : "—"} />
      </div>

      <div className="card ltable">
        <div className="tblw">
          <table className="tbl leads camps">
            <thead>
              <tr>
                <th style={{ width: 64 }}>
                  <span className="sr">On</span>
                </th>
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
              {rows.map(({ c, m }) => {
                const tag = STATUS_TAG[paused.includes(c.id) ? "paused" : c.status];
                return (
                  <tr className="click" key={c.id}>
                    <td>
                      <span>
                        <Switch
                          on={isOn(c)}
                          disabled={c.status === "completed" || c.status === "draft"}
                          label={`${c.name} on`}
                          onChange={() =>
                            setPaused((p) =>
                              p.includes(c.id) ? p.filter((id) => id !== c.id) : [...p, c.id],
                            )
                          }
                        />
                      </span>
                    </td>
                    <td>
                      <div className="two">
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <small>
                          {c.type === "single" ? (
                            <>
                              <Dot k={c.channels[0]} />
                              {CHANNEL[c.channels[0]].name} · Standalone · {scheduleLabel(c)}
                            </>
                          ) : (
                            <>
                              <span className="dots">
                                {c.channels.map((k) => (
                                  <Dot k={k} key={k} />
                                ))}
                              </span>
                              Multichannel{c.ver ? ` · v${c.ver}` : ""} · {scheduleLabel(c)}
                            </>
                          )}
                        </small>
                      </div>
                    </td>
                    <td>
                      <span className={"tag " + tag.tone}>{tag.label}</span>
                    </td>
                    <td className="r num">{fmt(c.leads)}</td>
                    <td className="r num hide-m">{cell(m, (v) => fmt(v.sent))}</td>
                    <td className="r num">{cell(m, (v) => fmt(v.delivered))}</td>
                    <td className="r num">
                      {cell(m, (v) => (v.openBase ? `${rate(v.opened, v.openBase).toFixed(1)}%` : "—"))}
                    </td>
                    <td className="r num">{cell(m, (v) => `${rate(v.replied, v.sent).toFixed(1)}%`)}</td>
                    <td className="r num hide-m">
                      {cell(m, (v) => (v.clicks >= 1 ? fmt(v.clicks) : "—"))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="empty">No campaigns match those filters.</p>}
      </div>
    </Screen>
  );
}
