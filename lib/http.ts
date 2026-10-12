/**
 * Small helpers shared by every route handler, so responses and failures look the same
 * everywhere and swapping in a database doesn't change the HTTP contract.
 */

import { cookies } from "next/headers";
import { SESSION_COOKIE, readSession } from "@/lib/auth";
import type { Channel, RangeKey } from "@/lib/data/types";

export const json = <T>(body: T, status = 200) =>
  Response.json(body, {
    status,
    // App data is per-session and changes on write; never let a proxy keep a copy.
    headers: { "Cache-Control": "no-store" },
  });

export const fail = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

/** Resolves the signed-in email, or null when the session cookie is missing or forged. */
export async function sessionEmail(): Promise<string | null> {
  return readSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Wraps a handler so unauthenticated calls get a consistent 401 instead of a crash. */
export async function withUser<T>(run: (email: string) => Promise<T>): Promise<Response> {
  const email = await sessionEmail();
  if (!email) return fail("unauthenticated", "Sign in to use this endpoint.", 401);
  try {
    return json(await run(email));
  } catch (error) {
    console.error("[api]", error);
    return fail("server_error", "Something went wrong handling that request.", 500);
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
