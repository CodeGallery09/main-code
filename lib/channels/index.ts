/**
 * Where the rest of the app gets the LinkedIn adapter — and the honest answer when there isn't one.
 *
 * `getLinkedInAdapter()` returns `null` until `UNIPILE_DSN` and `UNIPILE_API_KEY` are set, and
 * every caller is expected to say so rather than pretend: the Integrations screen shows "not
 * configured" and `POST /api/integrations/linkedin/connect` answers 503 `not_configured`, the same
 * shape `/api/demo-request` uses for its unset webhook.
 *
 * Server-only. Never import this from a client component: it reads the API key.
 */

import type { LinkedInChannelAdapter } from "./adapter";
import { UnipileAdapter } from "./unipile";

let cached: LinkedInChannelAdapter | null | undefined;

export function getLinkedInAdapter(): LinkedInChannelAdapter | null {
  if (cached !== undefined) return cached;
  const dsn = process.env.UNIPILE_DSN?.trim();
  const apiKey = process.env.UNIPILE_API_KEY?.trim();
  cached = dsn && apiKey ? new UnipileAdapter({ dsn, apiKey }) : null;
  return cached;
}

/** Whether connecting is configured, for a screen that must not offer what it cannot do. */
export const linkedInConnectConfigured = (): boolean => getLinkedInAdapter() !== null;

/**
 * The public origin the provider's redirects and callbacks come back to. Vercel sets
 * `VERCEL_PROJECT_PRODUCTION_URL`; `APP_URL` overrides it for a local tunnel. A hosted-auth link
 * built against `localhost` cannot work, so this is required rather than guessed.
 */
export function appOrigin(): string | null {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel.replace(/\/+$/, "")}` : null;
}

export { ProviderError } from "./adapter";
export type { HostedAuthLink, HostedAuthRequest, LinkedInChannelAdapter, ProviderAccount } from "./adapter";
