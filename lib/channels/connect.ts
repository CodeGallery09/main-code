/**
 * Opening and finishing a LinkedIn connection, in one place.
 *
 * Both the connect route and the reconnect route do the same three things — open a connect
 * session, ask the provider for a hosted sign-in link, hand back the URL — so they do it here
 * rather than twice.
 *
 * Server-only.
 */

import { getRepository, type Ctx } from "@/lib/data";
import { appOrigin, getLinkedInAdapter } from "@/lib/channels";
import { INTEGRATIONS_HREF } from "@/lib/nav";

/** A hosted link is a bearer token for attaching an account, so it lives for minutes. */
export const CONNECT_TTL_MINUTES = 15;

export type StartConnectResult =
  | { ok: true; url: string; sessionId: string; expiresAt: string }
  | { ok: false; code: "not_configured" | "no_origin" | "unavailable" | "not_found" | "provider"; message: string };

/**
 * Starts a connection (or a reconnection, when `accountId` is given).
 *
 * The session id goes to the provider as the reference it echoes back; it is the only thing that
 * maps the resulting account to this workspace, which is why it is created before the link and
 * never derived from the workspace id.
 */
export async function startLinkedInConnect(ctx: Ctx, accountId?: string): Promise<StartConnectResult> {
  const adapter = getLinkedInAdapter();
  if (!adapter) {
    return {
      ok: false,
      code: "not_configured",
      message: "LinkedIn connecting isn't configured on this deployment yet.",
    };
  }
  const origin = appOrigin();
  if (!origin) {
    return {
      ok: false,
      code: "no_origin",
      message: "This deployment has no public URL set, so the provider has nowhere to send you back to.",
    };
  }

  const session = await getRepository().createConnectSession(ctx, {
    channel: "linkedin",
    provider: adapter.provider,
    kind: accountId ? "reconnect" : "create",
    accountId,
    ttlMinutes: CONNECT_TTL_MINUTES,
  });
  if (!session) {
    // Either the account id was not this workspace's, or the store cannot park an attempt (demo
    // mode). Both are "we cannot start this", and neither should look like a provider outage.
    return accountId
      ? { ok: false, code: "not_found", message: "That account doesn't exist." }
      : {
          ok: false,
          code: "unavailable",
          message: "Connecting an account needs a database; this deployment runs without one.",
        };
  }

  // Unipile's own account id is required on a reconnect, and only the stored row knows it.
  let providerAccountId: string | undefined;
  if (accountId) {
    const { accounts } = await getRepository().listAccounts(ctx);
    providerAccountId = accounts.find((a) => a.id === accountId)?.connection.providerAccountId ?? undefined;
    if (!providerAccountId) {
      return {
        ok: false,
        code: "not_found",
        message: "That account was added by hand, so there is no connection to repair. Connect a new one instead.",
      };
    }
  }

  try {
    const link = await adapter.createHostedAuth({
      kind: accountId ? "reconnect" : "create",
      reference: session.id,
      providerAccountId,
      successUrl: `${origin}${INTEGRATIONS_HREF}?connected=${encodeURIComponent(session.id)}`,
      failureUrl: `${origin}${INTEGRATIONS_HREF}?failed=${encodeURIComponent(session.id)}`,
      notifyUrl: `${origin}/api/webhooks/unipile/notify`,
      expiresAt: new Date(session.expiresAt),
    });
    return { ok: true, url: link.url, sessionId: session.id, expiresAt: session.expiresAt };
  } catch (caught) {
    console.error("[linkedin-connect]", caught);
    return {
      ok: false,
      code: "provider",
      message: "The provider wouldn't start a sign-in just now. Try again in a minute.",
    };
  }
}
