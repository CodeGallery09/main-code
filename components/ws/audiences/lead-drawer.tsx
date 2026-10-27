"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, Pencil, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Audience } from "@/lib/data/types";
import { CHANNEL_NAME } from "@/lib/ws/channels";
import { useAsync } from "@/lib/ws/use-async";
import { fmt } from "@/lib/ws/utils";
import { EASE_OUT } from "@/components/ws/ui/motion";
import { Button } from "@/components/ws/ui/button";
import { StatusPill } from "@/components/ws/ui/status-pill";
import { LoadError, Skeleton } from "@/components/ws/ui/misc";

const TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const at = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : TIME.format(d);
};

/**
 * One lead, with everything the workspace has actually recorded about them:
 * where they came from, which strategy they are in, what has been sent and
 * received, and the timeline those rows make. Nothing here is inferred.
 */
export function LeadDrawer({
  lead,
  onClose,
  onEdit,
}: {
  lead: Audience;
  onClose: () => void;
  /** Opens the lead form over the drawer; absent means the drawer is read-only. */
  onEdit?: () => void;
}) {
  const still = useReducedMotion();
  const profile = useAsync(() => api.prospect(lead.id), [lead.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const data = profile.state === "ready" ? profile.data.profile : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[rgba(20,20,19,0.28)]" />
      <motion.aside
        role="dialog"
        aria-modal
        aria-label={lead.name}
        className="relative flex h-full w-full max-w-[420px] flex-col overflow-y-auto border-l border-border bg-card"
        initial={still ? false : { x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={EASE_OUT}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-semibold">{lead.name}</h2>
            <p className="mt-[2px] truncate text-[11.5px] text-muted-foreground">
              {[lead.title, lead.company].filter(Boolean).join(" · ") || "No title on file"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill tone={lead.consent ? "success" : "warning"}>
                {lead.consent ? "Opted in" : "Needs check"}
              </StatusPill>
              <span className="font-mono text-[11px] text-muted-foreground">Score {lead.score}</span>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1">
            {onEdit && (
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${lead.name}`} onClick={onEdit}>
                <Pencil aria-hidden strokeWidth={2} />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X aria-hidden strokeWidth={2.2} />
            </Button>
          </span>
        </header>

        <div className="flex flex-col gap-5 px-5 py-[16px]">
          <Section title="Contact">
            <Pairs
              rows={[
                ["Email", lead.email ?? "Not on file"],
                ["Mobile", lead.phone ?? "Not on file"],
                ["WhatsApp", lead.whatsapp ?? "Not on file"],
                ["LinkedIn", lead.linkedin ?? "Not on file"],
              ]}
              link={lead.linkedin ?? undefined}
            />
          </Section>

          {profile.state === "loading" && (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-[12px] w-[40%]" />
              <Skeleton className="h-[56px]" />
              <Skeleton className="h-[56px]" />
            </div>
          )}

          {profile.state === "failed" && (
            <LoadError message="We couldn't load this lead's history." onRetry={profile.reload} />
          )}

          {data && (
            <>
              <Section title="Journey">
                {data.journey.strategy ? (
                  <Pairs
                    rows={[
                      ["Strategy", data.journey.strategy.name],
                      ["Status", data.journey.strategy.status],
                      ["Run", data.journey.run ? data.journey.run.state : "Not started"],
                    ]}
                  />
                ) : (
                  <p className="text-[11.5px] text-muted-foreground">Not in a strategy yet.</p>
                )}
              </Section>

              <Section title="Engagement">
                <div className="grid grid-cols-2 gap-[10px]">
                  <Figure label="Sent" value={fmt(data.engagement.sent)} />
                  <Figure label="Received" value={fmt(data.engagement.received)} />
                </div>
                {data.engagement.byChannel.length > 0 && (
                  <ul className="mt-3 flex flex-col">
                    {data.engagement.byChannel.map((c) => (
                      <li key={c.channel} className="flex items-center justify-between gap-3 border-b border-divider py-[9px] last:border-b-0">
                        <span className="text-[11.5px]">{CHANNEL_NAME[c.channel]}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {fmt(c.sent)} sent · {fmt(c.received)} in
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {data.audiences.length > 0 && (
                <Section title="Audiences">
                  <ul className="flex flex-col">
                    {data.audiences.map((a) => (
                      <li key={a.id} className="flex flex-col gap-[2px] border-b border-divider py-[9px] last:border-b-0">
                        <span className="text-[11.5px] font-medium">{a.name}</span>
                        <span className="font-mono text-[10.5px] text-muted-foreground">{a.fileName}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section title="Timeline">
                {data.timeline.length === 0 ? (
                  <p className="text-[11.5px] text-muted-foreground">Nothing recorded yet.</p>
                ) : (
                  <ul className="flex flex-col gap-[9px]">
                    {data.timeline.slice(0, 12).map((t) => (
                      <li key={t.id} className="flex items-start gap-[9px]">
                        <span aria-hidden className="mt-[6px] size-[5px] shrink-0 rounded-full bg-[#c9c5bc]" />
                        <span className="flex min-w-0 flex-col gap-px">
                          <span className="text-[11.5px] text-body">{t.label}</span>
                          <span className="font-mono text-[10.5px] text-muted-foreground">{at(t.at)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
      </motion.aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-[10px]">
      <h3 className="label-mono">{title}</h3>
      {children}
    </section>
  );
}

function Pairs({ rows, link }: { rows: [string, string][]; link?: string }) {
  return (
    <dl className="flex flex-col gap-[10px]">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-[2px]">
          <dt className="text-[11px] text-muted-foreground">{label}</dt>
          <dd className="text-[11.5px] font-medium [overflow-wrap:anywhere]">
            {label === "LinkedIn" && link ? (
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-[6px] hover:underline">
                <ExternalLink aria-hidden className="size-[13px] text-[var(--ch-linkedin)]" strokeWidth={2} />
                Profile
              </a>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[3px] rounded-[10px] border border-border px-3 py-[8px]">
      <span className="label-mono">{label}</span>
      <span className="font-mono text-[20px] font-bold leading-none tracking-[-0.02em]">{value}</span>
    </div>
  );
}
