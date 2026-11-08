/**
 * The checks every authenticated Unipile webhook route makes before it reads the body, in one
 * place so a new route cannot forget one: a secret is configured, this delivery carries it, there
 * is a database to write to, and a provider is configured.
 *
 * Server-only.
 */

import { getLinkedInAdapter, type LinkedInChannelAdapter } from "@/lib/channels";
import { authorizeWebhook, webhookSecret } from "@/lib/channels/webhookAuth";
import { hasDatabase } from "@/lib/db/client";
import { fail } from "@/lib/http";

export function guardWebhook(request: Request): { adapter: LinkedInChannelAdapter } | { refused: Response } {
  if (!webhookSecret()) return { refused: fail("not_configured", "No webhook secret is set.", 503) };
  if (!authorizeWebhook(request)) return { refused: fail("unauthenticated", "Bad webhook secret.", 401) };
  if (!hasDatabase()) return { refused: fail("unavailable", "This deployment runs without a database.", 503) };
  const adapter = getLinkedInAdapter();
  if (!adapter) return { refused: fail("not_configured", "No provider is configured.", 503) };
  return { adapter };
}
