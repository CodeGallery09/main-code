"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Screen } from "./AppShell";
import { SearchIcon } from "./icons";
import { Dot, fmt, Kpi, Segmented, Switch, Tabs } from "./ui";
import { CampaignEditor, type CampaignDraft } from "./CampaignEditor";
import { api, fieldErrorsOf } from "@/lib/api";
import { toAppCampaign, toChannel, type AppCampaign } from "@/lib/app/adapt";
import { CHANNEL, CHANNELS, type ChannelKey } from "@/lib/app/channels";
import { STATUS_TAG } from "@/lib/app/campaigns";
import type { CampaignStatus } from "@/lib/data/types";
import type { CampaignTotals } from "@/lib/data/repository";

type StatusFilter = "all" | CampaignStatus;
type TypeFilter = "all" | "single" | "multi";

/** Only multichannel campaigns have a workflow to open in the builder, which lives
 *  under /dashboard/workflows — campaign ids and workflow ids are the same. */
const builderHref = (c: AppCampaign) => (c.type === "multi" ? `/dashboard/workflows/${c.id}` : null);

/** "Started 12 Sep" / "Starts 24 Oct" / "Not published" */
function scheduleLabel(c: AppCampaign) {
  if (c.status === "draft") return "Not published";
  if (c.scheduledAt) return `Starts ${c.scheduledAt}`;
  if (c.startedAt) return `Started ${c.startedAt}`;
  return "Started today";
}

/** A draft or an unpublished schedule has no numbers to show yet. */
const hasRun = (c: AppCampaign) => c.status !== "draft" && !c.scheduledAt;

const EMPTY_DRAFT: CampaignDraft = {
  id: null,
  name: "",
  type: "single",
  status: "draft",
  channels: ["mail"],
  startedAt: "",
};

