/**
 * Server-only: one pass over a parked upload that both the summary step and the save step use, so
 * the numbers the user is shown are produced by exactly the code that decides what gets saved.
 *
 * It validates every row against the mapping, finds the people already in a journey in another
 * strategy, and takes them out of the counts. The warning travels with the report. It then dry-runs
 * the merge against the workspace's prospects (`planImport`), so the preview can say how many people
 * are new, how many the workspace already has, and which rows repeat each other — the same outcome
 * `createSegment` produces when the user confirms.
 */

import type { Repository, Ctx } from "@/lib/data/repository";
import { journeyReport, planImport } from "@/lib/audiences/merge";
import { checkPhone } from "@/lib/audiences/phone";
import { identityGaps, audienceIdentity } from "@/lib/audiences/profile";
import type { ImportPreview, JourneyWarning, MappingReport, ReviewRow } from "@/lib/audiences/segments";
import type { Table } from "@/lib/audiences/table";
import { MAX_ERRORS } from "@/lib/audiences/upload";
import { validateUpload, withoutRows, type Mapping, type ParsedAudience } from "@/lib/audiences/validation";

/** Review rows sent to the browser. The counts beside them are always the full totals. */
const MAX_REVIEW = 500;

export type Analysis = {
  report: MappingReport;
  /** The rows worth saving: reachable, and not already in another strategy. */
  audiences: ParsedAudience[];
};

export async function analyseUpload(
  repo: Repository,
  ctx: Ctx,
  table: Table,
  mapping: Mapping,
): Promise<Analysis> {
  const summary = validateUpload(table.headers, table.rows, mapping, checkPhone);

  const { hits, strategyNames } = await repo.findInJourney(ctx, summary.audiences);
  const trimmed = withoutRows(summary, new Set(hits.map((h) => h.row)));

  const raw = journeyReport(hits);
  const journey: JourneyWarning = {
    excluded: raw.excluded,
    rows: raw.rows,
    byStrategy: raw.byStrategy.map(({ strategyId, count }) => ({
      strategyId,
      name: strategyNames[strategyId] ?? "Another strategy",
      count,
    })),
  };

  const audiences = trimmed.audiences.filter((l) => l.email || l.mobile || l.whatsapp || l.linkedin);
  const known = await repo.listAudienceKeys(ctx);
  const names = new Map(known.map((k) => [k.id, k.name]));
  const plan = planImport(known, audiences);
  const byRow = new Map(audiences.map((l) => [l.row, l]));

  const missing = { name: 0, company: 0, title: 0, any: 0 };
  const rows: ReviewRow[] = [];
  for (const outcome of plan.rows) {
    const audience = byRow.get(outcome.row);
    if (!audience) continue;
    const gaps = identityGaps(audience.extra);
    if (outcome.outcome === "new") {
      if (gaps.name) missing.name++;
      if (gaps.company) missing.company++;
      if (gaps.title) missing.title++;
      if (gaps.name || gaps.company || gaps.title) missing.any++;
    }
    if (rows.length >= MAX_REVIEW) continue;
    const who = audienceIdentity(audience);
    rows.push({
      row: audience.row,
      name: who.name,
      nameFromFile: !gaps.name,
      company: who.company,
      title: who.title,
      email: audience.email,
      mobile: audience.mobile,
      whatsapp: audience.whatsapp,
      linkedin: audience.linkedin,
      outcome: outcome.outcome,
      matchName: outcome.audienceId ? (names.get(outcome.audienceId) ?? null) : null,
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
    audiences,
  };
}
