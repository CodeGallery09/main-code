// Run with `npm test` (Node's built-in runner; Node >= 22.18 strips the TS types natively).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDemoRequest, validateFounderCall, normaliseWebsite, NOTES_MAX } from "../lib/demoRequest.ts";

const valid = {
  fullName: "  Ada Lovelace ",
  workEmail: "ada@acme.com",
  company: "Acme",
  website: "",
  role: "Founder/CEO",
  teamSize: "2–5",
  challenge: "Coordinating outreach channels",
  notes: "",
};

test("accepts a complete request and trims values", () => {
  const r = validateDemoRequest(valid);
  assert.equal(r.ok, true);
  assert.equal(r.data.fullName, "Ada Lovelace");
  assert.equal(r.data.website, "");
});

test("flags every missing required field", () => {
  const r = validateDemoRequest({});
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ["challenge", "company", "fullName", "role", "teamSize", "workEmail"]);
});

test("rejects non-object payloads", () => {
  for (const input of [null, "x", 42, []]) assert.equal(validateDemoRequest(input).ok, false);
});

test("validates email format", () => {
  for (const workEmail of ["ada", "ada@", "ada@acme", "a da@acme.com", "ada@acme.c"]) {
    const r = validateDemoRequest({ ...valid, workEmail });
    assert.equal(r.ok, false, workEmail);
    assert.ok(r.errors.workEmail);
  }
  assert.equal(validateDemoRequest({ ...valid, workEmail: "ada.l+demo@sub.acme.co.uk" }).ok, true);
});

test("website is optional but must be a valid URL when given", () => {
  assert.equal(validateDemoRequest({ ...valid, website: "acme.com" }).data.website, "https://acme.com/");
  assert.equal(validateDemoRequest({ ...valid, website: "http://acme.io/team" }).data.website, "http://acme.io/team");
  for (const website of ["not a url", "acme", "ftp://acme.com", "https://"]) {
    const r = validateDemoRequest({ ...valid, website });
    assert.equal(r.ok, false, website);
    assert.ok(r.errors.website);
  }
  assert.equal(normaliseWebsite("javascript:alert(1)"), null);
});

test("selects only accept listed options", () => {
  const r = validateDemoRequest({ ...valid, role: "CTO", teamSize: "100", challenge: "Everything" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.role && r.errors.teamSize && r.errors.challenge);
});

test("enforces length limits", () => {
  const r = validateDemoRequest({ ...valid, notes: "x".repeat(NOTES_MAX + 1), company: "x".repeat(121) });
  assert.equal(r.ok, false);
  assert.ok(r.errors.notes && r.errors.company);
});

const call = {
  fullName: "Maya Reyes",
  workEmail: "maya@acme.com",
  pains: "Reps lose track of LinkedIn vs email replies.",
  notes: "",
  guestEmail: "",
  date: "2030-03-14",
  time: "09:30",
  timeZone: "Europe/London",
};

test("founder call: accepts a complete request", () => {
  const r = validateFounderCall(call);
  assert.equal(r.ok, true);
  assert.equal(r.data.time, "09:30");
});

test("founder call: flags missing fields", () => {
  const r = validateFounderCall({});
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ["date", "fullName", "pains", "time", "workEmail"]);
});

test("founder call: rejects digits in names, bad guest emails and impossible dates", () => {
  assert.ok(validateFounderCall({ ...call, fullName: "Maya 2" }).errors.fullName);
  assert.ok(validateFounderCall({ ...call, guestEmail: "nope" }).errors.guestEmail);
  assert.ok(validateFounderCall({ ...call, date: "2030-02-31" }).errors.date);
  assert.ok(validateFounderCall({ ...call, date: "14/03/2030" }).errors.date);
});

test("founder call: times must be 30-minute slots between 09:00 and 17:30", () => {
  for (const time of ["08:30", "18:00", "09:15", "9:30", "noon"]) assert.ok(validateFounderCall({ ...call, time }).errors.time, time);
  for (const time of ["09:00", "13:30", "17:30"]) assert.equal(validateFounderCall({ ...call, time }).ok, true, time);
});
