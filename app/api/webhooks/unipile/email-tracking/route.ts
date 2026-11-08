import { applyEmailTracking } from "@/lib/channels/email";
import { parseTrackingEvent } from "@/lib/channels/events";
import { guardWebhook } from "@/lib/channels/webhookGuard";
import { json, readJson } from "@/lib/http";

/**
 * POST /api/webhooks/unipile/email-tracking — Unipile's `email_tracking` webhook: `mail_opened`
 * and `mail_link_clicked` on an email Flightpath sent with tracking on.
 *
 * Matched to the exact send by the label we sent it with (our own event id). One open is kept per
 * send — mail clients and security scanners load the pixel repeatedly, and Apple Mail preloads it,
 * so an open is a weak signal; every distinct click is kept.
 */
export async function POST(request: Request) {
  const guard = guardWebhook(request);
  if ("refused" in guard) return guard.refused;
  const event = parseTrackingEvent(await readJson(request));
  if (!event) return json({ ok: false, reason: "incomplete" });
  const result = await applyEmailTracking(guard.adapter.provider, event);
  return json(result.stored ? { ok: true } : { ok: false, reason: result.reason });
}
