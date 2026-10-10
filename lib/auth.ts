import { createHmac, timingSafeEqual } from "node:crypto";

// PROTOTYPE ONLY. A single hardcoded account stands in for real authentication.
// Server-only: this file must never be imported from a client component.
const DEMO_EMAIL = "founders0910@gmail.com";
const DEMO_PASSWORD = "Saayem#123";

export const SESSION_COOKIE = "fp_session";
export const SESSION_MAX_AGE = 60 * 60 * 8;

const secret = () => process.env.AUTH_SESSION_SECRET ?? "flightpath-dev-only-secret";
const sign = (email: string) => createHmac("sha256", secret()).update(email).digest("hex");

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function checkCredentials(email: string, password: string): boolean {
  // Evaluate both so timing doesn't reveal which one was wrong.
  const emailOk = safeEqual(email.trim().toLowerCase(), DEMO_EMAIL);
  const passwordOk = safeEqual(password, DEMO_PASSWORD);
  return emailOk && passwordOk;
}

export const createSessionValue = () => `${DEMO_EMAIL}.${sign(DEMO_EMAIL)}`;

/** Returns the signed-in email, or null if the cookie is missing or has been tampered with. */
export function readSession(value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i < 1) return null;
  const email = value.slice(0, i);
  return safeEqual(value.slice(i + 1), sign(email)) && email === DEMO_EMAIL ? email : null;
}
