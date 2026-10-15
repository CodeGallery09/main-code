import test from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_MAX,
  NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  isInvited,
  parseAllowlist,
  validateSignup,
} from "../lib/signup.ts";

/* ------------------------------------------------------------- validation -- */

test("a complete signup validates and is normalised", () => {
  const result = validateSignup({ name: "  Aarav Kapoor ", email: "  Aarav@Example.COM ", password: "correct horse" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { name: "Aarav Kapoor", email: "aarav@example.com", password: "correct horse" });
});

test("the password is taken exactly as typed — never trimmed", () => {
  // Trimming would silently change the secret: a user who typed a trailing space could never
  // sign in again with what they remember.
  const result = validateSignup({ name: "A", email: "a@b.co", password: "  spaced out  " });
  assert.equal(result.data.password, "  spaced out  ");
});

test("every missing field is reported at once, not one per submit", () => {
  const result = validateSignup({});
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["email", "name", "password"]);
});

test("non-object input is treated as empty rather than crashing", () => {
  for (const input of [null, undefined, 42, "x", []]) {
    const result = validateSignup(input);
    assert.equal(result.ok, false);
  }
});

test("non-string fields are rejected, not coerced", () => {
  const result = validateSignup({ name: 123, email: ["a@b.co"], password: { x: 1 } });
  assert.equal(result.ok, false);
  assert.equal(result.errors.name, "Enter your name.");
  assert.equal(result.errors.email, "Enter your work email.");
});

test("email needs an @ and a dotted domain", () => {
  for (const email of ["nope", "a@b", "a b@c.co", "@c.co", "a@"]) {
    assert.equal(validateSignup({ name: "A", email, password: "longenough" }).ok, false, email);
  }
  assert.equal(validateSignup({ name: "A", email: "first.last+tag@sub.example.com", password: "longenough" }).ok, true);
});

test("password length is bounded on both sides", () => {
  assert.equal(validateSignup({ name: "A", email: "a@b.co", password: "x".repeat(PASSWORD_MIN - 1) }).ok, false);
  assert.equal(validateSignup({ name: "A", email: "a@b.co", password: "x".repeat(PASSWORD_MIN) }).ok, true);
  assert.equal(validateSignup({ name: "A", email: "a@b.co", password: "x".repeat(PASSWORD_MAX) }).ok, true);
  const tooLong = validateSignup({ name: "A", email: "a@b.co", password: "x".repeat(PASSWORD_MAX + 1) });
  assert.equal(tooLong.ok, false, "an unbounded password is a cheap way to burn scrypt CPU");
  assert.match(tooLong.errors.password, /128/);
});

test("name and email lengths are capped", () => {
  assert.equal(validateSignup({ name: "x".repeat(NAME_MAX + 1), email: "a@b.co", password: "longenough" }).ok, false);
  const longEmail = `${"x".repeat(EMAIL_MAX)}@b.co`;
  assert.equal(validateSignup({ name: "A", email: longEmail, password: "longenough" }).ok, false);
});

/* -------------------------------------------------------------- allowlist -- */

test("the allowlist accepts commas, semicolons, spaces and newlines", () => {
  const list = parseAllowlist("a@x.com, b@y.com;c@z.com\nd@w.com   e@v.com");
  assert.deepEqual([...list].sort(), ["a@x.com", "b@y.com", "c@z.com", "d@w.com", "e@v.com"]);
});

test("the allowlist is case-insensitive on both sides", () => {
  const list = parseAllowlist("Aarav@Example.com");
  assert.equal(isInvited("aarav@example.com", list), true);
  assert.equal(isInvited("  AARAV@EXAMPLE.COM ", list), true);
});

test("an unset or empty allowlist invites nobody — closed by default", () => {
  for (const raw of [undefined, null, "", "   ", ",,;"]) {
    const list = parseAllowlist(raw);
    assert.equal(list.size, 0);
    assert.equal(isInvited("anyone@example.com", list), false, `raw=${JSON.stringify(raw)}`);
  }
});

test("matching is exact: no domain wildcards, no substring matches", () => {
  const list = parseAllowlist("a@x.com");
  assert.equal(isInvited("ba@x.com", list), false);
  assert.equal(isInvited("a@x.com.evil.test", list), false);
  assert.equal(isInvited("a@sub.x.com", list), false);
  assert.equal(isInvited("a@x.co", list), false);
});

test("a listed '*@domain' entry does not turn into a wildcard", () => {
  const list = parseAllowlist("*@x.com");
  assert.equal(isInvited("anyone@x.com", list), false);
});
