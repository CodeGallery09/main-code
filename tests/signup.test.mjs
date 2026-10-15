import test from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_MAX,
  COMPANY_MAX,
  NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  isInvited,
  parseAllowlist,
  validateSignup,
} from "../lib/signup.ts";

/* ------------------------------------------------------------- validation -- */

test("a complete signup validates and is normalised", () => {
  const result = validateSignup({
    name: "  Aarav Kapoor ",
    company: "  Acme   Growth  ",
    email: "  Aarav@Example.COM ",
    password: "correct horse",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    name: "Aarav Kapoor",
    company: "Acme Growth",
    email: "aarav@example.com",
    password: "correct horse",
  });
});

test("the password is taken exactly as typed — never trimmed", () => {
  // Trimming would silently change the secret: a user who typed a trailing space could never
  // sign in again with what they remember.
  const result = validateSignup({ company: "Acme", name: "A", email: "a@b.co", password: "  spaced out  " });
  assert.equal(result.data.password, "  spaced out  ");
});

test("every missing field is reported at once, not one per submit", () => {
  const result = validateSignup({});
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["company", "email", "name", "password"]);
});

test("non-object input is treated as empty rather than crashing", () => {
  for (const input of [null, undefined, 42, "x", []]) {
    const result = validateSignup(input);
    assert.equal(result.ok, false);
  }
});

test("non-string fields are rejected, not coerced", () => {
  const result = validateSignup({ company: "Acme", name: 123, email: ["a@b.co"], password: { x: 1 } });
  assert.equal(result.ok, false);
  assert.equal(result.errors.name, "Enter your name.");
  assert.equal(result.errors.email, "Enter your work email.");
});

test("email needs an @ and a dotted domain", () => {
  for (const email of ["nope", "a@b", "a b@c.co", "@c.co", "a@"]) {
    assert.equal(validateSignup({ company: "Acme", name: "A", email, password: "longenough" }).ok, false, email);
  }
  assert.equal(validateSignup({ company: "Acme", name: "A", email: "first.last+tag@sub.example.com", password: "longenough" }).ok, true);
});

test("password length is bounded on both sides", () => {
  assert.equal(validateSignup({ company: "Acme", name: "A", email: "a@b.co", password: "x".repeat(PASSWORD_MIN - 1) }).ok, false);
  assert.equal(validateSignup({ company: "Acme", name: "A", email: "a@b.co", password: "x".repeat(PASSWORD_MIN) }).ok, true);
  assert.equal(validateSignup({ company: "Acme", name: "A", email: "a@b.co", password: "x".repeat(PASSWORD_MAX) }).ok, true);
  const tooLong = validateSignup({ company: "Acme", name: "A", email: "a@b.co", password: "x".repeat(PASSWORD_MAX + 1) });
  assert.equal(tooLong.ok, false, "an unbounded password is a cheap way to burn scrypt CPU");
  assert.match(tooLong.errors.password, /128/);
});

test("name and email lengths are capped", () => {
  assert.equal(validateSignup({ company: "Acme", name: "x".repeat(NAME_MAX + 1), email: "a@b.co", password: "longenough" }).ok, false);
  const longEmail = `${"x".repeat(EMAIL_MAX)}@b.co`;
  assert.equal(validateSignup({ company: "Acme", name: "A", email: longEmail, password: "longenough" }).ok, false);
});

test("the company name is required — it becomes the workspace name", () => {
  const missing = validateSignup({ name: "A", email: "a@b.co", password: "longenough" });
  assert.equal(missing.ok, false);
  assert.equal(missing.errors.company, "Enter your company name.");
  assert.equal(validateSignup({ name: "A", company: "   ", email: "a@b.co", password: "longenough" }).ok, false);
});

test("the company name is trimmed, collapsed and length-capped", () => {
  const spaced = validateSignup({ name: "A", company: "  Brightline \t Logistics ", email: "a@b.co", password: "longenough" });
  assert.equal(spaced.data.company, "Brightline Logistics", "it is displayed, so stray whitespace would show");
  const tooLong = validateSignup({ name: "A", company: "x".repeat(COMPANY_MAX + 1), email: "a@b.co", password: "longenough" });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.errors.company, /80/);
  assert.equal(validateSignup({ name: "A", company: "x".repeat(COMPANY_MAX), email: "a@b.co", password: "longenough" }).ok, true);
});

test("a company that is not a string is rejected, not coerced", () => {
  for (const company of [123, ["Acme"], { x: 1 }, null]) {
    assert.equal(validateSignup({ name: "A", company, email: "a@b.co", password: "longenough" }).ok, false);
  }
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
