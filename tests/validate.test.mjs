import test from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeEmail,
  normalisePhone,
  validateStrategy,
  validateAudience,
  validateMessageBody,
  NAME_MAX,
  TAGS_MAX,
} from "../lib/data/validate.ts";

/* ------------------------------------------------------------------ audience -- */

test("a create needs a name", () => {
  const result = validateAudience({});
  assert.equal(result.ok, false);
  assert.equal(result.errors.name, "Enter the audience's name.");
});

test("a create fills defaults for everything optional", () => {
  const result = validateAudience({ name: "Omar Haddad" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    name: "Omar Haddad",
    company: "",
    title: "",
    email: null,
    phone: null,
    linkedin: null,
    stage: "new",
    source: "form",
    score: 0,
    tags: [],
    consent: false,
    starred: false,
    nextStep: "",
    ownerId: null,
    strategyId: null,
    segmentIds: [],
  });
});

test("a lead's audiences are a list, de-duplicated, and replace what was there", () => {
  const made = validateAudience({ name: "Omar Haddad", segmentIds: ["seg_1", "seg_1", " seg_2 ", ""] });
  assert.deepEqual(made.data.segmentIds, ["seg_1", "seg_2"]);

  // A patch that says nothing about audiences must leave membership alone, so the key is absent.
  const quiet = validateAudience({ name: "Omar Haddad" }, true);
  assert.equal("segmentIds" in quiet.data, false);

  // An explicit empty list is "in none of them", which is different from saying nothing.
  assert.deepEqual(validateAudience({ segmentIds: [] }, true).data.segmentIds, []);

  assert.equal(validateAudience({ name: "Omar", segmentIds: "seg_1" }).ok, false);
  assert.equal(validateAudience({ name: "Omar", segmentIds: Array.from({ length: 51 }, (_, i) => `s${i}`) }).ok, false);
});

test("names are trimmed and length-capped", () => {
  assert.equal(validateAudience({ name: "  Maya Reyes  " }).data.name, "Maya Reyes");
  const tooLong = validateAudience({ name: "x".repeat(NAME_MAX + 1) });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.errors.name, /characters/);
});

test("email is lowercased, and a bad one is rejected", () => {
  assert.equal(validateAudience({ name: "A", email: "  Omar@Example.COM " }).data.email, "omar@example.com");
  assert.equal(validateAudience({ name: "A", email: "not-an-email" }).ok, false);
  // An explicitly empty string means "clear it", not "invalid".
  assert.equal(validateAudience({ name: "A", email: "" }).data.email, null);
});

test("a LinkedIn URL is stored with a scheme, the way an upload stores one", () => {
  assert.equal(
    validateAudience({ name: "A", linkedin: " linkedin.com/in/maya-reyes " }).data.linkedin,
    "https://linkedin.com/in/maya-reyes",
  );
  assert.equal(
    validateAudience({ name: "A", linkedin: "https://www.linkedin.com/in/maya/" }).data.linkedin,
    "https://www.linkedin.com/in/maya/",
  );
  assert.equal(validateAudience({ name: "A", linkedin: "maya reyes" }).ok, false);
  assert.equal(validateAudience({ name: "A", linkedin: "maya" }).ok, false);
  assert.equal(validateAudience({ name: "A", linkedin: "" }).data.linkedin, null);
  assert.equal(validateAudience({ linkedin: "" }, true).data.linkedin, null, "a PATCH can clear it");
});

test("stage accepts the widened vocabulary and rejects anything else", () => {
  for (const stage of ["new", "reaching", "engaged", "hot", "meeting", "nurture", "paused", "stopped", "closed"]) {
    assert.equal(validateAudience({ name: "A", stage }).ok, true, `${stage} should be valid`);
  }
  assert.equal(validateAudience({ name: "A", stage: "Hot" }).ok, false, "display casing is not a stored value");
  assert.equal(validateAudience({ name: "A", stage: "invented" }).ok, false);
});

test("score must sit between 0 and 100", () => {
  assert.equal(validateAudience({ name: "A", score: 0 }).data.score, 0);
  assert.equal(validateAudience({ name: "A", score: 100 }).data.score, 100);
  assert.equal(validateAudience({ name: "A", score: 61.6 }).data.score, 62, "rounded, not truncated");
  assert.equal(validateAudience({ name: "A", score: -1 }).ok, false);
  assert.equal(validateAudience({ name: "A", score: 101 }).ok, false);
});

