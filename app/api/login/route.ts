import { sessionCookieHeader, signIn } from "@/lib/auth";

/**
 * POST /api/login — verifies credentials and sets the session cookie.
 *
 * The failure message is identical for an unknown address and a wrong password, deliberately:
 * telling them apart hands an attacker a list of which accounts exist.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "Request body must be JSON." }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json({ ok: false, message: "Incorrect email or password." }, { status: 401 });
  }

  const result = await signIn(email, password);
  if (!result.ok) {
    return Response.json({ ok: false, message: "Incorrect email or password." }, { status: 401 });
  }

  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", sessionCookieHeader(result.cookie));
  return res;
}