export function CampaignsScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [channel, setChannel] = useState<ChannelKey | "all">("all");
  const [query, setQuery] = useState("");

  const [rows, setRows] = useState<AppCampaign[]>([]);
  const [counts, setCounts] = useState<Record<StatusFilter, number>>({
    all: 0,
    live: 0,
    scheduled: 0,
    paused: 0,
    draft: 0,
    completed: 0,
  });
  const [totals, setTotals] = useState<CampaignTotals>({
    leads: 0,
    delivered: 0,
    openRate: null,
    replyRate: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CampaignDraft | null>(null);

  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      // Two calls: the filtered rows, and an unfiltered-by-status set so the tab counts
      // reflect the other filters without the status tab narrowing its own count.
      const [filtered, forCounts] = await Promise.all([
        api.campaigns({
          q: debouncedQuery || undefined,
          status: status === "all" ? undefined : status,
          type: type === "all" ? undefined : type === "multi" ? "multichannel" : "standalone",
          channel: channel === "all" ? undefined : toChannel(channel),
        }),
        api.campaigns({
          q: debouncedQuery || undefined,
          type: type === "all" ? undefined : type === "multi" ? "multichannel" : "standalone",
          channel: channel === "all" ? undefined : toChannel(channel),
        }),
      ]);
      if (id !== requestId.current) return;

      setRows(filtered.items.map(toAppCampaign));
      setTotals(filtered.totals);
      const tally: Record<StatusFilter, number> = {
        all: forCounts.items.length,
        live: 0,
        scheduled: 0,
        paused: 0,
        draft: 0,
        completed: 0,
      };
      for (const c of forCounts.items) tally[c.status] += 1;
      setCounts(tally);
      setError(null);
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : "Could not load campaigns.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [debouncedQuery, status, type, channel]);

  useEffect(() => {
    void load();
  }, [load]);

  /** The on/off switch writes a real status change, rather than tracking paused ids locally. */
  async function toggleOn(c: AppCampaign) {
    const next: CampaignStatus = c.status === "paused" ? "live" : "paused";
    setBusyId(c.id);
    setRows((current) => current.map((r) => (r.id === c.id ? { ...r, status: next } : r)));
    try {
      await api.setCampaignStatus(c.id, next);
    } catch {
      setRows((current) => current.map((r) => (r.id === c.id ? { ...r, status: c.status } : r)));
      setError("Could not change that campaign's status.");
    } finally {
      setBusyId(null);
      void load();
    }
  }

  async function remove(c: AppCampaign) {
    if (!window.confirm(`Delete “${c.name}”? Its leads are kept, but unlinked from it.`)) return;
    setBusyId(c.id);
    try {
      await api.deleteCampaign(c.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete that campaign.");
    } finally {
      setBusyId(null);
    }
  }

  async function save(draft: CampaignDraft) {
    const payload = {
      name: draft.name,
      type: draft.type === "multi" ? ("multichannel" as const) : ("standalone" as const),
      status: draft.status,
      channels: draft.channels.map(toChannel),
      startedAt: draft.startedAt || null,
    };
    try {
      if (draft.id) await api.updateCampaign(draft.id, payload);
      else await api.createCampaign(payload);
      setEditing(null);
      await load();
      return null;
    } catch (caught) {
      return fieldErrorsOf(caught) ?? { _: caught instanceof Error ? caught.message : "Could not save." };
    }
  }

  /** Columns read "—" until a campaign has actually sent something. */
  const cell = (c: AppCampaign, render: (c: AppCampaign) => string) =>
    hasRun(c) && (c.sent ?? 0) >= 1 ? render(c) : "—";

  return (
    <Screen title="Campaigns">
      <div className="wfhead">
        <Tabs<StatusFilter>
          value={status}
          onChange={setStatus}
          items={[
            ["all", "All", counts.all],
            ["live", "Live", counts.live],
            ["scheduled", "Scheduled", counts.scheduled],
            ["paused", "Paused", counts.paused],
            ["draft", "Draft", counts.draft],
          ]}
        />
        <button className="btn pri" onClick={() => setEditing({ ...EMPTY_DRAFT })}>
          Create campaign
        </button>
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
      </div>

      {error && (
        <p className="empty" role="status">
          {error}{" "}
          <button className="sortb" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      <div className="kpis">
        <Kpi label="Leads" value={fmt(totals.leads)} />
        <Kpi label="Delivered" value={fmt(totals.delivered)} />
        <Kpi label="Open rate" value={totals.openRate === null ? "—" : `${totals.openRate.toFixed(1)}%`} />
        <Kpi label="Reply rate" value={totals.replyRate === null ? "—" : `${totals.replyRate.toFixed(1)}%`} />
      </div>

      <div className="card ltable" aria-busy={loading}>
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
                <th className="r" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const tag = STATUS_TAG[c.status];
                const href = builderHref(c);
                return (
                  <tr
                    className={href ? "click" : ""}
                    key={c.id}
                    aria-busy={busyId === c.id}
                    onClick={href ? () => router.push(href) : undefined}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <span>
                        <Switch
                          on={c.status === "live" || c.status === "scheduled"}
                          disabled={c.status === "completed" || c.status === "draft" || busyId === c.id}
                          label={`${c.name} on`}
                          onChange={() => void toggleOn(c)}
                        />
                      </span>
                    </td>
                    <td>
                      <div className="two">
                        <span style={{ fontWeight: 600 }}>
                          {href ? (
                            <Link href={href} onClick={(e) => e.stopPropagation()}>
                              {c.name}
                            </Link>
                          ) : (
                            c.name
                          )}
                        </span>
                        <small>
                          {c.type === "single" ? (
                            <>
                              {c.channels[0] && <Dot k={c.channels[0]} />}
                              {c.channels[0] ? `${CHANNEL[c.channels[0]].name} · ` : ""}Standalone ·{" "}
                              {scheduleLabel(c)}
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
                    <td className="r num hide-m">{cell(c, (v) => fmt(v.sent ?? 0))}</td>
                    <td className="r num">{cell(c, (v) => fmt(v.delivered ?? 0))}</td>
                    <td className="r num">
                      {cell(c, (v) => (v.openRate === null ? "—" : `${v.openRate.toFixed(1)}%`))}
                    </td>
                    <td className="r num">
                      {cell(c, (v) => (v.replyRate === null ? "—" : `${v.replyRate.toFixed(1)}%`))}
                    </td>
                    <td className="r num hide-m">
                      {cell(c, (v) => ((v.clicks ?? 0) >= 1 ? fmt(v.clicks ?? 0) : "—"))}
                    </td>
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      <span className="fu">
                        <button className="sortb" aria-label={`Edit ${c.name}`} onClick={() => setEditing(draftOf(c))}>
                          Edit
                        </button>
                        <button
                          className="sortb"
                          aria-label={`Delete ${c.name}`}
                          disabled={busyId === c.id}
                          onClick={() => void remove(c)}
                        >
                          Delete
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Three different "nothing to show" states, and conflating them lies to the user: a
            failed load is not an empty list, and an empty workspace is not a filter that matched
            nothing. The error banner above already covers the first, so say nothing here. */}
        {rows.length === 0 && !loading && !error &&
          (status !== "all" || type !== "all" || channel !== "all" || debouncedQuery ? (
            <p className="empty">No campaigns match those filters.</p>
          ) : (
            <p className="empty">
              <b>No campaigns yet</b>
              <span>Create your first campaign to get started.</span>
            </p>
          ))}
        {loading && rows.length === 0 && <p className="empty">Loading campaigns…</p>}
      </div>

      {editing && <CampaignEditor draft={editing} onCancel={() => setEditing(null)} onSave={save} />}
    </Screen>
  );
}

function draftOf(c: AppCampaign): CampaignDraft {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    status: c.status,
    channels: c.channels,
    startedAt: "",
  };
}
