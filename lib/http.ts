/**
 * Small helpers shared by every route handler, so responses and failures look the same
 * everywhere and swapping in a database doesn't change the HTTP contract.
 */

import { cookies } from "next/headers";
import { SESSION_COOKIE, resolveSession, type Principal } from "@/lib/auth";
import { isWriteError, type Ctx } from "@/lib/data/repository";
import type { Channel, RangeKey } from "@/lib/data/types";
import type { ValidationErrors } from "@/lib/data/validate";

export const json = <T>(body: T, status = 200) =>
  Response.json(body, {
    status,
    // App data is per-session and changes on write; never let a proxy keep a copy.
    headers: { "Cache-Control": "no-store" },
  });

export const fail = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

/** 422 with per-field errors, the shape the client forms already render. */
export const failFields = (errors: ValidationErrors) =>
  json({ error: { code: "invalid", message: "Check the highlighted fields.", fields: errors } }, 422);

export const notFound = () => fail("not_found", "That record does not exist.", 404);

/** Resolves the signed-in principal, or null when the cookie is missing, forged or expired. */
export async function principal(): Promise<Principal | null> {
  return resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/**
 * Wraps a handler so unauthenticated calls get a consistent 401 instead of a crash.
 *
 * The `Ctx` it passes is built **only** from the session — never from a query parameter or
 * request body. A client-supplied workspace id would be a tenancy bypass: anyone could read
 * another workspace by editing a URL.
 */
export async function withUser<T>(run: (ctx: Ctx) => Promise<T>): Promise<Response> {
  const who = await principal();
  if (!who) return fail("unauthenticated", "Sign in to use this endpoint.", 401);
  try {
    const result = await run({ workspaceId: who.workspaceId, userId: who.userId });
    if (result === null || result === undefined) return notFound();
    // A repository write that was refused for a stated reason becomes a 422, not a 500.
    if (isWriteError(result)) {
      return failFields({ [result.error.field]: result.error.message });
    }
    return json(result);
  } catch (error) {
    console.error("[api]", error);
    return fail("server_error", "Something went wrong handling that request.", 500);
  }
}

/** Parses a JSON body, returning null when it is absent or malformed. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

const RANGES: RangeKey[] = ["7d", "30d", "90d"];
export function parseRange(value: string | null): RangeKey {
  return RANGES.includes(value as RangeKey) ? (value as RangeKey) : "30d";
}

const CHANNELS: Channel[] = ["linkedin", "email", "whatsapp", "call", "sms"];
/** `?channels=linkedin,email` → a validated list, or null for "all channels". */
export function parseChannels(value: string | null): Channel[] | null {
  if (!value) return null;
  const picked = value
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is Channel => CHANNELS.includes(part as Channel));
  return picked.length ? picked : null;
}

export function parseInt10(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
