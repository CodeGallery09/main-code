/**
 * Upload limits, in their own module so the browser can state them without
 * pulling in the server-only parser (and its spreadsheet library) alongside.
 */

/** 64 MB, the limit the upload modal states and the route enforces. */
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx"];
