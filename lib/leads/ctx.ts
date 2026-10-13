/**
 * Server-only: the tenancy context for the lead-upload endpoints.
 *
 * `Ctx` is resolved from the signed session cookie and never from a request
 * body or query parameter — a client-supplied workspace id would be a tenancy
 * bypass. This lives here rather than in `lib/http.ts` only because that file
 * is mid-refactor; fold it in once `withUser` hands a `Ctx` to its handlers.
 */

import { cookies } from "next/headers";
import { SESSION_COOKIE, resolveSession } from "@/lib/auth";
import type { Ctx } from "@/lib/data/repository";

/** The caller's context, or null when the cookie is missing, expired or forged. */
export async function requestCtx(): Promise<Ctx | null> {
  const principal = await resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  return principal ? { workspaceId: principal.workspaceId, userId: principal.userId } : null;
}
