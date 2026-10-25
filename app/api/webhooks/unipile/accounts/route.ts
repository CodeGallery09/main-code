import { getLinkedInAdapter } from "@/lib/channels";
import { parseAccountStatusEvent } from "@/lib/channels/events";
import { applyAccountStatus } from "@/lib/channels/inbound";
import { authorizeWebhook, webhookSecret } from "@/lib/channels/webhookAuth";
import { hasDatabase } from "@/lib/db/client";
import { fail, json, readJson } from "@/lib/http";

/**
 * POST /api/webhooks/unipile/accounts — an account's status changed at the provider.
 *
 * This is the webhook that matters most: once an account leaves OK the provider stops delivering
 * its messages, so an account that quietly signed out would look healthy and simply do nothing.
 * The state it writes is what the Configuration screen and the setup checks report, so a signed
 * out or restricted seat says so in the UI within a delivery.
 *
 * Authenticated by the shared secret: a header Unipile was asked to send back when registered via
 * the API/script (Unipile does not sign bodies), or — because Unipile's dashboard UI has no header
 * field for an "Account" webhook — the same secret as a `?token=` query param on this URL, for a
 * webhook created by hand. See `lib/channels/webhookAuth.ts`. Without `UNIPILE_WEBHOOK_SECRET` set,
 * every call is refused regardless of which form it arrives in.
 */
export async function POST(request: Request) {
  if (!webhookSecret()) return fail("not_configured", "No webhook secret is set.", 503);
  if (!authorizeWebhook(request)) return fail("unauthenticated", "Bad webhook secret.", 401);
  if (!hasDatabase()) return fail("unavailable", "This deployment runs without a database.", 503);
  const adapter = getLinkedInAdapter();
  if (!adapter) return fail("not_configured", "No provider is configured.", 503);

  const event = parseAccountStatusEvent(await readJson(request));
  if (!event) return json({ ok: false, reason: "incomplete" });

  const applied = await applyAccountStatus(adapter.provider, event);
  // An account we do not know is not an error to retry: answer 200 so the provider stops.
  return json({ ok: applied, reason: applied ? undefined : "unknown_account" });
}
