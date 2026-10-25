import { getLinkedInAdapter } from "@/lib/channels";
import { attachConnectedAccount, failConnectSession } from "@/lib/channels/inbound";
import { parseAccountStatusEvent } from "@/lib/channels/events";
import { hasDatabase } from "@/lib/db/client";
import { fail, json, readJson } from "@/lib/http";

/**
 * POST /api/webhooks/unipile/notify — the hosted sign-in finished.
 *
 * Unipile calls this with the new `account_id` and the `name` we gave it, which is our
 * connect-session id. Unlike the other two webhooks this one cannot carry a secret header
 * (`notify_url` takes no headers), so what makes it safe is that it **proves nothing on its own**:
 * the reference must be an unexpired pending session we opened, and the account's identity is read
 * back from the provider with our own API key rather than taken from this body. A caller who
 * cannot guess a 24-byte reference can do nothing here, and one who could still only attaches an
 * account that genuinely exists at the provider.
 *
 * Answers 200 for anything we recognise and 200 for anything we don't: Unipile retries five times
 * on a non-2xx, and retrying a callback for an unknown reference would never start succeeding.
 */
export async function POST(request: Request) {
  if (!hasDatabase()) return fail("unavailable", "This deployment runs without a database.", 503);
  const adapter = getLinkedInAdapter();
  if (!adapter) return fail("not_configured", "No provider is configured.", 503);

  const body = await readJson(request);
  const event = parseAccountStatusEvent(body);
  const reference = referenceOf(body);

  if (!event || !reference) {
    return json({ ok: false, reason: "incomplete" });
  }

  // A wizard that ended in an error reports a status rather than a usable account; record it so
  // the screen waiting on the attempt stops waiting.
  if (event.status !== "ok") {
    await failConnectSession(reference, event.detail || `The provider reported: ${event.status}.`);
    return json({ ok: false, reason: event.status });
  }

  const result = await attachConnectedAccount(adapter, reference, event.accountId);
  if (!result.ok) {
    if (result.reason === "taken") {
      await failConnectSession(reference, "That LinkedIn account is already connected to another workspace.");
    } else if (result.reason === "provider_unknown") {
      await failConnectSession(reference, "The provider didn't recognise the account afterwards.");
    }
    return json({ ok: false, reason: result.reason });
  }
  return json({ ok: true });
}

/** The reference we handed the provider, which it echoes under `name`. */
function referenceOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  for (const key of ["name", "reference", "hosted_auth_name"]) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
