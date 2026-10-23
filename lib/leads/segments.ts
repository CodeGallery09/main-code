/**
 * The shapes a saved lead segment is stored and shown in.
 *
 * A segment is one uploaded file: its name, the mapping the user confirmed, the
 * counts the summary screen showed, and the profiles it is linked to. The
 * builder reads `reachableRows` from here, so the canvas counts reachable leads
 * rather than raw rows.
 *
 * Only type imports, so this module is erased at runtime and loads anywhere.
 */

import type { AttributeKey, Mapping, RowError } from "./validation";

/** Per-channel reachability, as the summary screen reports it. */
export type SegmentChannel = {
  attribute: AttributeKey;
  column: string | null;
  reachable: number;
  invalid: number;
  blank: number;
};

export type Segment = {
  id: string;
  name: string;
  description: string;
  fileName: string;
  fileSize: number;
  mapping: Mapping;
  /** Rows in the file, header excluded. */
  totalRows: number;
  /** Rows reachable on at least one mapped channel. */
  reachableRows: number;
  channels: SegmentChannel[];
  /** How the rows landed against leads that already existed. */
  profilesCreated: number;
  profilesMerged: number;
  /** Rows left out because the person is already in a journey in another campaign. */
  excludedInJourney: number;
  errorCount: number;
  createdAt: string;
  createdBy: string;
  /** Prospects linked to the audience right now (deleting a lead drops it), counted on read. */
  leadCount: number;
};

/** What the preview step shows after the file has been read on the server. */
export type UploadPreview = {
  uploadId: string;
  fileName: string;
  fileSize: number;
  headers: string[];
  /** The first five data rows, which is all the preview shows. */
  sample: string[][];
  totalRows: number;
  suggestedMapping: Mapping;
};

/** The warning the summary step shows when the file contains people already in a campaign. */
export type JourneyWarning = {
  excluded: number;
  /** 1-based file rows, capped for transport. */
  rows: number[];
  byCampaign: { campaignId: string; name: string; count: number }[];
};

/** What the summary step shows before the user submits. */
export type MappingReport = {
  totalRows: number;
  reachableRows: number;
  channels: SegmentChannel[];
  /** Capped for transport; `errorCount` is the real total. */
  errors: RowError[];
  errorCount: number;
  /** Rows that will be left out, and why. Counts above already exclude them. */
  journey: JourneyWarning;
  /** What saving would do, worked out by the same merge the save step runs. */
  plan: ImportPreview;
};

/** One row of the file as it would be imported, for the review table. */
export type ReviewRow = {
  row: number;
  name: string;
  /** False when the file has no name column for this row and the name was made from the contact. */
  nameFromFile: boolean;
  company: string;
  title: string;
  email: string | null;
  mobile: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  outcome: "new" | "existing" | "duplicate";
  /** For `existing`: the prospect it matches. */
  matchName: string | null;
  /** For `duplicate`: the earlier row it repeats. */
  duplicateOf: number | null;
};

export type ImportPreview = {
  /** Prospects the import creates. */
  created: number;
  /** Prospects the workspace already has that the file matches: linked and enriched, never copied. */
  existing: number;
  /** Rows repeating a person earlier in the same file; collapsed into one prospect. */
  duplicates: number;
  /** Rows with no valid email, number or LinkedIn on any mapped column; not imported. */
  unreachable: number;
  /** Distinct people the audience will hold: `created + existing`. */
  people: number;
  /** Among the prospects this import creates, how many the file gives no name/company/title for. */
  /** `any` counts prospects missing at least one of the three. */
  missing: { name: number; company: number; title: number; any: number };
  /** Every importable row, capped for transport; `rowCount` is the real total. */
  rows: ReviewRow[];
  rowCount: number;
};

/** Reachable count for a channel, which is what a channel node sends to. */
export function channelReach(segment: Segment, attribute: AttributeKey): number {
  const channel = segment.channels.find((c) => c.attribute === attribute);
  return channel ? channel.reachable : 0;
}
