import { applyEmailEvent } from "@/lib/channels/email";
import { parseEmailEvent } from "@/lib/channels/events";
import { guardWebhook } from "@/lib/channels/webhookGuard";
import { json, readJson } from "@/lib/http";

/**
 * POST /api/webhooks/unipile/emails — Unipile's `email` webhook: `mail_received`, `mail_sent`,
 * `mail_moved` on a connected mailbox.
 *
 * A reply from a lead lands on their Inbox thread and counts as a reply; an out-of-office is kept
 * but not counted; a bounce marks the lead and stops further email to them; our own sent mail
 * records the provider's id for threading. Mail from someone who is not a lead is an event only.
 * Idempotent on the provider's email id. See `lib/channels/email.ts`.
 */
export async function POST(request: Request) {
  const guard = guardWebhook(request);
  if ("refused" in guard) return guard.refused;
  const email = parseEmailEvent(await readJson(request));
  if (!email) return json({ ok: false, reason: "incomplete" });
  const result = await applyEmailEvent(guard.adapter.provider, email);
  return json(result.stored ? { ok: true, kind: result.kind } : { ok: false, reason: result.reason });
}
