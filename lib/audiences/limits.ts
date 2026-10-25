/**
 * Upload limits, in their own module so the browser can state them without
 * pulling in the server-only parser (and its spreadsheet library) alongside.
 */

/**
 * 4 MB, the limit the upload modal states and the route enforces. Vercel rejects a request body
 * over 4.5 MB before it reaches the app, so a higher number here would promise something the host
 * cannot deliver. Self-hosting somewhere without that cap can raise it.
 */
export const MAX_UPLOAD_MB = 4;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx"];
