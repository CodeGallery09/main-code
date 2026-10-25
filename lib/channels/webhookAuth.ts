/**
 * Authenticating an inbound Unipile delivery.
 *
 * Unipile's v1 API does not sign webhook bodies, so the only thing that tells a real delivery from
 * anyone who found the URL is a secret we asked Unipile to send back on every call. Two carriers
 * are accepted — see `webhookConfig.ts` for why there are two and `authorizeFromCarriers` for the
 * actual comparison, which is what `tests/webhookConfig.test.mjs` pins. This file is just the
 * untested glue that pulls the candidates out of a `Request` and the secret out of the environment.
 *
 * Until `UNIPILE_WEBHOOK_SECRET` is set the routes refuse every call — an unauthenticated endpoint
 * that writes to a workspace is worse than a missing feature.
 */

import { authorizeFromCarriers, WEBHOOK_HEADER, WEBHOOK_QUERY_PARAM } from "./webhookConfig";

export function webhookSecret(): string | null {
  const value = process.env.UNIPILE_WEBHOOK_SECRET?.trim();
  return value ? value : null;
}

export function authorizeWebhook(request: Request): boolean {
  const header = request.headers.get(WEBHOOK_HEADER);
  const query = new URL(request.url).searchParams.get(WEBHOOK_QUERY_PARAM);
  return authorizeFromCarriers(webhookSecret(), [header, query]);
}
