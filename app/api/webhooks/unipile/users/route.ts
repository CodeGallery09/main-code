import { parseRelationEvent } from "@/lib/channels/events";
import { applyNewRelation } from "@/lib/channels/relations";
import { guardWebhook } from "@/lib/channels/webhookGuard";
import { json, readJson } from "@/lib/http";

/**
 * POST /api/webhooks/unipile/users — Unipile's `users` webhook: `new_relation`, someone became a
 * first-degree connection of a connected LinkedIn account. For a lead we invited, that is the
 * invite being accepted, which is what "If they accepted the invite" waits for.
 *
 * A new connection who is not a lead is ignored — never turned into one. Answers 200 for anything
 * it read, recognised or not, because Unipile retries a non-2xx five times and a stranger's
 * connection will never start matching. Authenticated like the other webhooks (header or
 * `?token=`).
 */
export async function POST(request: Request) {
  const guard = guardWebhook(request);
  if ("refused" in guard) return guard.refused;
  const event = parseRelationEvent(await readJson(request));
  if (!event) return json({ ok: false, reason: "incomplete" });
  const result = await applyNewRelation(guard.adapter.provider, event);
  return json(result.stored ? { ok: true } : { ok: false, reason: result.reason });
}
