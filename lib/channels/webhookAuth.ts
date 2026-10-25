/**
 * Authenticating an inbound Unipile delivery.
 *
 * Unipile's v1 API does not sign webhook bodies, so the only thing that tells a real delivery from
 * anyone who found the URL is a secret header we asked Unipile to send back (`WEBHOOK_HEADER`,
 * registered with the webhook). Treat it as a bearer token: compared in constant time, and the
 * route answers 401 without it. Until `UNIPILE_WEBHOOK_SECRET` is set the routes refuse every
 * call — an unauthenticated endpoint that writes to a workspace is worse than a missing feature.
 */

import { timingSafeEqual } from "node:crypto";
import { WEBHOOK_HEADER } from "./unipile";

export function webhookSecret(): string | null {
  const value = process.env.UNIPILE_WEBHOOK_SECRET?.trim();
  return value ? value : null;
}

export function authorizeWebhook(request: Request): boolean {
  const expected = webhookSecret();
  if (!expected) return false;
  const given = request.headers.get(WEBHOOK_HEADER)?.trim() ?? "";
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
