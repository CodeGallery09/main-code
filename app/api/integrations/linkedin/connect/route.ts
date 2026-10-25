import { fail, json, principal, readJson } from "@/lib/http";
import { startLinkedInConnect } from "@/lib/channels/connect";

/**
 * POST /api/integrations/linkedin/connect — opens a hosted sign-in and returns its URL.
 *
 * Body: `{ accountId? }`. With an account id it repairs that connection instead of making a new
 * one. The reply carries the connect-session id; the screen then polls
 * `GET /api/integrations/linkedin/connect/:id` until the provider's callback lands.
 *
 * Not `withUser`, because the failure codes are specific: 503 `not_configured` when there is no
 * API key (the same shape `/api/demo-request` uses), 502 when the provider refuses.
 */
export async function POST(request: Request) {
  const who = await principal();
  if (!who) return fail("unauthenticated", "Sign in to use this endpoint.", 401);
  const body = await readJson(request);
  const accountId =
    body && typeof body === "object" && "accountId" in body && typeof body.accountId === "string"
      ? body.accountId
      : undefined;

  const result = await startLinkedInConnect({ workspaceId: who.workspaceId, userId: who.userId }, accountId);
  if (result.ok) return json({ url: result.url, sessionId: result.sessionId, expiresAt: result.expiresAt }, 201);

  const status =
    result.code === "not_found" ? 404 : result.code === "provider" ? 502 : result.code === "no_origin" ? 500 : 503;
  return fail(result.code, result.message, status);
}

/** GET is not a connect: a link prefetch must never open a sign-in or write a session row. */
export async function GET() {
  return fail("method_not_allowed", "Use POST to start a connection.", 405);
}

