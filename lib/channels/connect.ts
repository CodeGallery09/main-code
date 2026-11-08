/**
 * Opening a connection — a LinkedIn seat or a mailbox — in one place.
 *
 * Every connect route does the same three things — open a connect session, ask the provider for a
 * hosted sign-in link, hand back the URL — so they do it here rather than once per channel. The
 * channel decides only which providers the hosted wizard offers (LinkedIn, or Gmail / Outlook /
 * IMAP) and which kind of account the callback must come back with.
 *
 * Server-only.
 */

import { getRepository, type Ctx } from "@/lib/data";
import { appOrigin, getLinkedInAdapter } from "@/lib/channels";
import { SETUP_HREF } from "@/lib/nav";

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
export async function startConnect(
  ctx: Ctx,
  channel: "linkedin" | "email",
  accountId?: string,
  /**
   * The origin the member is browsing on. The hosted sign-in sends them back here, and the session
   * cookie belongs to this exact host: returning them to the canonical domain instead lands a
   * member who signed in on a deployment URL on a host with no cookie, which reads as a logout.
   */
  returnOrigin?: string,
): Promise<StartConnectResult> {
  const adapter = getLinkedInAdapter();
  if (!adapter) {
    return {
      ok: false,
      code: "not_configured",
      message: `Connecting ${channel === "email" ? "a mailbox" : "LinkedIn"} isn't configured on this deployment yet.`,
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

  // The provider's server-to-server callback stays on the public domain; only the browser's
  // return trip follows the host the member is on.
  const back = returnOrigin ?? origin;

  const session = await getRepository().createConnectSession(ctx, {
    channel,
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
    providerAccountId =
      accounts.find((a) => a.id === accountId && a.channel === channel)?.connection.providerAccountId ?? undefined;
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
      channel,
      reference: session.id,
      providerAccountId,
      successUrl: `${back}${SETUP_HREF}?connected=${encodeURIComponent(session.id)}`,
      failureUrl: `${back}${SETUP_HREF}?failed=${encodeURIComponent(session.id)}`,
      notifyUrl: `${origin}/api/webhooks/unipile/notify`,
      expiresAt: new Date(session.expiresAt),
    });
    return { ok: true, url: link.url, sessionId: session.id, expiresAt: session.expiresAt };
  } catch (caught) {
    console.error(`[${channel}-connect]`, caught);
    return {
      ok: false,
      code: "provider",
      message: "The provider wouldn't start a sign-in just now. Try again in a minute.",
    };
  }
}

/** The LinkedIn connect, kept under its old name for the routes that already call it. */
export const startLinkedInConnect = (ctx: Ctx, accountId?: string, returnOrigin?: string) =>
  startConnect(ctx, "linkedin", accountId, returnOrigin);