test("tags are de-duplicated, blanks dropped, and the count capped", () => {
  assert.deepEqual(validateAudience({ name: "A", tags: ["pricing", "pricing", "  ", "8 seats"] }).data.tags, [
    "pricing",
    "8 seats",
  ]);
  const tooMany = validateAudience({ name: "A", tags: Array.from({ length: TAGS_MAX + 1 }, (_, i) => `t${i}`) });
  assert.equal(tooMany.ok, false);
  assert.equal(validateAudience({ name: "A", tags: "pricing" }).ok, false, "a string is not a list");
});

test("consent is never inferred — absent means false", () => {
  assert.equal(validateAudience({ name: "A" }).data.consent, false);
  assert.equal(validateAudience({ name: "A", consent: "yes" }).data.consent, false, "only a true boolean counts");
  assert.equal(validateAudience({ name: "A", consent: true }).data.consent, true);
});

test("a patch validates only the fields sent", () => {
  const result = validateAudience({ stage: "hot" }, true);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { stage: "hot" }, "no defaults are injected into a patch");
});

test("an empty patch is refused rather than being a silent no-op", () => {
  const result = validateAudience({}, true);
  assert.equal(result.ok, false);
  assert.equal(result.errors._, "Send at least one field to update.");
});

test("a patch can clear a nullable field", () => {
  assert.equal(validateAudience({ strategyId: "" }, true).data.strategyId, null);
});

test("non-objects are refused", () => {
  for (const input of [null, undefined, 42, "audience", []]) {
    assert.equal(validateAudience(input).ok, false);
  }
});

/* -------------------------------------------------------------- strategy -- */

test("a strategy needs a name and at least one channel", () => {
  assert.equal(validateStrategy({ channels: ["email"] }).errors.name, "Name the strategy.");
  assert.equal(validateStrategy({ name: "Q4 push", channels: [] }).errors.channels, "Pick at least one channel.");
});

test("a strategy with a workflow may stay on one channel", () => {
  assert.equal(validateStrategy({ name: "Flow", type: "multichannel", channels: ["email"] }).ok, true);
  assert.equal(validateStrategy({ name: "Flow", type: "multichannel", channels: ["email", "linkedin"] }).ok, true);
});

test("channels are de-duplicated and unknown ones rejected", () => {
  assert.deepEqual(validateStrategy({ name: "A", channels: ["email", "email"] }).data.channels, ["email"]);
  assert.equal(validateStrategy({ name: "A", channels: ["mail"] }).ok, false, "legacy short codes are not stored values");
  assert.equal(validateStrategy({ name: "A", channels: ["pigeon"] }).ok, false);
});

test("strategy status accepts 'completed' after the vocabulary widening", () => {
  assert.equal(validateStrategy({ name: "A", channels: ["email"], status: "completed" }).ok, true);
  assert.equal(validateStrategy({ name: "A", channels: ["email"], status: "finished" }).ok, false);
});

test("startedAt is normalised to ISO, and nonsense refused", () => {
  const result = validateStrategy({ name: "A", channels: ["email"], startedAt: "2026-03-01" });
  assert.equal(result.data.startedAt, new Date("2026-03-01").toISOString());
  assert.equal(validateStrategy({ name: "A", channels: ["email"], startedAt: "soon" }).ok, false);
});

test("a status-only patch is valid — it is the pause toggle", () => {
  const result = validateStrategy({ status: "paused" }, true);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { status: "paused" });
});

/* --------------------------------------------------------------- helpers -- */

test("message bodies are trimmed and must be non-empty", () => {
  assert.equal(validateMessageBody({ body: "  hello  " }).data.body, "hello");
  assert.equal(validateMessageBody({ body: "   " }).ok, false);
  assert.equal(validateMessageBody({ body: "x".repeat(5001) }).ok, false);
});

test("phone numbers keep a leading + and drop formatting", () => {
  assert.equal(normalisePhone("+91 98765 43210"), "+919876543210");
  assert.equal(normalisePhone("(555) 010-9999"), "5550109999");
  assert.equal(normalisePhone("12345"), null, "too short to be a real number");
  assert.equal(normalisePhone(""), null);
});

