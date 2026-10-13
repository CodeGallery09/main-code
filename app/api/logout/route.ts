import { cookies } from "next/headers";
import { clearCookieHeader, SESSION_COOKIE, signOut } from "@/lib/auth";

/**
 * POST /api/logout — deletes the session row, then clears the cookie.
 *
 * Deleting server-side is the part that matters: clearing the cookie alone would leave a valid
 * session behind for anyone who had already copied it.
 */
export async function POST() {
  await signOut((await cookies()).get(SESSION_COOKIE)?.value);
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", clearCookieHeader());
  return res;
}
