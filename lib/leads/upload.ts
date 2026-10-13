/**
 * Shared bits of the upload contract: the limits the modal states and the
 * server enforces, and the readers that turn a request body into trusted
 * values. Kept out of the route files so both the preview and the save step use
 * exactly the same rules.
 */

import { ATTRIBUTES, type Mapping } from "./validation";

/** Segment description cap, as the modal shows it. */
export const MAX_DESCRIPTION = 300;
/** The error log is capped for transport; the count sent alongside is the real total. */
export const MAX_ERRORS = 500;

/** Keeps only the four known attributes, each pointing at a non-empty column name. */
export function readMapping(value: unknown): Mapping {
  const source = (value ?? {}) as Record<string, unknown>;
  const mapping: Mapping = {};
  for (const { key } of ATTRIBUTES) {
    const column = source[key];
    if (typeof column === "string" && column.trim()) mapping[key] = column;
  }
  return mapping;
}
