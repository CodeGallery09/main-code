import { getLinkedInAdapter } from "@/lib/channels";
import { parseMessageEvent } from "@/lib/channels/events";
import { applyInboundMessage } from "@/lib/channels/inbound";
import { authorizeWebhook, webhookSecret } from "@/lib/channels/webhookAuth";
import { hasDatabase } from "@/lib/db/client";
import { fail, json, readJson } from "@/lib/http";

/**
 * POST /api/webhooks/unipile/messages — a message arrived on a connected account.
 *
 * It lands in the inbox only when the sender is already a lead in that workspace (matched on their
 * LinkedIn handle). A message from someone the workspace has never uploaded is recorded as an
 * event and nothing else: inventing a person out of a webhook payload would put a stranger in
 * someone's lead list.
 *
 * Idempotent on the provider's message id — Unipile retries a delivery five times if it does not
 * get a 200 within 30 seconds, so a duplicate must not become a second message in the thread.
 *
 * Authenticated the same way as `/accounts` — header or `?token=` query param. See
 * `lib/channels/webhookAuth.ts`.
 */
export async function POST(request: Request) {
  if (!webhookSecret()) return fail("not_configured", "No webhook secret is set.", 503);
  if (!authorizeWebhook(request)) return fail("unauthenticated", "Bad webhook secret.", 401);
  if (!hasDatabase()) return fail("unavailable", "This deployment runs without a database.", 503);
  const adapter = getLinkedInAdapter();
  if (!adapter) return fail("not_configured", "No provider is configured.", 503);

  const event = parseMessageEvent(await readJson(request));
  if (!event) return json({ ok: false, reason: "incomplete" });

  const result = await applyInboundMessage(adapter.provider, event);
  return json(result.stored ? { ok: true, threadId: result.threadId } : { ok: false, reason: result.reason });
}
