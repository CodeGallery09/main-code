"use client";

import { useState } from "react";
import { ATTRIBUTES } from "@/lib/audiences/validation";
import type { MappingReport, ReviewRow } from "@/lib/audiences/segments";
import { Segmented } from "@/components/ws/ui/segmented";
import { StatusPill } from "@/components/ws/ui/status-pill";
import { fmt } from "@/lib/ws/utils";

type Filter = "all" | ReviewRow["outcome"];

const OUTCOME: Record<ReviewRow["outcome"], { label: string; tone: "success" | "info" | "neutral" }> = {
  new: { label: "New lead", tone: "success" },
  existing: { label: "Already a lead", tone: "info" },
  duplicate: { label: "Duplicate in file", tone: "neutral" },
};

/**
 * The last step of the import: what saving would do, row by row, before
 * anything is written. Every figure came from the server's dry run of the same
 * merge the save performs, so what is confirmed here is what gets saved.
 */
export function ImportReview({
  report,
  consent,
  onConsent,
}: {
  report: MappingReport;
  consent: boolean;
  onConsent: (next: boolean) => void;
}) {
  const { plan, journey } = report;
  const [filter, setFilter] = useState<Filter>("all");
  const [showBlank, setShowBlank] = useState(false);

  const valid = report.totalRows - plan.unreachable;
  const invalidTotal = report.channels.reduce((sum, c) => sum + c.invalid, 0);
  const blankTotal = report.channels.reduce((sum, c) => sum + c.blank, 0);
  // A blank optional cell is logged too; it is not a mistake in the file, so it is listed apart.
  const issues = showBlank ? report.errors : report.errors.filter((e) => e.value);
  const rows = filter === "all" ? plan.rows : plan.rows.filter((r) => r.outcome === filter);
  const capped = plan.rowCount > plan.rows.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[10px]">
        <Stat label="Total rows" value={fmt(report.totalRows)} note="in the file, header excluded" />
        <Stat
          label="Valid records"
          value={fmt(valid)}
          note={
            plan.unreachable
              ? `${fmt(plan.unreachable)} with no usable email, number or LinkedIn`
              : "every row has a usable contact"
          }
        />
        <Stat
          label="Duplicates"
          value={fmt(plan.duplicates + plan.existing)}
          note={`${fmt(plan.duplicates)} repeated in the file · ${fmt(plan.existing)} already leads`}
        />
        <Stat
          label="Missing details"
          value={fmt(plan.missing.any)}
          note={`no name ${fmt(plan.missing.name)} · company ${fmt(plan.missing.company)} · title ${fmt(plan.missing.title)}`}
        />
        <Stat
          label="Will be saved"
          value={fmt(plan.people)}
          note={`${fmt(plan.created)} new · ${fmt(plan.existing)} existing updated`}
          accent
        />
      </div>

      {journey.excluded > 0 && (
        <div role="alert" className="rounded-[10px] border border-warning-border bg-warning-bg px-[14px] py-3">
          <p className="text-[13px] font-semibold text-warning">
            {fmt(journey.excluded)} {journey.excluded === 1 ? "person is" : "people are"} left out
          </p>
          <p className="mt-1 text-[12.5px] leading-[1.55] text-warning">
            They are already in another strategy ({journey.byStrategy.map((c) => `${c.name}: ${fmt(c.count)}`).join(", ")}),
            so they are left out rather than added to a second sequence. The counts above already exclude them.
          </p>
        </div>
      )}

      {plan.missing.name > 0 && (
        <p className="text-[12.5px] leading-[1.55] text-muted-foreground">
          {fmt(plan.missing.name)} {plan.missing.name === 1 ? "row has" : "rows have"} no name column, so the name is
          made from the email or LinkedIn address. Those are marked “from contact” below and can be edited afterwards.
        </p>
      )}

      <section className="rounded-[11px] border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[14px] py-[11px]">
          <span className="label-mono">Review before saving</span>
          <Segmented<Filter>
            size="sm"
            label="Filter the rows"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: plan.rowCount },
              { value: "new", label: "New", count: plan.created },
              { value: "existing", label: "Existing", count: plan.existing },
              { value: "duplicate", label: "Duplicates", count: plan.duplicates },
            ]}
          />
        </div>
        {rows.length === 0 ? (
          <p className="px-[14px] py-7 text-center text-[13px] text-muted-foreground">
            {plan.rowCount === 0 ? "No row in this file can be saved." : "No rows in this group."}
          </p>
        ) : (
          <div className="max-h-[280px] overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead className="sticky top-0 bg-chrome">
                <tr>
                  {["Row", "Name", "Company", "Title", "Contact", "Result"].map((h) => (
                    <th key={h} className="label-mono border-b border-border px-[12px] py-[8px] text-[10.5px]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row}>
                    <td className="border-b border-divider px-[12px] py-[9px] font-mono text-[11.5px] text-muted-foreground">
                      {r.row}
                    </td>
                    <td className="border-b border-divider px-[12px] py-[9px] text-[12.5px]">
                      {r.name}
                      {!r.nameFromFile && <span className="ml-1 text-[11px] text-muted-foreground">· from contact</span>}
                    </td>
                    <td className="border-b border-divider px-[12px] py-[9px] text-[12.5px]">{r.company || "—"}</td>
                    <td className="border-b border-divider px-[12px] py-[9px] text-[12.5px]">{r.title || "—"}</td>
                    <td className="border-b border-divider px-[12px] py-[9px] font-mono text-[11.5px]">{contactOf(r)}</td>
                    <td className="border-b border-divider px-[12px] py-[9px]">
                      <StatusPill tone={OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</StatusPill>
                      {r.outcome === "duplicate" && r.duplicateOf ? (
                        <span className="ml-1 font-mono text-[10.5px] text-muted-foreground">of row {r.duplicateOf}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {capped && filter === "all" && (
          <p className="px-[14px] py-[9px] text-[12px] text-muted-foreground">
            Showing the first {fmt(plan.rows.length)} of {fmt(plan.rowCount)} rows. Every row is saved.
          </p>
        )}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-[10px]">
        {report.channels
          .filter((c) => c.column)
          .map((c) => {
            const meta = ATTRIBUTES.find((a) => a.key === c.attribute);
            return (
              <div key={c.attribute} className="flex flex-col gap-[3px] rounded-[10px] border border-border px-3 py-[11px]">
                <span className="label-mono">{meta ? meta.label : c.attribute}</span>
                <span className="font-mono text-[13px] font-bold">{fmt(c.reachable)} reachable</span>
                <span className="text-[11.5px] text-muted-foreground">
                  from “{c.column}” · {fmt(c.invalid)} invalid · {fmt(c.blank)} blank
                </span>
              </div>
            );
          })}
      </div>

      {report.errors.length > 0 && (
        <section className="rounded-[11px] border border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[14px] py-[11px]">
            <span className="label-mono">
              Validation · {fmt(invalidTotal)} invalid · {fmt(blankTotal)} blank
            </span>
            {blankTotal > 0 && (
              <label className="flex items-center gap-2 text-[12.5px] text-body">
                <input
                  type="checkbox"
                  checked={showBlank}
                  onChange={(e) => setShowBlank(e.target.checked)}
                  className="size-[14px] accent-[var(--primary)]"
                />
                Include blank cells
              </label>
            )}
          </div>
          {issues.length === 0 ? (
            <p className="px-[14px] py-6 text-center text-[13px] text-muted-foreground">
              No invalid entries. Every filled-in contact cell passed its check.
            </p>
          ) : (
            <div className="max-h-[220px] overflow-auto">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead className="sticky top-0 bg-chrome">
                  <tr>
                    {["Row", "Attribute", "Entry", "Why it can't be used"].map((h) => (
                      <th key={h} className="label-mono border-b border-border px-[12px] py-[8px] text-[10.5px]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {issues.map((e, i) => (
                    <tr key={`${e.row}-${e.attribute}-${i}`}>
                      <td className="border-b border-divider px-[12px] py-[9px] font-mono text-[11.5px] text-muted-foreground">
                        {e.row}
                      </td>
                      <td className="border-b border-divider px-[12px] py-[9px] text-[12.5px]">
                        {ATTRIBUTES.find((a) => a.key === e.attribute)?.label ?? e.attribute}
                      </td>
                      <td className="border-b border-divider px-[12px] py-[9px] font-mono text-[11.5px]">
                        {e.value || "—"}
                      </td>
                      <td className="border-b border-divider px-[12px] py-[9px] text-[12.5px] text-body">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-[14px] py-[9px] text-[12px] text-muted-foreground">
            A row with one bad entry is still saved if another of its contacts is valid; only the bad entry is dropped.
          </p>
        </section>
      )}

      <label className="flex items-start gap-[9px] rounded-[10px] bg-accent px-[14px] py-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => onConsent(e.target.checked)}
          className="mt-[3px] size-[15px] shrink-0 accent-[var(--primary)]"
        />
        <span className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold">
            These people have agreed to be contacted, or I have a lawful basis to contact them.
          </span>
          <span className="text-[12.5px] leading-[1.55] text-muted-foreground">
            It applies to the leads this file creates. Without it they are still saved, but they are flagged and left
            out of sends. An existing lead&apos;s consent is never changed by an import.
          </span>
        </span>
      </label>
    </div>
  );
}

function Stat({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-[3px] rounded-[10px] px-3 py-[11px] ${accent ? "bg-accent" : "border border-border"}`}
    >
      <span className="label-mono">{label}</span>
      <span className="font-mono text-[20px] font-bold leading-none tracking-[-0.02em]">{value}</span>
      <span className="text-[11.5px] leading-[1.45] text-muted-foreground">{note}</span>
    </div>
  );
}

function contactOf(r: ReviewRow): string {
  const linkedin = r.linkedin ? r.linkedin.replace(/^https?:\/\/(www\.)?/i, "") : "";
  const first = r.email || r.mobile || r.whatsapp || linkedin;
  const more = [r.email, r.mobile, r.whatsapp, r.linkedin].filter(Boolean).length - 1;
  return more > 0 ? `${first} +${more}` : first || "—";
}
