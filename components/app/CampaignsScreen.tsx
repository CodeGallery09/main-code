"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Campaign, CampaignStatus } from "@/lib/data/types";
import type { CampaignTotals } from "@/lib/data/repository";
import {
  CHANNEL_LABEL,
  ChannelDots,
  DemoDataNote,
  ErrorNote,
  Segmented,
  Switch,
  fmtDate,
  fmtNumber,
} from "@/components/app/ui";
import { PlusIcon, SearchIcon } from "@/components/app/icons";

const STATUS_PILL: Record<CampaignStatus, string> = {
  live: "pill-live",
  scheduled: "pill-scheduled",
  paused: "pill-paused",
  draft: "pill-draft",
};

export function CampaignsScreen({
  initialItems,
  initialTotals,
}: {
  initialItems: Campaign[];
  initialTotals: CampaignTotals;
}) {
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(initialItems);
  const [totals, setTotals] = useState(initialTotals);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      api
        .campaigns({ status, type, q: query })
        .then((data) => {
          setItems(data.items);
          setTotals(data.totals);
          setError(null);
        })
        .catch((err: Error) => setError(err.message));
    }, 220);
    return () => clearTimeout(id);
  }, [status, type, query]);

  const counts = (value: CampaignStatus) => initialItems.filter((c) => c.status === value).length;

  const toggle = async (campaign: Campaign) => {
    const next: CampaignStatus = campaign.status === "live" ? "paused" : "live";
    setItems((rows) => rows.map((row) => (row.id === campaign.id ? { ...row, status: next } : row)));
    try {
      await api.setCampaignStatus(campaign.id, next);
    } catch (err) {
      setItems((rows) =>
        rows.map((row) => (row.id === campaign.id ? { ...row, status: campaign.status } : row)),
      );
      setError((err as Error).message);
    }
  };

  const summary = [
    { label: "Leads", value: fmtNumber(totals.leads) },
    { label: "Delivered", value: fmtNumber(totals.delivered) },
    { label: "Open rate", value: totals.openRate !== null ? `${totals.openRate}%` : "—" },
    { label: "Reply rate", value: totals.replyRate !== null ? `${totals.replyRate}%` : "—" },
  ];

  return (
    <div className="space-y-3.5">
      {/* ---------- controls ---------- */}
      <section className="lg lg-sheen lg-in r-xl flex flex-wrap items-center gap-2.5 px-4 py-3.5">
        <Segmented
          label="Filter by status"
          value={status}
          onChange={setStatus}
          items={[
            { id: "all", label: "All", count: initialItems.length },
            { id: "live", label: "Live", count: counts("live") },
            { id: "scheduled", label: "Scheduled", count: counts("scheduled") },
            { id: "paused", label: "Paused", count: counts("paused") },
            { id: "draft", label: "Draft", count: counts("draft") },
          ]}
        />
        <Segmented
          label="Filter by type"
          value={type}
          onChange={setType}
          items={[
            { id: "all", label: "All types" },
            { id: "standalone", label: "Standalone" },
            { id: "multichannel", label: "Multichannel" },
          ]}
        />
        <div className="relative min-w-[180px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            className="ginput pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search campaigns"
            aria-label="Search campaigns"
          />
        </div>
        <button type="button" className="gbtn gbtn-solid">
          <PlusIcon />
          Create campaign
        </button>
      </section>

      {/* ---------- totals ---------- */}
      <section aria-label="Totals for the current filter" className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {summary.map((item, i) => (
          <div
            key={item.label}
            className="lg lg-sheen lg-in r-lg px-5 py-4"
            style={{ "--i": i + 1 } as React.CSSProperties}
          >
            <p className="thead">{item.label}</p>
            <p className="metric-value mt-2">{item.value}</p>
          </div>
        ))}
      </section>

      {error && <ErrorNote message={error} />}

      {/* ---------- table ---------- */}
      <section className="lg lg-sheen lg-in r-xl overflow-hidden" style={{ "--i": 5 } as React.CSSProperties}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="thead border-b border-black/[0.06]">
                <th scope="col" className="w-16 px-4 py-2.5 font-medium">On</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Campaign</th>
                <th scope="col" className="px-2 py-2.5 font-medium">Status</th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium">Leads</th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium">Sent</th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium">Delivered</th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium">Open</th>
                <th scope="col" className="px-2 py-2.5 text-right font-medium">Reply</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {items.map((campaign) => (
                <tr key={campaign.id} className="row-hover border-b border-black/[0.05] last:border-0">
                  <td className="px-4 py-3">
                    <Switch
                      checked={campaign.status === "live"}
                      onChange={() => toggle(campaign)}
                      disabled={campaign.status === "draft"}
                      label={`${campaign.status === "live" ? "Pause" : "Resume"} ${campaign.name}`}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <p className="text-[14px] font-semibold text-ink">{campaign.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
                      <ChannelDots channels={campaign.channels} />
                      {campaign.type === "multichannel"
                        ? `Multichannel${campaign.version ? ` · ${campaign.version}` : ""}`
                        : CHANNEL_LABEL[campaign.channels[0]]}
                      {" · "}
                      {campaign.status === "scheduled" ? "Starts" : "Started"} {fmtDate(campaign.startedAt)}
                    </p>
                  </td>
                  <td className="px-2 py-3">
                    <span className={`pill ${STATUS_PILL[campaign.status]} capitalize`}>{campaign.status}</span>
                  </td>
                  <Num value={campaign.leads} />
                  <Num value={campaign.sent} />
                  <Num value={campaign.delivered} />
                  <Num value={campaign.openRate} suffix="%" />
                  <Num value={campaign.replyRate} suffix="%" />
                  <Num value={campaign.clicks} className="px-4" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && (
          <p className="px-4 py-14 text-center text-[14px] text-muted">No campaigns match those filters.</p>
        )}
        <div className="border-t border-black/[0.06] px-4 py-3">
          <DemoDataNote />
        </div>
      </section>
    </div>
  );
}

function Num({
  value,
  suffix = "",
  className = "px-2",
}: {
  value: number | null;
  suffix?: string;
  className?: string;
}) {
  return (
    <td className={`${className} py-3 text-right text-[13.5px] tabular-nums text-ink`}>
      {value === null ? <span className="text-muted">—</span> : `${fmtNumber(value, suffix ? 1 : 0)}${suffix}`}
    </td>
  );
}
