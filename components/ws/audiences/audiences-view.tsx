"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  ExternalLink,
  FileText,
  FileUp,
  Plus,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Audience, Paged } from "@/lib/data/types";
import type { Segment } from "@/lib/audiences/segments";
import { shortDate } from "@/lib/ws/format";
import { useAsync } from "@/lib/ws/use-async";
import { cn, fmt } from "@/lib/ws/utils";
import { PageBody, PageHeader, TopBar } from "@/components/ws/shell/page";
import { Card, CardDescription, CardHeader, CardTitle, FILL } from "@/components/ws/ui/card";
import { Button } from "@/components/ws/ui/button";
import { Confirm } from "@/components/ws/ui/confirm";
import { StatusPill } from "@/components/ws/ui/status-pill";
import { Appear } from "@/components/ws/ui/motion";
import { EmptyState, LoadError, NativeSelect, SearchInput, Skeleton } from "@/components/ws/ui/misc";
import { UploadAudiences } from "./upload-audiences";
import { LeadDrawer } from "./lead-drawer";
import { LeadForm } from "./lead-form";

const COLS = "grid-cols-[minmax(200px,1.8fr)_minmax(150px,1.2fr)_72px_minmax(190px,1.4fr)_110px_120px_76px]";
const HEADS = ["Lead", "Company", "Score", "Email", "LinkedIn", "Consent", "Actions"];
const PAGE_SIZE = 12;

/** Score bands are presentational only — the score itself comes from the API. */
function scoreStyle(n: number) {
  if (n >= 80) return "bg-primary text-primary-foreground";
  if (n >= 60) return "bg-sunken text-foreground";
  return "bg-accent text-muted-foreground";
}

/**
 * Audiences — where prospect data comes in, and where every row can be seen
 * before it is used. The cards are the files that were uploaded; picking one
 * loads the leads it brought in.
 */