test("email check is permissive but catches the obvious cases", () => {
  assert.equal(looksLikeEmail("a@b.co"), true);
  assert.equal(looksLikeEmail("first.last+tag@sub.example.com"), true);
  assert.equal(looksLikeEmail("no-at-sign.com"), false);
  assert.equal(looksLikeEmail("spaces @example.com"), false);
  assert.equal(looksLikeEmail("no-tld@example"), false);
});

/* ------------------------------------------------- workspace settings -- */

import {
  validateCompliancePatch,
  validateSendingRulesPatch,
  validateVariableFallbacks,
} from "../lib/data/validate.ts";

test("a variable fallback must be a real token", () => {
  assert.equal(validateVariableFallbacks({ "{first_name}": "there" }).ok, true);
  assert.equal(validateVariableFallbacks({ first_name: "there" }).ok, false, "missing braces");
  assert.equal(validateVariableFallbacks({ "{first_name}": "x".repeat(61) }).ok, false, "too long");
  assert.deepEqual(validateVariableFallbacks({ "{city}": null }).data, { "{city}": null });
});

test("sending-window settings are validated", () => {
  const result = validateSendingRulesPatch({ days: ["Mon", "Wed"], from: "09:00", to: "18:00" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { days: ["Mon", "Wed"], from: "09:00", to: "18:00" });

  assert.equal(validateSendingRulesPatch({ days: ["Someday"] }).ok, false);
  assert.equal(validateSendingRulesPatch({ from: "9am" }).ok, false);
  assert.equal(validateSendingRulesPatch({ perDay: 0 }).ok, false, "below range");
  assert.equal(validateSendingRulesPatch({ perDay: 11 }).ok, false, "above range");
  assert.equal(validateSendingRulesPatch({ perDay: 5 }).ok, true);
  assert.equal(validateSendingRulesPatch({ stops: { reply: true } }).ok, true);
  assert.equal(validateSendingRulesPatch({ stops: { reply: "yes" } }).ok, false, "not a boolean");
});

test("missing settings are refused", () => {
  assert.equal(validateSendingRulesPatch({}).ok, false);
  assert.equal(validateCompliancePatch({}).ok, false);
});

test("compliance domains and retention are checked", () => {
  assert.equal(validateCompliancePatch({ domains: ["Acme.com"] }).data.domains[0], "acme.com");
  assert.equal(validateCompliancePatch({ domains: ["not a domain"] }).ok, false);
  assert.equal(validateCompliancePatch({ retention: "24 months" }).ok, true);
  assert.equal(validateCompliancePatch({ retention: "forever" }).ok, false);
  assert.equal(validateCompliancePatch({ consent: { mail: 1 } }).ok, true);
  assert.equal(validateCompliancePatch({ consent: { mail: 2.5 } }).ok, false, "not an integer");
});

test("an account's working day is checked, not trusted", async () => {
  const { validateAccountPatch } = await import("../lib/data/validate.ts");
  const good = validateAccountPatch("linkedin", {
    hours: { days: ["Mon", "Wed"], from: "09:30", to: "17:00", zone: "Asia/Kolkata" },
    warmup: false,
  });
  assert.equal(good.ok, true);
  assert.deepEqual(good.data.hours.days, ["Mon", "Wed"]);
  assert.equal(good.data.warmup, false);

  const nights = validateAccountPatch("linkedin", { hours: { days: ["Mon"], from: "18:00", to: "09:00", zone: "" } });
  assert.equal(nights.ok, false);
  assert.match(nights.errors.hours, /end after it starts/);

  for (const bad of [
    { days: [], from: "09:00", to: "17:00", zone: "" },
    { days: ["Funday"], from: "09:00", to: "17:00", zone: "" },
    { days: ["Mon", "Mon"], from: "09:00", to: "17:00", zone: "" },
    { days: ["Mon"], from: "9am", to: "17:00", zone: "" },
  ]) {
    assert.equal(validateAccountPatch("linkedin", { hours: bad }).ok, false, JSON.stringify(bad));
  }

  // Hours are a LinkedIn dial; a mailbox has none.
  assert.equal(validateAccountPatch("email", { hours: { days: ["Mon"], from: "09:00", to: "17:00", zone: "" } }).ok, false);
});
