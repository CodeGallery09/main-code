import { SESSION_COOKIE, SESSION_MAX_AGE, checkCredentials, createSessionValue } from "../../../lib/auth";

// Prototype login: checks the single hardcoded account in lib/auth.ts and sets a signed, httpOnly cookie.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "Request body must be JSON." }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string" || !checkCredentials(email, password)) {
    return Response.json({ ok: false, message: "Incorrect email or password." }, { status: 401 });
  }

  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(createSessionValue())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  return res;
}
