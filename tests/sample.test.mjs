import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_CAMPAIGN, SAMPLE_LEADS } from "../lib/data/sample.ts";

/* ------------------------------------------------------------------ safety --
 * These guard against a real incident, not a cosmetic bug: a sample lead that could receive a
 * real email or call would be messaging an actual person on behalf of a made-up account. */

test("every sample email uses the reserved .example domain, which cannot be registered", () => {
  for (const lead of SAMPLE_LEADS) {
    assert.match(lead.email, /^[^@\s]+@[^@\s]+\.example$/, `${lead.name}: ${lead.email}`);
  }
});

test("every sample phone number is in the fictional 555-01xx range", () => {
  for (const lead of SAMPLE_LEADS) {
    if (lead.phone === null) continue;
    assert.match(lead.phone, /^\+1\d{3}5550\d{3}$/, `${lead.name}: ${lead.phone}`);
    // 555-0100 to 555-0199 are the numbers reserved for fiction.
    const lineNumber = Number(lead.phone.slice(-4));
    assert.ok(lineNumber >= 100 && lineNumber <= 199, `${lead.name} is outside 555-0100..0199`);
  }
});

test("emails and phone numbers are unique, so merging cannot collapse two sample leads", () => {
  const emails = SAMPLE_LEADS.map((l) => l.email);
  assert.equal(new Set(emails).size, emails.length);
  const phones = SAMPLE_LEADS.map((l) => l.phone).filter(Boolean);
  assert.equal(new Set(phones).size, phones.length);
});

/* ---------------------------------------------------------------- honesty -- */

test("the sample campaign is not 'live' — nothing sends, so that would be a false claim", () => {
  assert.notEqual(SAMPLE_CAMPAIGN.status, "live");
  assert.equal(SAMPLE_CAMPAIGN.status, "paused");
});

test("the sample campaign is named as a sample", () => {
  assert.match(SAMPLE_CAMPAIGN.name, /^Sample/);
});

test("it is multichannel, so it has a workflow to look at", () => {
  assert.equal(SAMPLE_CAMPAIGN.type, "multichannel");
  assert.ok(SAMPLE_CAMPAIGN.channels.length >= 2);
});

/* --------------------------------------------------------- shape and range -- */

test("scores stay within 0-100 and stages are ones the database accepts", () => {
  const allowed = new Set(["new", "reaching", "engaged", "hot", "meeting", "nurture"]);
  for (const lead of SAMPLE_LEADS) {
    assert.ok(lead.score >= 0 && lead.score <= 100, `${lead.name} score ${lead.score}`);
    assert.ok(allowed.has(lead.stage), `${lead.name} stage ${lead.stage}`);
  }
});

test("consent is mixed, so the Consent column demonstrates both states", () => {
  assert.ok(SAMPLE_LEADS.some((l) => l.consent), "at least one consenting lead");
  assert.ok(SAMPLE_LEADS.some((l) => !l.consent), "at least one lead without consent");
});

test("a lead with no consent is not queued for outreach", () => {
  for (const lead of SAMPLE_LEADS.filter((l) => !l.consent)) {
    assert.equal(lead.messageCount, 0, `${lead.name} has no consent but a message count`);
    assert.match(lead.nextStep, /consent/i);
  }
});

test("the funnel figures are internally consistent", () => {
  assert.ok(SAMPLE_CAMPAIGN.delivered <= SAMPLE_CAMPAIGN.sent);
  assert.ok(SAMPLE_CAMPAIGN.clicks <= SAMPLE_CAMPAIGN.delivered);
  for (const rate of [SAMPLE_CAMPAIGN.openRate, SAMPLE_CAMPAIGN.replyRate]) {
    assert.ok(rate > 0 && rate < 100);
  }
});

test("there are enough leads to show the table, few enough to read at a glance", () => {
  assert.ok(SAMPLE_LEADS.length >= 5 && SAMPLE_LEADS.length <= 12);
});
