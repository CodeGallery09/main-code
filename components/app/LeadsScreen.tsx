"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Screen } from "./AppShell";
import { SearchIcon } from "./icons";
import { Avatar } from "./ui";
import { LeadEditor, type LeadDraft } from "./LeadEditor";
import { UploadLeads } from "./leads/UploadLeads";
import { ProspectDrawer } from "./leads/ProspectDrawer";
import { api, fieldErrorsOf } from "@/lib/api";
import { onSegmentSaved, segmentSaved } from "@/lib/app/segments";
import { ATTRIBUTES } from "@/lib/leads/validation";
import type { Segment } from "@/lib/leads/segments";
import { toAppLead, type AppLead } from "@/lib/app/adapt";
import { maskPhone, scoreBand } from "@/lib/app/leads";
import type { Campaign, Workspace } from "@/lib/data/types";

/**
 * Columns the database can sort on, which is now all of them.
 *
 * The table used to carry "Avg call" and "Follow-ups" as well. Both are empty for every lead until
 * calling and sending exist, and neither is an indexed sort, so their headers sorted the visible
 * page while appearing to sort the whole set.
 */
type SortKey = "name" | "score" | "updated";

const PAGE_SIZE = 25;

export function LeadsScreen() {
  /** Home's to-dos and the Inbox link here with a lead, so its profile opens straight away. */
  const asked = useSearchParams().get("lead");
  const [query, setQuery] = useState("");
  const [campaign, setCampaign] = useState("any");
  const [owner, setOwner] = useState("any");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AppLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<LeadDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [members, setMembers] = useState<Workspace["members"]>([]);

  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [uploading, setUploading] = useState(false);
  /** The audience (uploaded segment) the table is narrowed to, or "any". */
  const [audience, setAudience] = useState("any");
  /** The lead whose profile drawer is open. */
  const [viewing, setViewing] = useState<string | null>(asked);

  // Segments come from the API, so an upload made anywhere in the app (the rail's Import audience
  // too) shows up here, and the import lands the user on the new audience.
  const loadSegments = useCallback(() => {
    api
      .segments()
      .then((r) => {
        setSegments(r.segments);
        // An audience that no longer exists can't stay selected.
        setAudience((current) => (current === "any" || r.segments.some((s) => s.id === current) ? current : "any"));
      })
      .catch(() => setSegments([]));
  }, []);
  useEffect(() => {
    loadSegments();
    return onSegmentSaved((segment) => {
      loadSegments();
      setAudience(segment.id);
    });
  }, [loadSegments]);

  // Debounced so typing in the search box does not fire a request per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Any filter change puts us back on page 1; staying on page 4 of a narrower set shows nothing.
  useEffect(() => setPage(1), [debouncedQuery, campaign, owner, audience, sort.key, sort.dir]);

  /** Guards against an out-of-order response overwriting a newer one. */
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await api.leads({
        q: debouncedQuery || undefined,
        ownerId: owner === "any" ? undefined : owner,
        campaignId: campaign === "any" ? undefined : campaign,
        segmentId: audience === "any" ? undefined : audience,
        sort: sort.key,
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
  }, [debouncedQuery, owner, campaign, audience, sort, page]);

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

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : "↕");

  const current = audience === "any" ? null : (segments?.find((s) => s.id === audience) ?? null);
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
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete that lead.");
    } finally {
      setBusyId(null);
    }
  }

  async function save(draft: LeadDraft) {
    // Only what the form asks for. The server fills the rest on a create (stage `new`, source
    // `form`, owned by whoever added it) and an edit leaves everything else as it was.
    const payload = {
      name: draft.name,
      email: draft.email || null,
      phone: draft.phone || null,
      linkedin: draft.linkedin || null,
      consent: draft.consent,
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
            placeholder="Search name, company or email"
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

      <AudienceList
        segments={segments}
        selected={audience}
        onSelect={setAudience}
        onUpload={() => setUploading(true)}
      />

      {current && (
        <p className="aud-cur" role="status">
          <span>
            {loading
              ? "Loading leads in "
              : `${total.toLocaleString("en-US")} ${total === 1 ? "lead" : "leads"} in `}
            <b>{current.name}</b>
          </span>
          <button className="sortb" onClick={() => setAudience("any")}>
            Show all leads
          </button>
        </p>
      )}

      <div className="card ltable" aria-busy={loading}>
        <div className="tblw">
          <table className="tbl leads">
            <thead>
              <tr>
                <th className="c-n">
                  <span className="hn">
                    <button className={"sortb" + (sort.key === "name" ? " on" : "")} onClick={() => toggleSort("name")}>
                      Lead name<span className="arr">{arrow("name")}</span>
                    </button>
                  </span>
                </th>
                <th>
                  <button
                    className={"sortb" + (sort.key === "score" ? " on" : "")}
                    title="Higher means the lead has engaged more recently and more often. Open a lead to see what moved it."
                    onClick={() => toggleSort("score")}
                  >
                    Score<span className="arr">{arrow("score")}</span>
                  </button>
                </th>
                <th>Email</th>
                <th>LinkedIn</th>
                <th className="c-mid c-cons">Consent</th>
                <th className="c-act" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => {
                return (
                  <tr
                    className="click"
                    key={lead.id}
                    aria-busy={busyId === lead.id}
                    onClick={(e) => {
                      // The row's own controls (star, delete) keep their meaning.
                      if ((e.target as HTMLElement).closest("button, a, input")) return;
                      setViewing(lead.id);
                    }}
                  >
                    <td className="c-n">
                      <div className="lname">
                        <Avatar name={lead.n} />
                        <div className="nm">
                          <span className="row1">
                            <button
                              type="button"
                              className="pf-open"
                              title={lead.t ? `${lead.n} · ${lead.t}` : lead.n}
                              aria-label={`Open ${lead.n}'s profile`}
                              onClick={() => setViewing(lead.id)}
                            >
                              <b>{lead.n}</b>
                            </button>
                            {lead.isSample && (
                              <span className="tag" style={{ marginLeft: 6 }}>
                                Sample
                              </span>
                            )}
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
                      <span className={"scoren " + scoreBand(lead.score)}>{lead.score}</span>
                    </td>
                    <td>
                      {lead.email ? (
                        <span className="lcontact" title={lead.email}>
                          {lead.email}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {lead.li ? (
                        <a
                          className="lcontact"
                          href={linkedinHref(lead.li)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={lead.li}
                        >
                          {lead.li.replace(/^https?:\/\/(www\.)?/i, "")}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="c-mid c-cons">{lead.consent ? "Yes" : "No"}</td>
                    <td className="c-act">
                      <span className="fu">
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

        {/* Phones: the stylesheet hides the table below 820px and shows this list instead. */}
        <ul className="lcards" aria-label="Leads">
          {rows.map((lead) => (
            <li key={lead.id}>
              <button type="button" className="lc-btn" onClick={() => setViewing(lead.id)}>
                <Avatar name={lead.n} />
                <span className="lc-m">
                  <b>
                    {lead.n}
                    {lead.isSample && (
                      <span className="tag" style={{ marginLeft: 6 }}>
                        Sample
                      </span>
                    )}
                  </b>
                  <small>{[lead.t, lead.c].filter(Boolean).join(" · ") || lead.email || "—"}</small>
                </span>
                <span className="lc-r">
                  <span className={"scoren " + scoreBand(lead.score)}>{lead.score}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* A failed load is not an empty list, and an empty workspace is not a filter that matched
            nothing. The error banner above covers the first, so say nothing here. */}
        {rows.length === 0 &&
          !loading &&
          !error &&
          (owner !== "any" || campaign !== "any" || debouncedQuery ? (
            <p className="empty">No leads match those filters.</p>
          ) : audience !== "any" ? (
            <p className="empty">
              <b>No leads left in this audience</b>
              <span>Everyone it imported has since been deleted.</span>
            </p>
          ) : (
            <p className="empty">
              <b>No leads yet</b>
              <span>Import an audience from a .csv or .xlsx file, or add one with New lead.</span>
            </p>
          ))}
        {loading && rows.length === 0 && <p className="empty">Loading leads…</p>}

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

      {viewing && (
        <ProspectDrawer
          leadId={viewing}
          onClose={() => setViewing(null)}
          onOpen={setViewing}
          onEdit={(lead) => {
            setViewing(null);
            setEditing(draftOf(toAppLead(lead)));
          }}
        />
      )}

      {editing && (
        <LeadEditor
          draft={editing}
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
  email: "",
  phone: "",
  linkedin: "",
  consent: false,
};

/** The editor edits a flat draft, so a row is flattened on the way in. */
function draftOf(lead: AppLead): LeadDraft {
  return {
    id: lead.id,
    name: lead.n,
    email: lead.email,
    phone: lead.ph ?? "",
    linkedin: lead.li,
    consent: lead.consent,
  };
}

/** Stored URLs carry a scheme; an older row typed without one still has to open as a link. */
const linkedinHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

const kb = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * The workspace's audiences: one per imported file. Picking one narrows the lead table to the
 * people it holds. `leadCount` is the live membership (deleted leads drop out); the per-channel
 * figures are what the import's review showed.
 */
function AudienceList({
  segments,
  selected,
  onSelect,
  onUpload,
}: {
  segments: Segment[] | null;
  selected: string;
  onSelect: (id: string) => void;
  onUpload: () => void;
}) {
  if (segments === null) return null;

  return (
    <div className="card segs">
      <div className="segs-h">
        <div>
          <span className="eyebrow">Audiences</span>
          <p className="hint">Each imported file is an audience. Pick one to see its leads.</p>
        </div>
        <button className="btn line sm" onClick={onUpload}>
          Import audience
        </button>
      </div>

      {segments.length === 0 ? (
        <p className="empty">
          <b>No audiences yet</b>
          <span>Import a .csv or .xlsx file. You’ll review every row before anything is saved.</span>
        </p>
      ) : (
        <div className="seglist">
          <button
            type="button"
            className={"segcard aud-card aud-all" + (selected === "any" ? " on" : "")}
            aria-pressed={selected === "any"}
            onClick={() => onSelect("any")}
          >
            <span className="seg-t">
              <b>All leads</b>
            </span>
            <span className="hint">Everyone in the workspace, from every audience and added by hand.</span>
          </button>
          {segments.map((segment) => (
            <button
              type="button"
              className={"segcard aud-card" + (selected === segment.id ? " on" : "")}
              aria-pressed={selected === segment.id}
              key={segment.id}
              onClick={() => onSelect(segment.id)}
            >
              <span className="seg-t">
                <b>{segment.name}</b>
                <span className="spill segpill">
                  {segment.leadCount.toLocaleString("en-US")} {segment.leadCount === 1 ? "lead" : "leads"}
                </span>
              </span>
              {segment.description && <span className="hint">{segment.description}</span>}
              <span className="segmeta">
                {segment.channels
                  .filter((c) => c.column)
                  .map((c) => (
                    <span className="segch" key={c.attribute}>
                      {ATTRIBUTES.find((a) => a.key === c.attribute)?.label || c.attribute}
                      <b>{c.reachable.toLocaleString("en-US")}</b>
                    </span>
                  ))}
              </span>
              <small className="hint">
                {segment.fileName} · {kb(segment.fileSize)} · imported {shortDate(segment.createdAt)} ·{" "}
                {segment.profilesCreated.toLocaleString("en-US")} new, {segment.profilesMerged.toLocaleString("en-US")}{" "}
                matched existing
                {segment.excludedInJourney
                  ? `, ${segment.excludedInJourney.toLocaleString("en-US")} left out (already in a campaign)`
                  : ""}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
