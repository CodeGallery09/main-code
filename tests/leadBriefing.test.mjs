import test from "node:test";
import assert from "node:assert/strict";
import { buildBriefing, readSeat } from "../lib/audiences/summary.ts";
import { linkedInIdentifier, readProfile, readChats, readMessages, inviteBody } from "../lib/channels/unipileRequests.ts";

const profile = {
  name: "Priya Nair",
  headline: "VP Sales at Kitebox | Outbound, RevOps",
  summary: "I run the revenue team at Kitebox.",
  location: "Bengaluru",
  company: "Kitebox",
  title: "VP Sales",
  degree: 2,
  followers: 5400,
  isPremium: true,
  isOpenToWork: false,
  isHiring: true,
  experience: [
    { title: "VP Sales", company: "Kitebox", period: "2021 - Present", description: "" },
    { title: "Sales Manager", company: "Lumen Retail", period: "2017 - 2021", description: "" },
  ],
  education: [{ school: "IIM Bangalore", degree: "MBA", field: "Marketing", period: "2013 - 2015" }],
  skills: ["Outbound", "RevOps", "Forecasting"],
};

test("reads the seat from title and headline", () => {
  assert.deepEqual(readSeat("VP Sales", ""), { seniority: "leader", fn: "sales" });
  assert.deepEqual(readSeat("Co-Founder", "building things"), { seniority: "founder", fn: "general" });
  assert.equal(readSeat("", "Staff Software Engineer").fn, "engineering");
});

test("the briefing is built only from what the profile carries", () => {
  const brief = buildBriefing(profile);
  assert.match(brief.background, /VP Sales at Kitebox/);
  assert.match(brief.background, /Previously at Lumen Retail/);
  assert.match(brief.background, /IIM Bangalore/);
  assert.ok(brief.signals.includes("Hiring right now"));
  assert.ok(brief.signals.some((s) => /2nd degree/.test(s)));
  assert.ok(brief.interests.includes("Outbound"));
  assert.match(brief.pitch.seat, /Functional leader · sales/);
  assert.equal(brief.employment.length, 2);
  assert.ok(brief.openers.length > 0);
});

test("an empty profile invents nothing", () => {
  const blank = buildBriefing({
    name: "", headline: "", summary: "", location: "", company: "", title: "",
    degree: 0, followers: null, isPremium: false, isOpenToWork: false, isHiring: false,
    experience: [], education: [], skills: [],
  });
  assert.equal(blank.background, "");
  assert.deepEqual(blank.signals, []);
  assert.deepEqual(blank.openers, []);
  assert.deepEqual(blank.employment, []);
});

test("a LinkedIn URL, a slug and a provider id all reduce to an identifier", () => {
  assert.equal(linkedInIdentifier("https://www.linkedin.com/in/priya-nair-123/"), "priya-nair-123");
  assert.equal(linkedInIdentifier("linkedin.com/in/priya-nair-123?utm=x"), "priya-nair-123");
  assert.equal(linkedInIdentifier("priya-nair-123"), "priya-nair-123");
  assert.equal(linkedInIdentifier("ACoAAAxyz_01"), "ACoAAAxyz_01");
  assert.equal(linkedInIdentifier(""), "");
});

test("an invitation note is cut to LinkedIn's limit", () => {
  const body = inviteBody({ accountId: "a", providerId: "ACo1", message: "x".repeat(400) });
  assert.equal(body.message.length, 300);
  assert.equal(body.provider_id, "ACo1");
  assert.ok(!("message" in inviteBody({ accountId: "a", providerId: "ACo1", message: "  " })));
});

test("a profile with no provider id cannot be acted on, so it reads as nothing", () => {
  assert.equal(readProfile({ first_name: "Priya" }), null);
  const read = readProfile({
    provider_id: "ACo1",
    first_name: "Priya",
    last_name: "Nair",
    public_identifier: "priya-nair",
    headline: "VP Sales",
    work_experience: [{ position: "VP Sales", company: "Kitebox", start: "2021", end: "Present" }],
    skills: [{ name: "Outbound" }],
    network_distance: "DISTANCE_2",
  });
  assert.equal(read.name, "Priya Nair");
  assert.equal(read.company, "Kitebox");
  assert.equal(read.degree, 2);
  assert.deepEqual(read.skills, ["Outbound"]);
  assert.equal(read.profileUrl, "https://www.linkedin.com/in/priya-nair");
});

test("chats and messages are read from either spelling, and ours is never a reply", () => {
  assert.deepEqual(readChats({ items: [{ id: "c1", attendee_provider_id: "ACo1", unread_count: 2, timestamp: "2026-01-01T00:00:00Z" }] }), [
    { id: "c1", attendeeId: "ACo1", name: "", unread: 2, lastAt: "2026-01-01T00:00:00Z" },
  ]);
  const [mine, theirs] = readMessages(
    { items: [{ id: "m1", is_sender: 1, text: "hi" }, { id: "m2", text: "hello", sender_id: "ACo1" }] },
    "c1",
  );
  assert.equal(mine.fromMe, true);
  assert.equal(theirs.fromMe, false);
  assert.equal(theirs.chatId, "c1");
});