export function AudiencesView() {
  const [segmentId, setSegmentId] = useState<string>("all");
  const [q, setQ] = useState("");
  const [strategyId, setStrategyId] = useState("all");
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [openLead, setOpenLead] = useState<Audience | null>(null);
  /** `"new"` for an empty form, a lead for an edit, null for closed. */
  const [editing, setEditing] = useState<Audience | "new" | null>(null);
  const [removing, setRemoving] = useState<Audience | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const segments = useAsync(() => api.segments(), []);
  const strategies = useAsync(() => api.strategies(), []);
  const leads = useAsync<Paged<Audience>>(
    () => api.audiences({ segmentId, q, strategyId, page, pageSize: PAGE_SIZE, sort: "score", dir: "desc" }),
    [segmentId, q, strategyId, page],
  );

  const list = useMemo(() => segments.data?.segments ?? [], [segments.data]);
  const open = list.find((s) => s.id === segmentId) ?? null;
  const total = leads.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function select(id: string) {
    setSegmentId(id);
    setPage(1);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // Clipboard access can be refused; the address is on screen either way.
    }
  }

  async function remove(lead: Audience) {
    setBusy(true);
    try {
      await api.deleteAudience(lead.id);
      setRemoving(null);
      leads.reload();
      segments.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title="Audiences" />
      <PageBody>
        <Appear>
          <PageHeader
            title="Audiences"
            subtitle={
              leads.state === "ready"
                ? `${fmt(total)} ${total === 1 ? "lead" : "leads"} in ${open ? open.name : "this workspace"}. You review every row before it's saved.`
                : "Every row is reviewed before it's saved."
            }
            actions={
              <>
                <Button variant="outline" onClick={() => setEditing("new")}>
                  <Plus aria-hidden strokeWidth={2} />
                  Add a lead
                </Button>
                <Button onClick={() => setUploading(true)}>
                  <Upload aria-hidden strokeWidth={1.9} />
                  Upload audience
                </Button>
              </>
            }
          />
        </Appear>

        <Appear index={1}>
          <button
            type="button"
            onClick={() => setUploading(true)}
            className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-dashed border-input bg-chrome px-4 py-2 text-left transition-colors hover:border-primary"
          >
            <span className="flex size-[32px] shrink-0 items-center justify-center rounded-lg border border-border bg-card text-body">
              <FileUp aria-hidden className="size-[16px]" strokeWidth={1.7} />
            </span>
            <span className="flex min-w-0 flex-1 basis-[280px] flex-col gap-[3px]">
              <span className="text-[12.5px] font-semibold">Drop a .csv or .xlsx here</span>
              <span className="text-[11.5px] leading-[1.55] text-muted-foreground">
                We match the columns, flag duplicates against leads you already have, and show you everything before
                saving.
              </span>
            </span>
            <span className="inline-flex h-[30px] items-center rounded-lg border border-input bg-card px-[11px] text-[12px] font-medium">
              Choose a file
            </span>
          </button>
        </Appear>

        <Appear index={3}>
          <Card>
            <CardHeader>
              <div className="flex items-baseline gap-[10px]">
                <CardTitle>Your audiences</CardTitle>
                <CardDescription>Pick one to see its leads</CardDescription>
              </div>
            </CardHeader>
            <div className="flex gap-3 overflow-x-auto px-4 py-3 [&>*]:w-[290px] [&>*]:shrink-0">
              <AudienceCard
                name="All leads"
                source="Everyone in this workspace"
                rows={segments.state === "ready" ? null : null}
                usedBy=""
                selected={segmentId === "all"}
                onSelect={() => select("all")}
              />
              {segments.state === "loading"
                ? [0, 1].map((i) => <Skeleton key={i} className="h-[104px] rounded-[11px]" />)
                : list.map((s) => (
                    <AudienceCard
                      key={s.id}
                      name={s.name}
                      source={`${s.fileName} · ${shortDate(s.createdAt)}`}
                      rows={s.audienceCount}
                      usedBy={`${fmt(s.reachableRows)} reachable`}
                      selected={segmentId === s.id}
                      onSelect={() => select(s.id)}
                      segment={s}
                    />
                  ))}
            </div>
            {segments.state === "failed" && (
              <LoadError message="We couldn't load your audiences." onRetry={segments.reload} />
            )}
          </Card>
        </Appear>

        <Appear index={4} className={FILL}>
          <Card className={FILL}>
            <CardHeader>
              <div className="flex min-w-0 items-baseline gap-[10px]">
                <CardTitle>{open ? open.name : "All leads"}</CardTitle>
                <CardDescription>
                  {open ? open.description || `Imported from ${open.fileName}` : "Every lead in the workspace"}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SearchInput
                  id="lead-search"
                  placeholder="Search name, company or email"
                  value={q}
                  onChange={(v) => {
                    setQ(v);
                    setPage(1);
                  }}
                  className="w-[260px]"
                />
                <NativeSelect
                  id="aud-strategy"
                  label="Strategy"
                  hideLabel
                  value={strategyId}
                  onChange={(v) => {
                    setStrategyId(v);
                    setPage(1);
                  }}
                  options={[
                    { value: "all", label: "All strategies" },
                    ...(strategies.data?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
              </div>
            </CardHeader>

            <div className="overflow-x-auto lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <div className="min-w-[940px]">
                <div className={cn("sticky top-0 z-[1] grid items-center gap-3 border-b border-border bg-chrome px-4 py-[7px]", COLS)}>
                  {HEADS.map((h, i) => (
                    <span key={h} className={cn("label-mono text-[10.5px] tracking-[0.07em]", i === HEADS.length - 1 && "text-right")}>
                      {h}
                    </span>
                  ))}
                </div>

                {leads.state === "loading" ? (
                  Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className={cn("grid items-center gap-3 border-b border-divider px-4 py-[9px]", COLS)}>
                      <Skeleton className="h-[12px] w-[70%]" />
                      {HEADS.slice(1).map((h) => (
                        <Skeleton key={h} className="h-[12px]" />
                      ))}
                    </div>
                  ))
                ) : leads.state === "failed" ? (
                  <LoadError message="We couldn't load these leads." onRetry={leads.reload} />
                ) : leads.data.items.length === 0 ? (
                  <EmptyState>
                    {q || strategyId !== "all"
                      ? "No leads match this filter."
                      : "No leads here yet. Upload a .csv or .xlsx to add some."}
                  </EmptyState>
                ) : (
                  leads.data.items.map((lead) => (
                    <div key={lead.id} className={cn("grid items-center gap-3 border-b border-divider px-4 py-[8px]", COLS)}>
                      <button
                        type="button"
                        onClick={() => setOpenLead(lead)}
                        className="flex min-w-0 items-center gap-[10px] text-left"
                      >
                        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[11px] font-medium text-body">
                          {lead.initials}
                        </span>
                        <span className="flex min-w-0 flex-col gap-[2px]">
                          <span className="truncate text-[12.5px] font-medium hover:underline">{lead.name}</span>
                          <span className="truncate text-[11.5px] text-muted-foreground">{lead.title || "—"}</span>
                        </span>
                      </button>
                      <span className="truncate text-[11.5px]">{lead.company || "—"}</span>
                      <span
                        className={cn(
                          "inline-flex h-[22px] w-[34px] items-center justify-center rounded-sm font-mono text-[11.5px] font-bold",
                          scoreStyle(lead.score),
                        )}
                      >
                        {lead.score}
                      </span>
                      <span className="flex min-w-0 items-center gap-[6px]">
                        {lead.email ? (
                          <>
                            <span className="truncate text-[11.5px]">{lead.email}</span>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Copy ${lead.email}`}
                              className="size-[24px] text-muted-foreground"
                              onClick={() => void copy(lead.email as string)}
                            >
                              {copied === lead.email ? <Check aria-hidden strokeWidth={2.2} /> : <Copy aria-hidden strokeWidth={1.8} />}
                            </Button>
                          </>
                        ) : (
                          <span className="text-[11.5px] text-muted-foreground">No email on file</span>
                        )}
                      </span>
                      <span>
                        {lead.linkedin ? (
                          <a
                            href={lead.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-[6px] text-[11.5px] hover:underline"
                          >
                            <ExternalLink aria-hidden className="size-[13px] text-[var(--ch-linkedin)]" strokeWidth={2} />
                            Profile
                          </a>
                        ) : (
                          <span className="font-mono text-[11px] text-muted-foreground">—</span>
                        )}
                      </span>
                      <span>
                        {lead.consent ? (
                          <StatusPill tone="success">Opted in</StatusPill>
                        ) : (
                          <span className="inline-flex items-center gap-[5px] rounded-full bg-warning-bg px-[9px] py-[3px] text-[11px] font-medium text-warning">
                            <CircleAlert aria-hidden className="size-[12px]" strokeWidth={2.1} />
                            Needs check
                          </span>
                        )}
                      </span>
                      <span className="flex items-center justify-end gap-1">
                        <Button variant="danger" size="icon-sm" aria-label={`Delete ${lead.name}`} onClick={() => setRemoving(lead)}>
                          <Trash2 aria-hidden strokeWidth={1.8} />
                        </Button>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-[10px] border-t border-divider px-4 py-2">
              <span className="text-[11.5px] text-muted-foreground">
                {leads.state === "ready" && total > 0
                  ? `Showing ${fmt((page - 1) * PAGE_SIZE + 1)}–${fmt(Math.min(page * PAGE_SIZE, total))} of ${fmt(total)} leads`
                  : "No leads to show"}
              </span>
              <span className="flex items-center gap-[6px]">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft aria-hidden strokeWidth={2} />
                </Button>
                <span className="font-mono text-[11.5px] text-body">
                  {page} / {pages}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next page"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                >
                  <ChevronRight aria-hidden strokeWidth={2} />
                </Button>
              </span>
            </div>
          </Card>
        </Appear>
      </PageBody>

      {uploading && (
        <UploadAudiences
          onClose={() => setUploading(false)}
          onSaved={(segment) => {
            segments.reload();
            select(segment.id);
          }}
        />
      )}

      {openLead && (
        <LeadDrawer lead={openLead} onClose={() => setOpenLead(null)} onEdit={() => setEditing(openLead)} />
      )}

      <LeadForm
        // Remounts per target so the fields start from that lead, not the last one edited.
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        open={editing !== null}
        lead={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          leads.reload();
          setOpenLead((current) => (current && current.id === saved.id ? saved : current));
        }}
      />

      <Confirm
        open={removing !== null}
        title={`Delete ${removing?.name ?? ""}?`}
        body="The lead is removed from this workspace, along with their place in any audience and strategy. Their conversations stay in the Inbox."
        confirmLabel="Delete the lead"
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && void remove(removing)}
      />
    </>
  );
}

function AudienceCard({
  name,
  source,
  rows,
  usedBy,
  selected,
  onSelect,
  segment,
}: {
  name: string;
  source: string;
  rows: number | null;
  usedBy: string;
  selected: boolean;
  onSelect: () => void;
  segment?: Segment;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[10px] rounded-[11px] bg-card",
        selected ? "border-2 border-primary px-[14px] py-[9px]" : "border border-border px-[15px] py-[10px]",
      )}
    >
      <div className="flex items-start gap-[10px]">
        <span className="flex size-[32px] shrink-0 items-center justify-center rounded-lg bg-[var(--ch-neutral)] text-white">
          <FileText aria-hidden className="size-[15px]" strokeWidth={1.8} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className={cn("truncate text-[12.5px]", selected ? "font-semibold" : "font-medium")}>{name}</span>
          <span className="truncate font-mono text-[10.5px] text-muted-foreground">{source}</span>
        </span>
        <Button
          variant={selected ? "default" : "outline"}
          size="icon-sm"
          aria-pressed={selected}
          aria-label={selected ? `Viewing ${name}` : `View ${name}`}
          onClick={onSelect}
        >
          {selected ? <Check aria-hidden strokeWidth={2.2} /> : <ChevronRight aria-hidden strokeWidth={2} />}
        </Button>
      </div>
      {segment ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-[10px]">
          <span className="flex items-center gap-3 font-mono text-[11px] text-body">
            <span className="inline-flex items-center gap-[5px]">
              <Users aria-hidden className="size-[13px] text-muted-foreground" strokeWidth={1.8} />
              {fmt(rows ?? 0)}
            </span>
            <span>{usedBy}</span>
          </span>
          {segment.excludedInJourney > 0 ? (
            <span className="font-mono text-[10.5px] text-muted-foreground">
              {fmt(segment.excludedInJourney)} skipped
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
