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
  /** How the rows landed against profiles that already existed. */
  profilesCreated: number;
  profilesMerged: number;
  errorCount: number;
  createdAt: string;
  createdBy: string;
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

/** What the summary step shows before the user submits. */
export type MappingReport = {
  totalRows: number;
  reachableRows: number;
  channels: SegmentChannel[];
  /** Capped for transport; `errorCount` is the real total. */
  errors: RowError[];
  errorCount: number;
};

/** Reachable count for a channel, which is what a channel node sends to. */
export function channelReach(segment: Segment, attribute: AttributeKey): number {
  const channel = segment.channels.find((c) => c.attribute === attribute);
  return channel ? channel.reachable : 0;
}
