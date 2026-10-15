/**
 * Server-only: one pass over a parked upload that both the summary step and the save step use, so
 * the numbers the user is shown are produced by exactly the code that decides what gets saved.
 *
 * It validates every row against the mapping, finds the people already in a journey in another
 * campaign, and takes them out of the counts. The warning travels with the report.
 */

import type { Repository, Ctx } from "@/lib/data/repository";
import { journeyReport } from "@/lib/leads/merge";
import { checkPhone } from "@/lib/leads/phone";
import type { JourneyWarning, MappingReport } from "@/lib/leads/segments";
import type { Table } from "@/lib/leads/table";
import { MAX_ERRORS } from "@/lib/leads/upload";
import { validateUpload, withoutRows, type Mapping, type ParsedLead } from "@/lib/leads/validation";

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
    },
    leads: trimmed.leads.filter((l) => l.email || l.mobile || l.whatsapp || l.linkedin),
  };
}
