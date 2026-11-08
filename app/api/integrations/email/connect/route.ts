import { fail, json, principal, readJson } from "@/lib/http";
import { startConnect } from "@/lib/channels/connect";

/**
 * POST /api/integrations/email/connect — opens a hosted sign-in for a mailbox (Gmail / Google
 * Workspace, Outlook / Microsoft 365, or any IMAP mailbox) and returns its URL.
 *
 * The same flow as LinkedIn's (`/api/integrations/linkedin/connect`): body `{ accountId? }` repairs
 * an existing mailbox instead, the screen polls `GET /api/integrations/linkedin/connect/:id` (the
 * session read is channel-agnostic), and the provider's callback attaches the mailbox. The
 * mailbox's password or OAuth grant stays with the provider.
 */
export async function POST(request: Request) {
  const who = await principal();
  if (!who) return fail("unauthenticated", "Sign in to use this endpoint.", 401);
  const body = await readJson(request);
  const accountId =
    body && typeof body === "object" && "accountId" in body && typeof body.accountId === "string"
      ? body.accountId
      : undefined;

  const result = await startConnect(
    { workspaceId: who.workspaceId, userId: who.userId },
    "email",
    accountId,
    new URL(request.url).origin,
  );
  if (result.ok) return json({ url: result.url, sessionId: result.sessionId, expiresAt: result.expiresAt }, 201);

  const status =
    result.code === "not_found" ? 404 : result.code === "provider" ? 502 : result.code === "no_origin" ? 500 : 503;
  return fail(result.code, result.message, status);
}

/** GET is not a connect: a link prefetch must never open a sign-in or write a session row. */
export async function GET() {
  return fail("method_not_allowed", "Use POST to start a connection.", 405);
}
