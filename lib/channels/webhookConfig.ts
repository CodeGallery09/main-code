/**
 * The webhook contract: constants and the pure matching rule, shared by the inbound routes, the
 * registration script, and their tests.
 *
 * It holds no value imports but `node:crypto` (a built-in, loadable under Node's type stripping
 * same as `lib/password.ts`), so `tests/webhookConfig.test.mjs` can load it directly with no
 * network and no live secret. `lib/channels/webhookAuth.ts` is the untested half that knows about
 * `Request` and `process.env`; everything that is actually worth pinning with a test lives here.
 */

import { timingSafeEqual } from "node:crypto";

/**
 * The preferred carrier: a header Unipile is asked to send back on every delivery, registered via
 * the API/script (`npm run unipile:webhooks`).
 */
export const WEBHOOK_HEADER = "x-flightpath-webhook-secret";

/**
 * The fallback carrier: the same secret as a query param on the webhook's own callback URL.
 * Unipile's dashboard UI, as of this writing, exposes no header field when creating an "Account"
 * webhook by hand, so a webhook made that way has nowhere else to carry it — but its "Callback
 * URL" field takes a full URL, so `…?token=<secret>` needs no UI support at all.
 */
export const WEBHOOK_QUERY_PARAM = "token";

/** Unipile's `source` values for the two events this phase handles, and where each is served. */
export const WEBHOOK_SOURCES = {
  accountStatus: { source: "account_status", path: "/api/webhooks/unipile/accounts" },
  messaging: { source: "messaging", path: "/api/webhooks/unipile/messages" },
} as const;

/** Constant-time compare; never throws on a length mismatch, which `timingSafeEqual` does. */
function matches(given: string, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Whether any of the delivery's candidate secrets (header value, query value — `undefined`/`""`
 * for "this carrier wasn't present") matches the configured one. `expected` of `null` means no
 * secret is configured at all, which is never a match: an unset secret refuses every delivery
 * rather than accepting an empty one.
 */
export function authorizeFromCarriers(expected: string | null, carriers: (string | null | undefined)[]): boolean {
  if (!expected) return false;
  return carriers.some((candidate) => matches((candidate ?? "").trim(), expected));
}
