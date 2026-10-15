import { sessionCookieHeader, signUp } from "@/lib/auth";
import { json } from "@/lib/http";
import { validateSignup, type SignupResponse } from "@/lib/signup";

const reply = (body: SignupResponse, status: number) => json(body, status);

/**
 * POST /api/signup — creates an account and signs it in.
 *
 * Success is a 201 with the session cookie; the form only shows success on that, never on its own
 * validation. Every refusal carries a `code` the form can branch on:
 *   422 invalid       — field errors, same shape the form renders inline
 *   403 not_invited   — the address is not on SIGNUP_ALLOWED_EMAILS
 *   409 exists        — that address already has an account; sign in instead
 *   503 unavailable   — no database configured, so there is nowhere to create an account
 */
export async function POST(request: Request) {
  // Require a JSON body. A cross-site page can send a form-encoded or text/plain POST without a
  // CORS preflight, but cannot send application/json that way, so this closes that door for free.
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return reply({ ok: false, code: "invalid", message: "Send a JSON body.", errors: {} }, 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ ok: false, code: "invalid", message: "Request body must be JSON.", errors: {} }, 400);
  }

  const checked = validateSignup(body);
  if (!checked.ok) {
    return reply(
      { ok: false, code: "invalid", message: "Check the highlighted fields.", errors: checked.errors },
      422,
    );
  }

  try {
    const result = await signUp(checked.data);

    if (!result.ok) {
      switch (result.code) {
        case "not_invited":
          return reply(
            {
              ok: false,
              code: "not_invited",
              message: "Sign-ups are invite-only right now. Ask the Flightpath team for access.",
            },
            403,
          );
        case "exists":
          return reply(
            { ok: false, code: "exists", message: "An account with this email already exists. Sign in instead." },
            409,
          );
        case "unavailable":
          return reply(
            { ok: false, code: "unavailable", message: "Account creation isn't available on this deployment yet." },
            503,
          );
      }
    }

    const res = reply({ ok: true }, 201);
    res.headers.append("Set-Cookie", sessionCookieHeader(result.cookie));
    return res;
  } catch (error) {
    console.error("[signup]", error);
    return reply(
      { ok: false, code: "server_error", message: "Something went wrong creating your account. Try again." },
      500,
    );
  }
}
