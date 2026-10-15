/**
 * Authentication. **Server-only — never import this from a client component.**
 *
 * Two modes, chosen by whether `DATABASE_URL` is set:
 *
 * - **Database mode.** Users live in the `users` table with a scrypt password hash; sessions are
 *   rows in `sessions` and the cookie carries nothing but an opaque random id. `signUp()` creates
 *   a workspace + owner + session in one transaction, and is invite-only (`SIGNUP_ALLOWED_EMAILS`).
 * - **Demo mode.** No database configured, so the single hardcoded account and an HMAC cookie
 *   stand in, exactly as the prototype did. The marketing site and a bare `git clone` still work.
 *   Sign-up is unavailable here (there is nowhere to put an account), and says so.
 *
 * Why the session is a database row rather than a signed claim: the prototype's cookie was an
 * HMAC over the email address with no expiry inside the signature, so a cookie that leaked stayed
 * valid forever and could not be revoked — the `Max-Age` on it was a client-side courtesy, not a
 * control. A session row can be deleted (revocation) and carries `expiresAt` the server checks
 * (expiry). It also carries the workspace, which is what makes tenancy resolvable from the
 * session instead of from a request parameter a caller could forge.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db/client";
import { channelQuotas, memberships, sessions, users, workspaces } from "@/lib/db/schema";
import { seedSampleWorkspace } from "@/lib/data/sampleSeed";
import { hashPassword, verifyPassword } from "@/lib/password";
import { isInvited, parseAllowlist, type SignupInput } from "@/lib/signup";

export { hashPassword, verifyPassword } from "@/lib/password";

export const SESSION_COOKIE = "fp_session";
/** 8 hours. Short enough that a stolen cookie has a bounded life. */
export const SESSION_MAX_AGE = 60 * 60 * 8;

/** Ids the demo store uses, so `Ctx` is populated identically in both modes. */
export const DEMO_EMAIL = "founders0910@gmail.com";
export const DEMO_WORKSPACE_ID = "w_demo";
export const DEMO_USER_ID = "u_1";
const DEMO_PASSWORD = "Saayem#123";

/** Who the request is acting as. Everything downstream derives `Ctx` from this. */
export type Principal = {
  userId: string;
  workspaceId: string;
  email: string;
  name: string;
};

const secret = () => process.env.AUTH_SESSION_SECRET ?? "flightpath-dev-only-secret";

/* ----------------------------------------------------------- demo cookie -- */

const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("hex");

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const demoCookie = () => `${DEMO_EMAIL}.${sign(DEMO_EMAIL)}`;

function readDemoCookie(value: string | undefined): Principal | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i < 1) return null;
  const email = value.slice(0, i);
  if (!safeEqual(value.slice(i + 1), sign(email)) || email !== DEMO_EMAIL) return null;
  return { userId: DEMO_USER_ID, workspaceId: DEMO_WORKSPACE_ID, email, name: "Aarav Kapoor" };
}

/* --------------------------------------------------------------- sign in -- */

export type SignInResult = { ok: true; cookie: string } | { ok: false };

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const address = email.trim().toLowerCase();

  if (!hasDatabase()) {
    // Evaluate both so timing doesn't reveal which half was wrong.
    const emailOk = safeEqual(address, DEMO_EMAIL);
    const passwordOk = safeEqual(password, DEMO_PASSWORD);
    return emailOk && passwordOk ? { ok: true, cookie: demoCookie() } : { ok: false };
  }

  const db = getDb();
  const [found] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, address))
    .limit(1);

  // Hash anyway on an unknown address: returning early makes "no such user" measurably
  // faster than "wrong password", which turns login into an account-enumeration oracle.
  const ok = await verifyPassword(password, found?.passwordHash ?? null);
  if (!found || !ok) return { ok: false };

  const [membership] = await db
    .select({ workspaceId: memberships.workspaceId })
    .from(memberships)
    .where(eq(memberships.userId, found.id))
    .limit(1);
  if (!membership) return { ok: false };

  // Clear this user's expired sessions while we are here. Nothing else prunes them, and each
  // sign-in adds a row, so without this the table only ever grows.
  await db.delete(sessions).where(and(eq(sessions.userId, found.id), lt(sessions.expiresAt, new Date())));

  const id = newSessionId();
  await db.insert(sessions).values({
    id,
    userId: found.id,
    workspaceId: membership.workspaceId,
    expiresAt: sessionExpiry(),
  });
  return { ok: true, cookie: id };
}

const newSessionId = () => randomBytes(32).toString("hex");
/** `org_` + 12 url-safe characters. See `signUp` for why this is the tenant key. */
export const newOrgId = () => `org_${randomBytes(9).toString("base64url")}`;
const sessionExpiry = () => new Date(Date.now() + SESSION_MAX_AGE * 1000);

/* --------------------------------------------------------------- sign up -- */

export type SignUpResult =
  | { ok: true; cookie: string }
  /** `unavailable`: no database is configured, so there is nowhere to put an account. */
  | { ok: false; code: "not_invited" | "exists" | "unavailable" };

/**
 * Placeholder plan limits for a new workspace, until a plan/billing model exists. Only the two
 * channels the product actually runs get a row: WhatsApp, calls and SMS are "Planned" (see the
 * content rules in CLAUDE.md), and a zero-cap row would invite a divide-by-zero in a meter.
 */
