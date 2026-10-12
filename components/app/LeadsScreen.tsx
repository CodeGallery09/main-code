"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Lead, LeadStage, Paged } from "@/lib/data/types";
import {
  Avatar,
  DemoDataNote,
  ErrorNote,
  Loading,
  ScoreBadge,
  fmtNumber,
  fmtSince,
} from "@/components/app/ui";
import { ChevronDown, PlusIcon, SearchIcon, StarIcon } from "@/components/app/icons";

const STAGES: { id: LeadStage | "all"; label: string }[] = [
  { id: "all", label: "Any stage" },
  { id: "meeting", label: "Meeting" },
  { id: "hot", label: "Hot" },
  { id: "engaged", label: "Engaged" },
  { id: "reaching", label: "Reaching" },
  { id: "nurture", label: "Nurture" },
  { id: "closed", label: "Closed" },
];

const STAGE_PILL: Record<LeadStage, string> = {
  meeting: "pill-meeting",
  hot: "pill-hot",
  engaged: "pill-live",
  reaching: "pill-scheduled",
  nurture: "pill-draft",
  closed: "pill-draft",
};

/** Debounces the search box so typing doesn't fire a request per keystroke. */
function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return settled;
}

export function LeadsScreen({
  initial,
  owners,
  campaigns,
}: {
  initial: Paged<Lead>;
  owners: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const [stage, setStage] = useState<string>("all");
  const [ownerId, setOwnerId] = useState<string>("all");
  const [campaignId, setCampaignId] = useState<string>("all");
  const [sort, setSort] = useState<"score" | "name" | "updated">("score");
  const [page, setPage] = useState<Paged<Lead>>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      .leads({ q: debounced, stage, ownerId, campaignId, sort })
      .then((data) => live && (setPage(data), setError(null)))
      .catch((err: Error) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [debounced, stage, ownerId, campaignId, sort]);

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOnPage = page.items.length > 0 && page.items.every((lead) => selected.has(lead.id));
  const toggleAll = () =>
    setSelected(allOnPage ? new Set() : new Set(page.items.map((lead) => lead.id)));

  return (
    <div className="space-y-3.5">
      {/* ---------- filters ---------- */}
      <section className="lg lg-sheen lg-in r-xl flex flex-wrap items-center gap-2.5 px-4 py-3.5">
        <div className="relative min-w-[200px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="ginput pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search leads, companies, tags"
            aria-label="Search leads"
          />
        </div>

        <Select value={campaignId} onChange={setCampaignId} label="Campaign">
          <option value="all">All campaigns</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </Select>

        <Select value={ownerId} onChange={setOwnerId} label="Owner">
          <option value="all">Any owner</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </Select>

        <Select value={stage} onChange={setStage} label="Stage">
          {STAGES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </Select>

        <Select value={sort} onChange={(value) => setSort(value as typeof sort)} label="Sort by">
          <option value="score">Top score</option>
          <option value="updated">Recently active</option>
          <option value="name">Name A–Z</option>
        </Select>

        <button type="button" className="gbtn gbtn-solid ml-auto">
          <PlusIcon />
          Add leads
        </button>
      </section>

      {/* ---------- table ---------- */}
      <section className="lg lg-sheen lg-in r-xl overflow-hidden" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p className="text-[13px] text-muted">
            {selected.size
              ? `${selected.size} selected`
              : `${fmtNumber(page.total)} ${page.total === 1 ? "lead" : "leads"}`}
          </p>
          {selected.size > 0 && (
            <div className="flex items-center gap-1.5">
              <button type="button" className="gbtn gbtn-sm">Add to campaign</button>
              <button type="button" className="gbtn gbtn-sm">Assign owner</button>
              <button type="button" className="gbtn gbtn-sm gbtn-quiet" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
          )}
        </div>

        {error && <div className="p-4"><ErrorNote message={error} /></div>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="thead border-y border-black/[0.06]">
                <th scope="col" className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={allOnPage}
                    onChange={toggleAll}
                    aria-label="Select all leads on this page"
                    className="h-4 w-4 accent-black"
                  />
                </th>
                <th scope="col" className="px-2 py-2.5 font-medium">Lead</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Stage</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Score</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Source</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Tags</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Owner</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Activity</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Next step</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((lead) => (
                <tr key={lead.id} className="row-hover border-b border-black/[0.05] last:border-0">
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggle(lead.id)}
                      aria-label={`Select ${lead.name}`}
                      className="h-4 w-4 accent-black"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={lead.initials} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-[14px] font-semibold text-ink">
                          {lead.name}
                          {lead.starred && <StarIcon filled className="h-3.5 w-3.5 text-ink-2" />}
                        </p>
                        <p className="truncate text-[12.5px] text-muted">{lead.company}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <span className={`pill ${STAGE_PILL[lead.stage]} capitalize`}>{lead.stage}</span>
                  </td>
                  <td className="px-2 py-3"><ScoreBadge score={lead.score} /></td>
                  <td className="px-2 py-3">
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                      {lead.source}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-1">
                      {lead.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="pill h-[22px] !px-2 text-[11.5px]">{tag}</span>
                      ))}
                      {lead.tags.length > 2 && (
                        <span className="pill h-[22px] !px-2 text-[11.5px]">+{lead.tags.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-[13px] text-ink-2">{lead.ownerName}</td>
                  <td className="px-2 py-3 text-[12.5px] text-muted">
                    <span className="tabular-nums">{lead.messageCount} msg</span>
                    {lead.callCount > 0 && <span className="tabular-nums"> · {lead.callCount} call</span>}
                    <span className="block">{fmtSince(lead.updatedAt)}</span>
                  </td>
                  <td className="px-2 py-3 text-[13px] text-ink">{lead.nextStep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && <div className="p-4"><Loading rows={2} /></div>}
        {!loading && !page.items.length && (
          <p className="px-4 py-14 text-center text-[14px] text-muted">
            No leads match those filters.
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] px-4 py-3">
          <DemoDataNote />
          <p className="text-[12.5px] text-muted">
            Page {page.page} · {fmtNumber(page.total)} total
          </p>
        </div>
      </section>
    </div>
  );
}

function Select({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        className="ginput w-auto min-w-[140px]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}
