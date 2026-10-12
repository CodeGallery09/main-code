"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Screen } from "./AppShell";
import { SearchIcon } from "./icons";
import { Dot, fmt, Tabs } from "./ui";
import { channelNames, STATUS_TAG, type WorkflowSummary } from "@/lib/app/workflowLibrary";
import { TEMPLATES } from "@/lib/app/workflow";
import type { WorkflowStatus } from "@/lib/app/workflow";

type Filter = "all" | WorkflowStatus;

/**
 * The workflow library: every reusable multichannel sequence in the workspace.
 * Campaigns run a workflow; this is where the sequences themselves live.
 */
export function WorkflowsScreen({ workflows }: { workflows: WorkflowSummary[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);

  const scoped = useMemo(
    () => workflows.filter((w) => !query || w.name.toLowerCase().includes(query.toLowerCase())),
    [workflows, query],
  );
  const countFor = (f: Filter) => scoped.filter((w) => f === "all" || w.status === f).length;
  const rows = scoped.filter((w) => filter === "all" || w.status === filter);

  return (
    <Screen title="Workflows">
      <div className="wfhead">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          items={[
            ["all", "All", countFor("all")],
            ["live", "Live", countFor("live")],
            ["paused", "Paused", countFor("paused")],
            ["draft", "Draft", countFor("draft")],
          ]}
        />
        <button type="button" className="btn pri" onClick={() => setPicking(true)}>
          New workflow
        </button>
      </div>

      <div className="lfilters">
        <label className="q wide">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search workflows"
            aria-label="Search workflows"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <span className="samp">Illustrative demo data</span>
      </div>

      <div className="wfgrid">
        {rows.map((w) => (
          <article
            key={w.id}
            className="card wfc"
            role="link"
            tabIndex={0}
            onClick={() => router.push(`/dashboard/workflows/${w.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(`/dashboard/workflows/${w.id}`);
              }
            }}
          >
            <header className="between">
              <h3>{w.name}</h3>
              <span className={"tag " + STATUS_TAG[w.status].tone}>{STATUS_TAG[w.status].label}</span>
            </header>

            <p className="muted" style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 7 }}>
              <span className="dots">
                {w.channels.map((k) => (
                  <Dot key={k} k={k} />
                ))}
              </span>
              {channelNames(w.channels)}
            </p>

            <div className="nums">
              <span>
                <small>Steps</small>
                <b>{w.steps}</b>
              </span>
              <span>
                <small>In flight</small>
                <b>{w.ran ? fmt(w.inFlight) : "—"}</b>
              </span>
              <span>
                <small>Meetings</small>
                <b>{w.ran ? fmt(w.meetings) : "—"}</b>
              </span>
            </div>

            <footer className="between" style={{ fontSize: 12.5 }}>
              <span className="muted">
                {w.started ? `Started ${w.started}` : "Not started"} · {w.daily}/day
              </span>
              {w.needsWork && <span className="tag hl">Needs work</span>}
            </footer>
          </article>
        ))}

        <button type="button" className="card wfc newc" onClick={() => setPicking(true)}>
          <span style={{ fontSize: 24, lineHeight: 1 }} aria-hidden="true">
            +
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>New workflow</span>
        </button>
      </div>

      {!rows.length && (
        <p className="empty" style={{ marginTop: 18 }}>
          No workflows match that filter.
        </p>
      )}

      {picking && <TemplatePicker onClose={() => setPicking(false)} />}
    </Screen>
  );
}

/** Start from a template, the same set the builder's blank state offers. */
function TemplatePicker({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tpl-title">
        <header className="m-h">
          <b id="tpl-title">Start a workflow</b>
          <button type="button" className="ib sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="m-b">
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Pick a proven shape, then edit every step in the builder.
          </p>
          <div className="tplgrid">
            {TEMPLATES.map((t) => (
              <Link key={t.k} className="tpl" href={`/dashboard/workflows/new?template=${t.k}`}>
                <b>{t.name}</b>
                <span className="dots">
                  {t.ch.map((k) => (
                    <Dot key={k} k={k} />
                  ))}
                </span>
                <small>{t.k === "blank" ? "Start from scratch" : `${t.steps} steps`}</small>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