const DEFAULT_QUOTAS = [
  { channel: "linkedin", cap: 100 },
  { channel: "email", cap: 200 },
] as const;

/**
 * Pulls a Postgres error code out of whatever the driver threw. Drizzle wraps the driver's error
 * and keeps the original on `.cause`, so checking `error.code` alone silently misses it — which
 * would turn a harmless "that email is taken" into a 500.
 */
function pgErrorCode(error: unknown): string | undefined {
  const own = (error as { code?: unknown } | null)?.code;
  if (typeof own === "string") return own;
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof cause === "string" ? cause : undefined;
}

/**
 * Creates a workspace, its owner and a live session in one transaction, so a failure part-way
 * can never leave an account with no workspace or a workspace nobody owns.
 *
 * **Invite-only.** The address must be in `SIGNUP_ALLOWED_EMAILS`; unset means nobody can sign
 * up. The check runs before any hashing or writing, so a stranger costs nothing.
 *
 * What this leaks, knowingly: an invited address learns whether it already has an account
 * (`exists`), and response time differs slightly between invited and not-invited. Both are only
 * visible to people who already know the address, and an allowlist of a few testers is not a
 * secret worth defending with timing padding.
 */
export async function signUp(input: SignupInput): Promise<SignUpResult> {
  if (!hasDatabase()) return { ok: false, code: "unavailable" };
  if (!isInvited(input.email, parseAllowlist(process.env.SIGNUP_ALLOWED_EMAILS))) {
    return { ok: false, code: "not_invited" };
  }

  // Hash first. scrypt is deliberately slow, and doing it inside the transaction would hold a
  // pooled connection open for the whole computation.
  const passwordHash = await hashPassword(input.password);

  const userId = `u_${randomBytes(9).toString("base64url")}`;
  // The org id: the tenant key every table carries as `workspace_id`. Opaque and unguessable
  // (72 random bits), so it is safe to put in URLs and logs; the `org_` prefix makes it
  // recognisable in either. One org has one workspace today, so the two are the same id.
  const workspaceId = newOrgId();
  const sessionId = newSessionId();

  try {
    await getDb().transaction(async (tx) => {
      await tx.insert(workspaces).values({ id: workspaceId, name: input.company });
      await tx.insert(users).values({
        id: userId,
        email: input.email,
        name: input.name,
        passwordHash,
      });
      await tx.insert(memberships).values({ workspaceId, userId, role: "owner" });
      await tx
        .insert(channelQuotas)
        .values(DEFAULT_QUOTAS.map((q) => ({ workspaceId, channel: q.channel, used: 0, cap: q.cap })));
      // Sample content goes in the same transaction, so a workspace is never half-seeded.
      await seedSampleWorkspace(tx, workspaceId, userId);
      await tx.insert(sessions).values({ id: sessionId, userId, workspaceId, expiresAt: sessionExpiry() });
    });
  } catch (error) {
    // 23505 = unique_violation. The only unique key a caller can collide on is the email: ids
    // are random. Two simultaneous signups for one address land here, and the transaction has
    // already rolled back, so the loser leaves nothing behind.
    if (pgErrorCode(error) === "23505") return { ok: false, code: "exists" };
    throw error;
  }

  return { ok: true, cookie: sessionId };
}

/* ---------------------------------------------------------- read / clear -- */

/**
 * Resolves the cookie to a principal, or null when it is missing, unknown or expired.
 * Expiry is checked here, server-side — the cookie's own `Max-Age` is advisory.
 */
export async function resolveSession(value: string | undefined): Promise<Principal | null> {
  if (!value) return null;
  if (!hasDatabase()) return readDemoCookie(value);

  const db = getDb();
  const [row] = await db
    .select({
      userId: sessions.userId,
      workspaceId: sessions.workspaceId,
      expiresAt: sessions.expiresAt,
      email: users.email,
      name: users.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, value))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, value));
    return null;
  }
  // Guard against a workspace deleted under a live session.
  const [ok] = await db
    .select({ id: memberships.workspaceId })
    .from(memberships)
    .where(and(eq(memberships.userId, row.userId), eq(memberships.workspaceId, row.workspaceId)))
    .limit(1);
  if (!ok) return null;

  return { userId: row.userId, workspaceId: row.workspaceId, email: row.email, name: row.name };
}

/** Deletes the session row, so signing out revokes the cookie rather than just dropping it. */
export async function signOut(value: string | undefined): Promise<void> {
  if (!value || !hasDatabase()) return;
  await getDb().delete(sessions).where(eq(sessions.id, value));
}

/** Housekeeping for expired rows. Safe to call from a cron tick. */
export async function pruneSessions(): Promise<number> {
  if (!hasDatabase()) return 0;
  const gone = await getDb()
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return gone.length;
}

/* ---------------------------------------------------------------- cookie -- */

/** One place that builds the Set-Cookie header, so flags can't drift between routes. */
export function sessionCookieHeader(value: string, maxAge = SESSION_MAX_AGE): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export const clearCookieHeader = () => sessionCookieHeader("", 0);

/** True when a workspace exists for this id — used by the seed and health checks. */
export async function workspaceExists(id: string): Promise<boolean> {
  if (!hasDatabase()) return id === DEMO_WORKSPACE_ID;
  const [row] = await getDb()
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  return Boolean(row);
}
