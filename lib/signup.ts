/**
 * The signup contract: validation and the invite allowlist.
 *
 * Deliberately **import-free and erasable**, like lib/demoRequest.ts, so the same checks run in
 * the browser form, in the route handler, and under `node --test` (see CLAUDE.md on the test
 * runner's constraints). The database half of signup lives in lib/auth.ts.
 *
 * Signup is **invite-only**: an address must appear in `SIGNUP_ALLOWED_EMAILS`. That is the MVP
 * gate. An open form on a public URL lets anyone create a workspace and fill the database, and
 * with no email verification there is no way to tell a real person from a script. An allowlist
 * costs one env var and turns "anyone on the internet" into "the people you named".
 */

export const NAME_MAX = 80;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
/**
 * scrypt cost grows with input, and the password is hashed on every signup and login attempt, so
 * an unbounded password field is a cheap way to burn server CPU. 128 is far above any real one.
 */
export const PASSWORD_MAX = 128;

export type SignupInput = { name: string; email: string; password: string };
export type SignupField = keyof SignupInput;
export type SignupErrors = Partial<Record<SignupField, string>>;
export type SignupValidation =
  | { ok: true; data: SignupInput }
  | { ok: false; errors: SignupErrors };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** Trims the name, lowercases the email; the password is taken exactly as typed. */
export function validateSignup(input: unknown): SignupValidation {
  const body = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const name = str(body.name).trim();
  const email = str(body.email).trim().toLowerCase();
  const password = str(body.password);

  const errors: SignupErrors = {};
  if (!name) errors.name = "Enter your name.";
  else if (name.length > NAME_MAX) errors.name = `Keep your name to ${NAME_MAX} characters.`;

  if (!email) errors.email = "Enter your work email.";
  else if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";

  if (password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  else if (password.length > PASSWORD_MAX) errors.password = `Use ${PASSWORD_MAX} characters or fewer.`;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data: { name, email, password } };
}

/**
 * `a@x.com, B@y.com` or one per line → a lowercase set. Commas, semicolons, whitespace and
 * newlines all separate, because this comes from a hand-edited env var and the failure mode of a
 * strict parser is a tester locked out by a stray space.
 */
export function parseAllowlist(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[\s,;]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Exact-address match only. A domain wildcard would be convenient for a company, but it would
 * also let anyone who can receive mail on that domain in, and for three or four testers listing
 * the people is the right granularity.
 */
export function isInvited(email: string, allowlist: Set<string>): boolean {
  return allowlist.has(email.trim().toLowerCase());
}

/** The wire response from POST /api/signup, shared by the route and the form. */
export type SignupResponse =
  | { ok: true }
  | { ok: false; code: "invalid"; message: string; errors: SignupErrors }
  | { ok: false; code: "not_invited" | "exists" | "unavailable" | "server_error"; message: string };
