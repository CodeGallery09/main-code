"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Screen } from "./AppShell";
import { CheckIcon, SearchIcon } from "./icons";
import { Avatar } from "./ui";
import { LeadEditor, type LeadDraft } from "./LeadEditor";
import { UploadLeads } from "./leads/UploadLeads";
import { api, fieldErrorsOf } from "@/lib/api";
import { onSegmentSaved, segmentSaved } from "@/lib/app/segments";
import { ATTRIBUTES } from "@/lib/leads/validation";
import type { Segment } from "@/lib/leads/segments";
import { toAppLead, toStage, type AppLead } from "@/lib/app/adapt";
import { maskPhone, scoreBand, STAGE_COLOR, tagColors, type Stage } from "@/lib/app/leads";
import type { Campaign, Workspace } from "@/lib/data/types";

const STAGES: [Stage | "any", string][] = [
  ["any", "Any status"],
  ["Hot", "Hot"],
  ["Meeting", "Meeting"],
  ["Engaged", "Engaged"],
  ["Reaching", "Reaching"],
  ["New", "New"],
  ["Nurture", "Nurture"],
  ["Paused", "Paused"],
  ["Closed", "Closed"],
  ["Stopped", "Not interested"],
];

/** Pill tint per stage; the text colour comes from STAGE_COLOR. */
const STAGE_TINT: Record<Stage, string> = {
  Hot: "rgba(178,78,38,.14)",
  Meeting: "rgba(79,107,69,.16)",
  Engaged: "rgba(201,146,46,.18)",
  Reaching: "rgba(24,26,30,.07)",
  New: "rgba(24,26,30,.07)",
  Nurture: "rgba(185,162,124,.22)",
  Paused: "rgba(24,26,30,.07)",
  Stopped: "rgba(24,26,30,.07)",
  Closed: "rgba(79,107,69,.16)",
};

/** Columns the database can sort on. `avgCall` and `msgs` are not indexed sorts, so they stay
 *  client-side over the current page — the header makes no promise about the whole set. */
type ServerSort = "name" | "score" | "updated";
type SortKey = ServerSort | "avgCall" | "msgs";
const SERVER_SORTS: SortKey[] = ["name", "score", "updated"];

const PAGE_SIZE = 25;

