import test from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeEmail,
  normalisePhone,
  validateCampaign,
  validateLead,
  validateMessageBody,
  NAME_MAX,
  TAGS_MAX,
} from "../lib/data/validate.ts";

/* ------------------------------------------------------------------ lead -- */

test("a create needs a name", () => {
  const result = validateLead({});
  assert.equal(result.ok, false);
  assert.equal(result.errors.name, "Enter the lead's name.");
});

test("a create fills defaults for everything optional", () => {
  const result = validateLead({ name: "Omar Haddad" });
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
    campaignId: null,
  });
});

test("names are trimmed and length-capped", () => {
  assert.equal(validateLead({ name: "  Maya Reyes  " }).data.name, "Maya Reyes");
  const tooLong = validateLead({ name: "x".repeat(NAME_MAX + 1) });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.errors.name, /characters/);
});

test("email is lowercased, and a bad one is rejected", () => {
  assert.equal(validateLead({ name: "A", email: "  Omar@Example.COM " }).data.email, "omar@example.com");
  assert.equal(validateLead({ name: "A", email: "not-an-email" }).ok, false);
  // An explicitly empty string means "clear it", not "invalid".
  assert.equal(validateLead({ name: "A", email: "" }).data.email, null);
});

test("a LinkedIn URL is stored with a scheme, the way an upload stores one", () => {
  assert.equal(
    validateLead({ name: "A", linkedin: " linkedin.com/in/maya-reyes " }).data.linkedin,
    "https://linkedin.com/in/maya-reyes",
  );
  assert.equal(
    validateLead({ name: "A", linkedin: "https://www.linkedin.com/in/maya/" }).data.linkedin,
    "https://www.linkedin.com/in/maya/",
  );
  assert.equal(validateLead({ name: "A", linkedin: "maya reyes" }).ok, false);
  assert.equal(validateLead({ name: "A", linkedin: "maya" }).ok, false);
  assert.equal(validateLead({ name: "A", linkedin: "" }).data.linkedin, null);
  assert.equal(validateLead({ linkedin: "" }, true).data.linkedin, null, "a PATCH can clear it");
});

test("stage accepts the widened vocabulary and rejects anything else", () => {
  for (const stage of ["new", "reaching", "engaged", "hot", "meeting", "nurture", "paused", "stopped", "closed"]) {
    assert.equal(validateLead({ name: "A", stage }).ok, true, `${stage} should be valid`);
  }
  assert.equal(validateLead({ name: "A", stage: "Hot" }).ok, false, "display casing is not a stored value");
  assert.equal(validateLead({ name: "A", stage: "invented" }).ok, false);
});

test("score must sit between 0 and 100", () => {
  assert.equal(validateLead({ name: "A", score: 0 }).data.score, 0);
  assert.equal(validateLead({ name: "A", score: 100 }).data.score, 100);
  assert.equal(validateLead({ name: "A", score: 61.6 }).data.score, 62, "rounded, not truncated");
  assert.equal(validateLead({ name: "A", score: -1 }).ok, false);
  assert.equal(validateLead({ name: "A", score: 101 }).ok, false);
});

test("tags are de-duplicated, blanks dropped, and the count capped", () => {
  assert.deepEqual(validateLead({ name: "A", tags: ["pricing", "pricing", "  ", "8 seats"] }).data.tags, [
    "pricing",
    "8 seats",
  ]);
  const tooMany = validateLead({ name: "A", tags: Array.from({ length: TAGS_MAX + 1 }, (_, i) => `t${i}`) });
  assert.equal(tooMany.ok, false);
  assert.equal(validateLead({ name: "A", tags: "pricing" }).ok, false, "a string is not a list");
});

test("consent is never inferred — absent means false", () => {
  assert.equal(validateLead({ name: "A" }).data.consent, false);
  assert.equal(validateLead({ name: "A", consent: "yes" }).data.consent, false, "only a true boolean counts");
  assert.equal(validateLead({ name: "A", consent: true }).data.consent, true);
});

test("a patch validates only the fields sent", () => {
  const result = validateLead({ stage: "hot" }, true);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { stage: "hot" }, "no defaults are injected into a patch");
});

test("an empty patch is refused rather than being a silent no-op", () => {
  const result = validateLead({}, true);
  assert.equal(result.ok, false);
  assert.equal(result.errors._, "Send at least one field to update.");
});

test("a patch can clear a nullable field", () => {
  assert.equal(validateLead({ campaignId: "" }, true).data.campaignId, null);
});

test("non-objects are refused", () => {
  for (const input of [null, undefined, 42, "lead", []]) {
    assert.equal(validateLead(input).ok, false);
  }
});

/* -------------------------------------------------------------- campaign -- */

test("a campaign needs a name and at least one channel", () => {
  assert.equal(validateCampaign({ channels: ["email"] }).errors.name, "Name the campaign.");
  assert.equal(validateCampaign({ name: "Q4 push", channels: [] }).errors.channels, "Pick at least one channel.");
});

test("a multichannel campaign needs two or more channels", () => {
  const one = validateCampaign({ name: "Flow", type: "multichannel", channels: ["email"] });
  assert.equal(one.ok, false);
  assert.match(one.errors.channels, /two or more/);
  assert.equal(validateCampaign({ name: "Flow", type: "multichannel", channels: ["email", "linkedin"] }).ok, true);
});

test("channels are de-duplicated and unknown ones rejected", () => {
  assert.deepEqual(validateCampaign({ name: "A", channels: ["email", "email"] }).data.channels, ["email"]);
  assert.equal(validateCampaign({ name: "A", channels: ["mail"] }).ok, false, "legacy short codes are not stored values");
  assert.equal(validateCampaign({ name: "A", channels: ["pigeon"] }).ok, false);
});

test("campaign status accepts 'completed' after the vocabulary widening", () => {
  assert.equal(validateCampaign({ name: "A", channels: ["email"], status: "completed" }).ok, true);
  assert.equal(validateCampaign({ name: "A", channels: ["email"], status: "finished" }).ok, false);
});

test("startedAt is normalised to ISO, and nonsense refused", () => {
  const result = validateCampaign({ name: "A", channels: ["email"], startedAt: "2026-03-01" });
  assert.equal(result.data.startedAt, new Date("2026-03-01").toISOString());
  assert.equal(validateCampaign({ name: "A", channels: ["email"], startedAt: "soon" }).ok, false);
});

test("a status-only patch is valid — it is the pause toggle", () => {
  const result = validateCampaign({ status: "paused" }, true);
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
