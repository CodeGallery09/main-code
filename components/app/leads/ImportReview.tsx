"use client";

/**
 * The last step of the import modal: what the import will do, row by row, before anything is
 * saved. Every number here came from the server's dry run of the same merge the save step performs
 * (`analyseUpload` → `planImport`), so what the user confirms is what gets written.
 */

import { useState } from "react";
import { ATTRIBUTES } from "@/lib/leads/validation";
import type { MappingReport, ReviewRow } from "@/lib/leads/segments";
import { Segmented } from "../ui";

type Filter = "all" | ReviewRow["outcome"];

const OUTCOME: Record<ReviewRow["outcome"], { label: string; tone: string }> = {
  new: { label: "New prospect", tone: "pos" },
  existing: { label: "Already a prospect", tone: "acc" },
  duplicate: { label: "Duplicate in file", tone: "hl" },
};

const n = (value: number) => value.toLocaleString("en-US");

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
  // A blank optional cell is logged too; it is not a mistake in the file, so it is listed apart.
  const invalidTotal = report.channels.reduce((sum, c) => sum + c.invalid, 0);
  const blankTotal = report.channels.reduce((sum, c) => sum + c.blank, 0);
  const issues = showBlank ? report.errors : report.errors.filter((e) => e.value);
  const rows = filter === "all" ? plan.rows : plan.rows.filter((r) => r.outcome === filter);
  const capped = plan.rowCount > plan.rows.length;

  return (
    <>
      <div className="imp-stats">
        <div className="imp-stat">
          <span className="eyebrow">Total rows</span>
          <b>{n(report.totalRows)}</b>
          <small>in the file, header excluded</small>
        </div>
        <div className="imp-stat">
          <span className="eyebrow">Valid records</span>
          <b>{n(valid)}</b>
          <small>
            {plan.unreachable
              ? `${n(plan.unreachable)} without a usable email, number or LinkedIn`
              : "every row has a usable contact"}
          </small>
        </div>
        <div className="imp-stat">
          <span className="eyebrow">Duplicates</span>
          <b>{n(plan.duplicates + plan.existing)}</b>
          <small>
            {n(plan.duplicates)} repeated in the file · {n(plan.existing)} already prospects
          </small>
        </div>
        <div className="imp-stat">
          <span className="eyebrow">Missing details</span>
          <b>{n(plan.missing.any)}</b>
          <small>
            new prospects without a name {n(plan.missing.name)} · company {n(plan.missing.company)} · title{" "}
            {n(plan.missing.title)}
          </small>
        </div>
        <div className="imp-stat on">
          <span className="eyebrow">Will be imported</span>
          <b>{n(plan.people)}</b>
          <small>
            {n(plan.created)} new · {n(plan.existing)} existing updated
          </small>
        </div>
      </div>

      {journey.excluded > 0 && (
        <div className="warnbox" role="alert">
          <b>
            {n(journey.excluded)} {journey.excluded === 1 ? "lead" : "leads"} will be excluded
          </b>
          <span>
            {journey.excluded === 1 ? "This person is" : "These people are"} already in a journey in another campaign (
            {journey.byCampaign.map((c) => `${c.name}: ${n(c.count)}`).join(", ")}
            ), so they are left out rather than added to a second sequence. The counts above don’t include them.
          </span>
        </div>
      )}

      {plan.missing.name > 0 && (
        <p className="hint">
          {n(plan.missing.name)} {plan.missing.name === 1 ? "row has" : "rows have"} no name column, so the name is made
          from the email or LinkedIn address. Those names are marked “from contact” below; you can edit them on the
          prospect afterwards.
        </p>
      )}

      <div className="imp-review">
        <div className="imp-review-h">
          <span className="eyebrow">Review before importing</span>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            items={[
              ["all", "All", plan.rowCount],
              ["new", "New", plan.created],
              ["existing", "Existing", plan.existing],
              ["duplicate", "Duplicates", plan.duplicates],
            ]}
          />
        </div>
        {rows.length === 0 ? (
          <p className="pf-empty">
            {plan.rowCount === 0 ? "No row in this file can be imported." : "No rows in this group."}
          </p>
        ) : (
          <div className="tblw upprev imp-tbl">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Title</th>
                  <th>Contact</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row}>
                    <td className="num">{r.row}</td>
                    <td>
                      {r.name}
                      {!r.nameFromFile && <small className="imp-sub"> · from contact</small>}
                    </td>
                    <td>{r.company || <span className="pf-none">—</span>}</td>
                    <td>{r.title || <span className="pf-none">—</span>}</td>
                    <td className="num">{contactOf(r)}</td>
                    <td>
                      <span className={"tag " + OUTCOME[r.outcome].tone}>{OUTCOME[r.outcome].label}</span>
                      {r.outcome === "existing" && r.matchName && <small className="imp-sub"> {r.matchName}</small>}
                      {r.outcome === "duplicate" && r.duplicateOf && (
                        <small className="imp-sub"> of row {r.duplicateOf}</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {capped && filter === "all" && (
          <span className="hint">
            Showing the first {n(plan.rows.length)} of {n(plan.rowCount)} rows. Every row is imported.
          </span>
        )}
      </div>

      <div className="reachrow">
        {report.channels
          .filter((c) => c.column)
          .map((c) => {
            const meta = ATTRIBUTES.find((a) => a.key === c.attribute);
            return (
              <div className="reach" key={c.attribute}>
                <span className="eyebrow">{meta ? meta.label : c.attribute}</span>
                <b>{n(c.reachable)} reachable</b>
                <small>
                  from “{c.column}” · {n(c.invalid)} invalid · {n(c.blank)} blank
                </small>
              </div>
            );
          })}
      </div>

      {report.errors.length > 0 && (
        <div className="imp-review">
          <div className="imp-review-h">
            <span className="eyebrow">
              Validation · {n(invalidTotal)} invalid {invalidTotal === 1 ? "entry" : "entries"} · {n(blankTotal)} blank{" "}
              {blankTotal === 1 ? "cell" : "cells"}
            </span>
            {blankTotal > 0 && (
              <label className="imp-toggle">
                <input type="checkbox" checked={showBlank} onChange={(e) => setShowBlank(e.target.checked)} />
                Include blank cells
              </label>
            )}
          </div>
          {report.errorCount > report.errors.length && (
            <span className="hint">
              The log below covers the first {n(report.errors.length)} of {n(report.errorCount)} entries.
            </span>
          )}
          {issues.length === 0 ? (
            <p className="pf-empty">No invalid entries. Every filled-in contact cell passed its check.</p>
          ) : (
            <div className="tblw errlog">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Attribute</th>
                    <th>Entry</th>
                    <th>Why it can’t be used</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((e, i) => (
                    <tr key={`${e.row}-${e.attribute}-${i}`}>
                      <td className="num">{e.row}</td>
                      <td>{ATTRIBUTES.find((a) => a.key === e.attribute)?.label || e.attribute}</td>
                      <td className="num">{e.value || "—"}</td>
                      <td>{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <span className="hint">
            A row with one bad entry is still imported if another of its contacts is valid; only the bad entry is
            dropped.
          </span>
        </div>
      )}

      <label className="uprow" style={{ alignItems: "flex-start", gap: 8, display: "flex" }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => onConsent(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          <b>These people have agreed to be contacted, or I have a lawful basis to contact them.</b>
          <span className="hint" style={{ display: "block" }}>
            Prospects this file adds are marked with that consent. Without it they are saved, but they are flagged and
            won’t be contacted.
          </span>
        </span>
      </label>

      <p className="hint">
        Importing only saves the audience: it never starts outreach. Rows that match a prospect you already have (same
        email, mobile, WhatsApp or LinkedIn) are linked to that prospect and fill in what it was missing, so nobody is
        stored twice. An existing prospect’s consent is never changed by an import.
      </p>
    </>
  );
}

function contactOf(r: ReviewRow): string {
  const linkedin = r.linkedin ? r.linkedin.replace(/^https?:\/\/(www\.)?/i, "") : "";
  const first = r.email || r.mobile || r.whatsapp || linkedin;
  const more = [r.email, r.mobile, r.whatsapp, r.linkedin].filter(Boolean).length - 1;
  return more > 0 ? `${first} +${more}` : first || "—";
}
