/**
 * Server-only: one pass over a parked upload that both the summary step and the save step use, so
 * the numbers the user is shown are produced by exactly the code that decides what gets saved.
 *
 * It validates every row against the mapping, finds the people already in a journey in another
 * campaign, and takes them out of the counts. The warning travels with the report. It then dry-runs
 * the merge against the workspace's prospects (`planImport`), so the preview can say how many people
 * are new, how many the workspace already has, and which rows repeat each other — the same outcome
 * `createSegment` produces when the user confirms.
 */

import type { Repository, Ctx } from "@/lib/data/repository";
import { journeyReport, planImport } from "@/lib/leads/merge";
import { checkPhone } from "@/lib/leads/phone";
import { identityGaps, leadIdentity } from "@/lib/leads/profile";
import type { ImportPreview, JourneyWarning, MappingReport, ReviewRow } from "@/lib/leads/segments";
import type { Table } from "@/lib/leads/table";
import { MAX_ERRORS } from "@/lib/leads/upload";
import { validateUpload, withoutRows, type Mapping, type ParsedLead } from "@/lib/leads/validation";

/** Review rows sent to the browser. The counts beside them are always the full totals. */
const MAX_REVIEW = 500;

export type Analysis = {
  report: MappingReport;
  /** The rows worth saving: reachable, and not already in another campaign. */
  leads: ParsedLead[];
};

export async function analyseUpload(
  repo: Repository,
  ctx: Ctx,
  table: Table,
  mapping: Mapping,
): Promise<Analysis> {
  const summary = validateUpload(table.headers, table.rows, mapping, checkPhone);

  const { hits, campaignNames } = await repo.findInJourney(ctx, summary.leads);
  const trimmed = withoutRows(summary, new Set(hits.map((h) => h.row)));

  const raw = journeyReport(hits);
  const journey: JourneyWarning = {
    excluded: raw.excluded,
    rows: raw.rows,
    byCampaign: raw.byCampaign.map(({ campaignId, count }) => ({
      campaignId,
      name: campaignNames[campaignId] ?? "Another campaign",
      count,
    })),
  };

  const leads = trimmed.leads.filter((l) => l.email || l.mobile || l.whatsapp || l.linkedin);
  const known = await repo.listLeadKeys(ctx);
  const names = new Map(known.map((k) => [k.id, k.name]));
  const plan = planImport(known, leads);
  const byRow = new Map(leads.map((l) => [l.row, l]));

  const missing = { name: 0, company: 0, title: 0, any: 0 };
  const rows: ReviewRow[] = [];
  for (const outcome of plan.rows) {
    const lead = byRow.get(outcome.row);
    if (!lead) continue;
    const gaps = identityGaps(lead.extra);
    if (outcome.outcome === "new") {
      if (gaps.name) missing.name++;
      if (gaps.company) missing.company++;
      if (gaps.title) missing.title++;
      if (gaps.name || gaps.company || gaps.title) missing.any++;
    }
    if (rows.length >= MAX_REVIEW) continue;
    const who = leadIdentity(lead);
    rows.push({
      row: lead.row,
      name: who.name,
      nameFromFile: !gaps.name,
      company: who.company,
      title: who.title,
      email: lead.email,
      mobile: lead.mobile,
      whatsapp: lead.whatsapp,
      linkedin: lead.linkedin,
      outcome: outcome.outcome,
      matchName: outcome.leadId ? (names.get(outcome.leadId) ?? null) : null,
      duplicateOf: outcome.duplicateOf,
    });
  }

  const preview: ImportPreview = {
    created: plan.created,
    existing: plan.existing,
    duplicates: plan.duplicates,
    unreachable: summary.totalRows - summary.reachableRows,
    people: plan.created + plan.existing,
    missing,
    rows,
    rowCount: plan.rows.length,
  };

  return {
    report: {
      totalRows: trimmed.totalRows,
      reachableRows: trimmed.reachableRows,
      channels: trimmed.channels.map(({ attribute, column, reachable, invalid, blank }) => ({
        attribute,
        column,
        reachable,
        invalid,
        blank,
      })),
      errors: trimmed.errors.slice(0, MAX_ERRORS),
      errorCount: trimmed.errors.length,
      journey,
      plan: preview,
    },
    leads,
  };
}
