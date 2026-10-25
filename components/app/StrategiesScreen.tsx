"use client";

/**
 * Strategies: every strategy in the workspace, and the only place one is created.
 *
 * A multichannel strategy *is* a workflow — the builder route takes the strategy id and the graph
 * is one row per strategy — so there is no separate Workflows section and no "type" to choose.
 * "New strategy" picks a template, which creates the strategy and its workflow together and opens
 * the builder. Clicking a row opens the builder on it.
 *
 * Older standalone (single-channel) strategies still list and still open their editor; they just
 * cannot be created any more.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Screen } from "./AppShell";
import { SearchIcon } from "./icons";
import { Dot, fmt, Kpi, Tabs } from "./ui";
import { RenameStrategy } from "./StrategyEditor";
import { TemplatePicker } from "./strategies/TemplatePicker";
import { api } from "@/lib/api";
import { toAppStrategy, toChannel, type AppStrategy } from "@/lib/app/adapt";
import { CHANNEL, CHANNELS, type ChannelKey } from "@/lib/app/channels";
import { STATUS_TAG } from "@/lib/app/strategies";
import type { StrategyStatus } from "@/lib/data/types";
import type { StrategyTotals } from "@/lib/data/repository";

type StatusFilter = "all" | StrategyStatus;

/** Only multichannel strategies have a workflow to open in the builder, which lives
 *  under /dashboard/workflows — strategy ids and workflow ids are the same. */
const builderHref = (c: AppStrategy) => (c.type === "multi" ? `/dashboard/workflows/${c.id}` : null);

/** "Started 12 Sep" / "Starts 24 Oct" / "Not published" */
function scheduleLabel(c: AppStrategy) {
  if (c.status === "draft") return "Not published";
  if (c.scheduledAt) return `Starts ${c.scheduledAt}`;
  if (c.startedAt) return `Started ${c.startedAt}`;
  return "Started today";
}

/** A draft or an unpublished schedule has no numbers to show yet. */
const hasRun = (c: AppStrategy) => c.status !== "draft" && !c.scheduledAt;

export function StrategiesScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [channel, setChannel] = useState<ChannelKey | "all">("all");
  const [query, setQuery] = useState("");

  const [rows, setRows] = useState<AppStrategy[]>([]);
  const [counts, setCounts] = useState<Record<StatusFilter, number>>({
    all: 0,
    live: 0,
    scheduled: 0,
    paused: 0,
    draft: 0,
    completed: 0,
  });
  const [totals, setTotals] = useState<StrategyTotals>({
    audiences: 0,
    delivered: 0,
    openRate: null,
    replyRate: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [starting, setStarting] = useState(false);

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
        api.strategies({
          q: debouncedQuery || undefined,
          status: status === "all" ? undefined : status,
          channel: channel === "all" ? undefined : toChannel(channel),
        }),
        api.strategies({
          q: debouncedQuery || undefined,
          channel: channel === "all" ? undefined : toChannel(channel),
        }),
      ]);
      if (id !== requestId.current) return;

      setRows(filtered.items.map(toAppStrategy));
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
      setError(caught instanceof Error ? caught.message : "Could not load strategies.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [debouncedQuery, status, channel]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Pausing is the only status change the product can honour: stopping is never a false claim. */
  async function pause(c: AppStrategy) {
    setBusyId(c.id);
    setRows((current) => current.map((r) => (r.id === c.id ? { ...r, status: "paused" } : r)));
    try {
      await api.setStrategyStatus(c.id, "paused");
    } catch {
      setRows((current) => current.map((r) => (r.id === c.id ? { ...r, status: c.status } : r)));
      setError("Could not pause that strategy.");
    } finally {
      setBusyId(null);
      void load();
    }
  }

  async function remove(c: AppStrategy) {
    if (!window.confirm(`Delete “${c.name}”? Its audiences are kept, but unlinked from it.`)) return;
    setBusyId(c.id);
    try {
      await api.deleteStrategy(c.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete that strategy.");
    } finally {
      setBusyId(null);
    }
  }

  /** Columns read "—" until a strategy has actually sent something. */
  const cell = (c: AppStrategy, render: (c: AppStrategy) => string) =>
    hasRun(c) && (c.sent ?? 0) >= 1 ? render(c) : "—";

  return (
    <Screen title="Strategies">
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
        <button className="btn pri" onClick={() => setStarting(true)}>
          New strategy
        </button>
      </div>

      <div className="lfilters">
        <label className="q wide">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search strategies"
            aria-label="Search strategies"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

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
        <Kpi label="Audiences" value={fmt(totals.audiences)} />
        <Kpi label="Delivered" value={fmt(totals.delivered)} />
        <Kpi label="Open rate" value={totals.openRate === null ? "—" : `${totals.openRate.toFixed(1)}%`} />
        <Kpi label="Reply rate" value={totals.replyRate === null ? "—" : `${totals.replyRate.toFixed(1)}%`} />
      </div>

      <div className="card ltable" aria-busy={loading}>
        <div className="tblw">
          <table className="tbl audiences camps">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Status</th>
                <th className="r">Audiences</th>
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
                const running = c.status === "live" || c.status === "scheduled";
                return (
                  <tr
                    className={href ? "click" : ""}
                    key={c.id}
                    aria-busy={busyId === c.id}
                    onClick={href ? () => router.push(href) : undefined}
                  >
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
                          {c.isSample && <span className="tag" style={{ marginLeft: 8 }}>Sample</span>}
                        </span>
                        <small>
                          <span className="dots">
                            {c.channels.map((k) => (
                              <Dot k={k} key={k} />
                            ))}
                          </span>
                          {c.channels.length ? `${c.channels.map((k) => CHANNEL[k].name).join(" · ")} · ` : ""}
                          {scheduleLabel(c)}
                        </small>
                      </div>
                    </td>
                    <td>
                      <span className={"tag " + tag.tone}>{tag.label}</span>
                    </td>
                    <td className="r num">{fmt(c.audiences)}</td>
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
                        {running && (
                          <button
                            className="sortb"
                            aria-label={`Pause ${c.name}`}
                            disabled={busyId === c.id}
                            onClick={() => void pause(c)}
                          >
                            Pause
                          </button>
                        )}
                        <button
                          className="sortb"
                          aria-label={`Rename ${c.name}`}
                          onClick={() => setRenaming({ id: c.id, name: c.name })}
                        >
                          Rename
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
          (status !== "all" || channel !== "all" || debouncedQuery ? (
            <p className="empty">No strategies match those filters.</p>
          ) : (
            <p className="empty">
              <b>No strategies yet</b>
              <span>Start one from a template and edit every step in the builder.</span>
            </p>
          ))}
        {loading && rows.length === 0 && <p className="empty">Loading strategies…</p>}
      </div>

      {starting && <TemplatePicker onClose={() => setStarting(false)} />}
      {renaming && (
        <RenameStrategy
          id={renaming.id}
          name={renaming.name}
          onCancel={() => setRenaming(null)}
          onSaved={() => {
            setRenaming(null);
            void load();
          }}
        />
      )}
    </Screen>
  );
}