export function LeadsScreen() {
  const [query, setQuery] = useState("");
  const [campaign, setCampaign] = useState("any");
  const [owner, setOwner] = useState("any");
  const [stage, setStage] = useState<Stage | "any">("any");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AppLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<LeadDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [members, setMembers] = useState<Workspace["members"]>([]);

  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [uploading, setUploading] = useState(false);

  // Segments come from the API, so an upload made anywhere in the app shows up here.
  const loadSegments = useCallback(() => {
    api
      .segments()
      .then((r) => setSegments(r.segments))
      .catch(() => setSegments([]));
  }, []);
  useEffect(() => {
    loadSegments();
    return onSegmentSaved(() => loadSegments());
  }, [loadSegments]);

  // Debounced so typing in the search box does not fire a request per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Any filter change puts us back on page 1; staying on page 4 of a narrower set shows nothing.
  useEffect(() => setPage(1), [debouncedQuery, campaign, owner, stage, sort.key, sort.dir]);

  /** Guards against an out-of-order response overwriting a newer one. */
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const serverSort: ServerSort = SERVER_SORTS.includes(sort.key) ? (sort.key as ServerSort) : "score";
      const result = await api.leads({
        q: debouncedQuery || undefined,
        stage: stage === "any" ? undefined : toStage(stage),
        ownerId: owner === "any" ? undefined : owner,
        campaignId: campaign === "any" ? undefined : campaign,
        sort: serverSort,
        dir: sort.dir === 1 ? "asc" : "desc",
        page,
        pageSize: PAGE_SIZE,
      });
      if (id !== requestId.current) return;
      setRows(result.items.map(toAppLead));
      setTotal(result.total);
      setError(null);
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : "Could not load leads.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [debouncedQuery, stage, owner, campaign, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // The filter dropdowns' options, fetched once.
  useEffect(() => {
    void (async () => {
      try {
        const [campaignList, me] = await Promise.all([api.campaigns(), api.me()]);
        setCampaigns(campaignList.items);
        setMembers(me.workspace.members);
      } catch {
        // Filters degrade to "all"; the table itself still works.
      }
    })();
  }, []);

  const sorted = useMemo(() => {
    // Server sorts are already applied; only the two client-side keys need work here.
    if (SERVER_SORTS.includes(sort.key)) return rows;
    const value = (lead: AppLead) => (sort.key === "avgCall" ? (lead.avgCall ?? -1) : lead.msgs);
    return [...rows].sort((a, b) => (value(a) - value(b)) * sort.dir);
  }, [rows, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : "↕");

  const allPicked = picked.length === sorted.length && sorted.length > 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Starring writes through to the database rather than living in component state. */
  async function toggleStar(lead: AppLead) {
    setBusyId(lead.id);
    // Optimistic: the star responds immediately and is rolled back if the write fails.
    setRows((current) => current.map((r) => (r.id === lead.id ? { ...r, fav: !r.fav } : r)));
    try {
      await api.updateLead(lead.id, { starred: !lead.fav });
    } catch {
      setRows((current) => current.map((r) => (r.id === lead.id ? { ...r, fav: lead.fav } : r)));
      setError("Could not save that change.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeLead(lead: AppLead) {
    if (!window.confirm(`Delete ${lead.n}? This cannot be undone.`)) return;
    setBusyId(lead.id);
    try {
      await api.deleteLead(lead.id);
      setPicked((p) => p.filter((id) => id !== lead.id));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete that lead.");
    } finally {
      setBusyId(null);
    }
  }

  async function save(draft: LeadDraft) {
    const payload = {
      name: draft.name,
      company: draft.company,
      title: draft.title,
      email: draft.email || null,
      phone: draft.phone || null,
      stage: toStage(draft.stage),
      score: draft.score,
      source: draft.source,
      tags: draft.tags,
      consent: draft.consent,
      nextStep: draft.nextStep,
      campaignId: draft.campaignId || null,
      ownerId: draft.ownerId || undefined,
    };
    try {
      if (draft.id) await api.updateLead(draft.id, payload);
      else await api.createLead(payload);
      setEditing(null);
      await load();
      return null;
    } catch (caught) {
      // A 422 comes back as per-field messages the editor shows inline.
      return fieldErrorsOf(caught) ?? { _: caught instanceof Error ? caught.message : "Could not save." };
    }
  }

  return (
    <Screen title="Leads">
      <div className="lfilters">
        <label className="q wide">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search leads, companies, tags"
            aria-label="Search leads"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <select
          className="sel pill"
          aria-label="Campaign"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
        >
          <option value="any">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select className="sel pill" aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="any">Any owner</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <select
          className="sel pill hide-m"
          aria-label="Status"
          value={stage}
          onChange={(e) => setStage(e.target.value as Stage | "any")}
        >
          {STAGES.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        <button className="ib more" aria-label="More actions">
          ⋯
        </button>
        <button className="btn line" onClick={() => setUploading(true)}>
          Upload leads
        </button>
        <button className="btn pri" onClick={() => setEditing({ ...EMPTY_DRAFT })}>
          New lead
        </button>
      </div>

      {error && (
        <p className="empty" role="status">
          {error}{" "}
          <button className="sortb" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      <SegmentList segments={segments} onUpload={() => setUploading(true)} />

      <div className="card ltable" aria-busy={loading}>
        <div className="tblw">
          <table className="tbl leads">
            <thead>
              <tr>
                <th className="c-n">
                  <span className="hn">
                    <button
                      className={"cb" + (allPicked ? " on" : "")}
                      aria-label="Select all"
                      onClick={() => setPicked(allPicked ? [] : sorted.map((r) => r.id))}
                    >
                      <CheckIcon />
                    </button>
                    <button className={"sortb" + (sort.key === "name" ? " on" : "")} onClick={() => toggleSort("name")}>
                      Lead name<span className="arr">{arrow("name")}</span>
                    </button>
                  </span>
                </th>
                <th>Status</th>
                <th>
                  <button className={"sortb" + (sort.key === "score" ? " on" : "")} onClick={() => toggleSort("score")}>
                    Score<span className="arr">{arrow("score")}</span>
                  </button>
                </th>
                <th className="c-src">Source</th>
                <th className="c-tags">Tags</th>
                <th className="c-mid c-cons">Consent</th>
                <th className="c-mid">
                  <button
                    className={"sortb" + (sort.key === "avgCall" ? " on" : "")}
                    onClick={() => toggleSort("avgCall")}
                  >
                    Avg call<span className="arr">{arrow("avgCall")}</span>
                  </button>
                </th>
                <th className="c-mid c-fu">
                  <button className={"sortb" + (sort.key === "msgs" ? " on" : "")} onClick={() => toggleSort("msgs")}>
                    Follow-ups<span className="arr">{arrow("msgs")}</span>
                  </button>
                </th>
                <th className="c-next">Next step</th>
                <th className="c-act" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((lead) => {
                const visible = lead.tags.slice(0, 2);
                const extra = lead.tags.length - visible.length;
                return (
                  <tr className="click" key={lead.id} aria-busy={busyId === lead.id}>
                    <td className="c-n">
                      <div className="lname">
                        <button
                          className={"cb" + (picked.includes(lead.id) ? " on" : "")}
                          aria-label={`Select ${lead.n}`}
                          onClick={() =>
                            setPicked((p) =>
                              p.includes(lead.id) ? p.filter((id) => id !== lead.id) : [...p, lead.id],
                            )
                          }
                        >
                          <CheckIcon />
                        </button>
                        <Avatar name={lead.n} />
                        <div className="nm">
                          <span className="row1">
                            <b title={lead.t ? `${lead.n} · ${lead.t}` : lead.n}>{lead.n}</b>
                            <button
                              className="star"
                              aria-label={lead.fav ? `Unstar ${lead.n}` : `Star ${lead.n}`}
                              aria-pressed={lead.fav}
                              disabled={busyId === lead.id}
                              onClick={() => void toggleStar(lead)}
                            >
                              {lead.fav ? "★" : "☆"}
                            </button>
                          </span>
                          <small className="num">{lead.ph ? maskPhone(lead.ph) : lead.c}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button className="pillbtn" aria-label={`Status: ${lead.stage}`}>
                        <span
                          className="spill"
                          style={{ background: STAGE_TINT[lead.stage], color: STAGE_COLOR[lead.stage] }}
                        >
                          {lead.stage}
                        </span>
                        <span className="chev">⌄</span>
                      </button>
                    </td>
                    <td>
                      <span className={"scoren " + scoreBand(lead.score)}>{lead.score}</span>
                    </td>
                    <td className="c-src">
                      <span className="src">{lead.src}</span>
                    </td>
                    <td className="c-tags">
                      <div className="tagcell">
                        <div className="tagstack">
                          {visible.map((tag) => {
                            const [bg, fg] = tagColors(tag);
                            return (
                              <span className="ltag" title={tag} key={tag} style={{ background: bg, color: fg }}>
                                {tag}
                              </span>
                            );
                          })}
                        </div>
                        {extra > 0 && <button className="more-n">+{extra}</button>}
                      </div>
                    </td>
                    <td className="c-mid c-cons">{lead.consent ? "Yes" : "No"}</td>
                    <td className="c-mid num">{lead.avgCall ? `${lead.avgCall}s` : "—"}</td>
                    <td className="c-mid c-fu">
                      <span className="fu">
                        <span className="fuc" title="Messages">
                          {lead.msgs} msg
                        </span>
                        <span className="fuc" title="Calls">
                          {lead.calls} call
                        </span>
                      </span>
                    </td>
                    <td className="c-next">{lead.next}</td>
                    <td className="c-act">
                      <span className="fu">
                        <button
                          className="sortb"
                          aria-label={`Edit ${lead.n}`}
                          onClick={() => setEditing(draftOf(lead))}
                        >
                          Edit
                        </button>
                        <button
                          className="sortb"
                          aria-label={`Delete ${lead.n}`}
                          disabled={busyId === lead.id}
                          onClick={() => void removeLead(lead)}
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

        {/* A failed load is not an empty list, and an empty workspace is not a filter that matched
            nothing. The error banner above covers the first, so say nothing here. */}
        {sorted.length === 0 && !loading && !error &&
          (stage !== "any" || owner !== "any" || campaign !== "any" || debouncedQuery ? (
            <p className="empty">No leads match those filters.</p>
          ) : (
            <p className="empty">
              <b>No leads yet</b>
              <span>Add a lead with New lead, or upload a .csv or .xlsx file.</span>
            </p>
          ))}
        {loading && sorted.length === 0 && <p className="empty">Loading leads…</p>}

        {pages > 1 && (
          <div className="lfilters" style={{ justifyContent: "flex-end" }}>
            <button className="sortb" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Previous
            </button>
            <span className="src">
              Page {page} of {pages} · {total} leads
            </span>
            <button className="sortb" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>

      {uploading && (
        <UploadLeads
          onClose={() => setUploading(false)}
          onSaved={(segment) => {
            segmentSaved(segment);
            loadSegments();
            void load();
          }}
        />
      )}

      {editing && (
        <LeadEditor
          draft={editing}
          campaigns={campaigns}
          members={members}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </Screen>
  );
}

const EMPTY_DRAFT: LeadDraft = {
  id: null,
  name: "",
  company: "",
  title: "",
  email: "",
  phone: "",
  stage: "New",
  score: 0,
  source: "form",
  tags: [],
  consent: false,
  nextStep: "",
  campaignId: "",
  ownerId: "",
};

/** The editor edits a flat draft, so a row is flattened on the way in. */
function draftOf(lead: AppLead): LeadDraft {
  return {
    id: lead.id,
    name: lead.n,
    company: lead.c,
    title: lead.t,
    email: lead.email,
    phone: lead.ph ?? "",
    stage: lead.stage,
    score: lead.score,
    source: lead.source,
    // The derived "Title: …" chip is display-only; it must not be saved back as a real tag.
    tags: lead.tags.filter((tag) => !tag.startsWith("Title:")),
    consent: lead.consent,
    nextStep: lead.next === "—" ? "" : lead.next,
    campaignId: lead.campaignId ?? "",
    ownerId: lead.ownerId,
  };
}

const kb = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Segments uploaded from a file. The counts are the ones the upload summary
 * showed: reachable leads per channel, never the raw row count.
 */
function SegmentList({ segments, onUpload }: { segments: Segment[] | null; onUpload: () => void }) {
  if (segments === null) return null;

  return (
    <div className="card segs">
      <div className="segs-h">
        <div>
          <span className="eyebrow">File segments</span>
          <p className="hint">Uploaded lists, with the leads each one can actually reach.</p>
        </div>
        <button className="btn line sm" onClick={onUpload}>
          Upload leads
        </button>
      </div>

      {segments.length === 0 ? (
        <p className="empty">
          <b>No segments yet</b>
          <span>Upload a .csv or .xlsx file and map its columns to start one.</span>
        </p>
      ) : (
        <div className="seglist">
          {segments.map((segment) => (
            <div className="segcard" key={segment.id}>
              <div className="seg-t">
                <b>{segment.name}</b>
                <span className="spill segpill">
                  {segment.reachableRows.toLocaleString("en-US")} reachable
                </span>
              </div>
              {segment.description && <p className="hint">{segment.description}</p>}
              <div className="segmeta">
                {segment.channels
                  .filter((c) => c.column)
                  .map((c) => (
                    <span className="segch" key={c.attribute}>
                      {ATTRIBUTES.find((a) => a.key === c.attribute)?.label || c.attribute}
                      <b>{c.reachable.toLocaleString("en-US")}</b>
                    </span>
                  ))}
              </div>
              <small className="hint">
                {segment.fileName} · {kb(segment.fileSize)} · {segment.totalRows.toLocaleString("en-US")} rows ·{" "}
                {segment.profilesCreated.toLocaleString("en-US")} new profiles,{" "}
                {segment.profilesMerged.toLocaleString("en-US")} merged into existing leads
              </small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
