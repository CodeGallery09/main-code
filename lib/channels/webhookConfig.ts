/**
 * The two constants the inbound side and the registration script must agree on.
 *
 * They live in a module of their own, with no value imports, because
 * `scripts/register-unipile-webhooks.ts` runs under `node --experimental-strip-types` and cannot
 * load the adapter. A header name copied into the script by hand is a webhook that authenticates
 * against nothing the day one of the two is changed.
 */

/** The header Unipile is asked to send on every delivery, carrying `UNIPILE_WEBHOOK_SECRET`. */
export const WEBHOOK_HEADER = "x-flightpath-webhook-secret";

/** Unipile's `source` values for the two events this phase handles, and where each is served. */
export const WEBHOOK_SOURCES = {
  accountStatus: { source: "account_status", path: "/api/webhooks/unipile/accounts" },
  messaging: { source: "messaging", path: "/api/webhooks/unipile/messages" },
} as const;
