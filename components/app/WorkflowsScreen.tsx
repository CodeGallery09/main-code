"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Screen } from "./AppShell";
import { SearchIcon } from "./icons";
import { Dot, fmt, Tabs } from "./ui";
import { channelNames, STATUS_TAG, type WorkflowSummary } from "@/lib/app/workflowLibrary";
import { SampleBanner } from "./SampleBanner";
import { api, fieldErrorsOf } from "@/lib/api";
import { toChannel } from "@/lib/app/adapt";
import { graphFromTemplate, TEMPLATES } from "@/lib/app/workflow";
import type { WorkflowStatus } from "@/lib/app/workflow";

type Filter = "all" | WorkflowStatus;

/**
 * The workflow library: every reusable multichannel sequence in the workspace.
 * Campaigns run a workflow; this is where the sequences themselves live.
 */
export function WorkflowsScreen({ workflows }: { workflows: WorkflowSummary[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [jump, setJump] = useState("");
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
        <select
          className="sel pill"
          aria-label="Jump to a campaign's workflow"
          value={jump}
          onChange={(e) => {
            const id = e.target.value;
            setJump(id);
            if (id) router.push(`/dashboard/workflows/${id}`);
          }}
        >
          <option value="">Go to campaign…</option>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
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
      </div>

      <SampleBanner onRemoved={() => router.refresh()} />

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
              <span>
                {w.isSample && <span className="tag" style={{ marginRight: 6 }}>Sample</span>}
                <span className={"tag " + STATUS_TAG[w.status].tone}>{STATUS_TAG[w.status].label}</span>
              </span>
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
          {workflows.length ? "No workflows match that filter." : "No workflows yet. Start one from a template."}
        </p>
      )}

      {picking && <TemplatePicker onClose={() => setPicking(false)} />}
    </Screen>
  );
}

/**
 * Start from a template. A workflow belongs to a campaign, so picking one creates a draft
 * multichannel campaign and its workflow together, then opens the builder on it.
 */
function TemplatePicker({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function start(key: string, label: string, templateChannels: readonly string[]) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const name = key === "blank" ? "Untitled workflow" : label;
      // A multichannel campaign needs two or more channels. A blank workflow has none yet, so it
      // starts with the two the product can connect; the steps decide what it really uses.
      const channels =
        templateChannels.length >= 2
          ? templateChannels.map((k) => toChannel(k as Parameters<typeof toChannel>[0]))
          : (["linkedin", "email"] as const);
      const { campaign } = await api.createCampaign({ name, type: "multichannel", status: "draft", channels: [...channels] });
      await api.saveWorkflow(campaign.id, { name, graph: graphFromTemplate(key) });
      router.push(`/dashboard/workflows/${campaign.id}`);
    } catch (caught) {
      const fields = fieldErrorsOf(caught);
      setError(fields ? Object.values(fields)[0] : caught instanceof Error ? caught.message : "Could not start that workflow.");
      setBusy(null);
    }
  }

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
            Pick a proven shape, then edit every step in the builder. It is saved as a draft campaign.
          </p>
          {error && (
            <p className="empty" role="alert">
              {error}
            </p>
          )}
          <div className="tplgrid">
            {TEMPLATES.map((t) => (
              <button
                key={t.k}
                type="button"
                className="tpl"
                disabled={busy !== null}
                aria-busy={busy === t.k}
                onClick={() => void start(t.k, t.name, t.ch)}
              >
                <b>{t.name}</b>
                <span className="dots">
                  {t.ch.map((k) => (
                    <Dot key={k} k={k} />
                  ))}
                </span>
                <small>{busy === t.k ? "Creating…" : t.k === "blank" ? "Start from scratch" : `${t.steps} steps`}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
