import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_CAMPAIGN, SAMPLE_LEADS } from "../lib/data/sample.ts";

/* ------------------------------------------------------------------ safety --
 * These guard against a real incident, not a cosmetic bug: a sample audience that could receive a
 * real email or call would be messaging an actual person on behalf of a made-up account. */

test("every sample email uses the reserved .example domain, which cannot be registered", () => {
  for (const audience of SAMPLE_LEADS) {
    assert.match(audience.email, /^[^@\s]+@[^@\s]+\.example$/, `${audience.name}: ${audience.email}`);
  }
});

test("every sample phone number is in the fictional 555-01xx range", () => {
  for (const audience of SAMPLE_LEADS) {
    if (audience.phone === null) continue;
    assert.match(audience.phone, /^\+1\d{3}5550\d{3}$/, `${audience.name}: ${audience.phone}`);
    // 555-0100 to 555-0199 are the numbers reserved for fiction.
    const lineNumber = Number(audience.phone.slice(-4));
    assert.ok(lineNumber >= 100 && lineNumber <= 199, `${audience.name} is outside 555-0100..0199`);
  }
});

test("emails and phone numbers are unique, so merging cannot collapse two sample audiences", () => {
  const emails = SAMPLE_LEADS.map((l) => l.email);
  assert.equal(new Set(emails).size, emails.length);
  const phones = SAMPLE_LEADS.map((l) => l.phone).filter(Boolean);
  assert.equal(new Set(phones).size, phones.length);
});

/* ---------------------------------------------------------------- honesty -- */

test("the sample strategy is not 'live' — nothing sends, so that would be a false claim", () => {
  assert.notEqual(SAMPLE_CAMPAIGN.status, "live");
  assert.equal(SAMPLE_CAMPAIGN.status, "paused");
});

test("the sample strategy is named as a sample", () => {
  assert.match(SAMPLE_CAMPAIGN.name, /^Sample/);
});

test("it is multichannel, so it has a workflow to look at", () => {
  assert.equal(SAMPLE_CAMPAIGN.type, "multichannel");
  assert.ok(SAMPLE_CAMPAIGN.channels.length >= 2);
});

/* --------------------------------------------------------- shape and range -- */

test("scores stay within 0-100 and stages are ones the database accepts", () => {
  const allowed = new Set(["new", "reaching", "engaged", "hot", "meeting", "nurture"]);
  for (const audience of SAMPLE_LEADS) {
    assert.ok(audience.score >= 0 && audience.score <= 100, `${audience.name} score ${audience.score}`);
    assert.ok(allowed.has(audience.stage), `${audience.name} stage ${audience.stage}`);
  }
});

test("consent is mixed, so the Consent column demonstrates both states", () => {
  assert.ok(SAMPLE_LEADS.some((l) => l.consent), "at least one consenting audience");
  assert.ok(SAMPLE_LEADS.some((l) => !l.consent), "at least one audience without consent");
});

test("an audience with no consent is not queued for outreach", () => {
  for (const audience of SAMPLE_LEADS.filter((l) => !l.consent)) {
    assert.equal(audience.messageCount, 0, `${audience.name} has no consent but a message count`);
    assert.match(audience.nextStep, /consent/i);
  }
});

test("the funnel figures are internally consistent", () => {
  assert.ok(SAMPLE_CAMPAIGN.delivered <= SAMPLE_CAMPAIGN.sent);
  assert.ok(SAMPLE_CAMPAIGN.clicks <= SAMPLE_CAMPAIGN.delivered);
  for (const rate of [SAMPLE_CAMPAIGN.openRate, SAMPLE_CAMPAIGN.replyRate]) {
    assert.ok(rate > 0 && rate < 100);
  }
});

test("there are enough audiences to show the table, few enough to read at a glance", () => {
  assert.ok(SAMPLE_LEADS.length >= 5 && SAMPLE_LEADS.length <= 12);
});

/* ------------------------------------------- the rest of the sample world -- */

import { SAMPLE_ROLLUPS, SAMPLE_TASKS, SAMPLE_THREADS } from "../lib/data/sample.ts";

const sum = (key) => SAMPLE_ROLLUPS.reduce((total, row) => total + row[key], 0);

test("the strategy's figures are derived from the rollups, so every screen agrees", () => {
  assert.equal(SAMPLE_CAMPAIGN.delivered, sum("reached"));
  assert.equal(SAMPLE_CAMPAIGN.openRate, Number(((sum("engaged") / sum("reached")) * 100).toFixed(1)));
  assert.equal(SAMPLE_CAMPAIGN.replyRate, Number(((sum("replied") / sum("reached")) * 100).toFixed(1)));
});

test("the funnel only narrows: reached >= engaged >= replied >= positive >= meetings", () => {
  assert.ok(sum("reached") >= sum("engaged"));
  assert.ok(sum("engaged") >= sum("replied"));
  assert.ok(sum("replied") >= sum("positive"));
  assert.ok(sum("positive") >= sum("meetings"));
  for (const row of SAMPLE_ROLLUPS) {
    assert.ok(row.reached >= row.engaged && row.engaged >= row.replied, `day ${row.daysAgo}`);
  }
});

test("rollups fall inside the strategy's life, on the channels it uses, one row per day and channel", () => {
  const seen = new Set();
  for (const row of SAMPLE_ROLLUPS) {
    assert.ok(row.daysAgo >= 0 && row.daysAgo <= SAMPLE_CAMPAIGN.startedDaysAgo, `daysAgo ${row.daysAgo}`);
    assert.ok(SAMPLE_CAMPAIGN.channels.includes(row.channel));
    const key = `${row.daysAgo}:${row.channel}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
  }
});

test("every thread and task is about a sample audience, and none about the audience without consent", () => {
  const byEmail = new Map(SAMPLE_LEADS.map((l) => [l.email, l]));
  for (const thread of SAMPLE_THREADS) {
    const audience = byEmail.get(thread.audienceEmail);
    assert.ok(audience, thread.audienceEmail);
    assert.ok(audience.consent, `${audience.name} has a thread but no consent`);
    assert.ok(thread.messages.length >= 2);
  }
  for (const task of SAMPLE_TASKS) assert.ok(byEmail.has(task.audienceEmail), task.audienceEmail);
});

test("a thread needing a reply ends with a message from the audience", () => {
  for (const thread of SAMPLE_THREADS.filter((t) => t.needsReply)) {
    const latest = [...thread.messages].sort((a, b) => a.hoursAgo - b.hoursAgo)[0];
    assert.equal(latest.from, "them", thread.audienceEmail);
  }
});

test("sample messages never speak as a named real person", () => {
  for (const thread of SAMPLE_THREADS) {
    for (const message of thread.messages.filter((m) => m.from === "us")) {
      assert.doesNotMatch(message.body, /\[|\{|Aarav/);
    }
  }
});
