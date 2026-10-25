import test from "node:test";
import assert from "node:assert/strict";
import { blockingCount, missingRecords, setupChecks, tabIssues } from "../lib/data/setup.ts";

const li = (over = {}) => ({
  id: "a1", channel: "linkedin", name: "Maya Reyes", handle: "linkedin.com/in/maya", state: "healthy",
  settings: { connections: 20, messages: 50, visits: 60, inmail: null }, campaignIds: [], isSample: false, ...over,
});
const mb = (over = {}) => ({
  id: "m1", channel: "email", name: "Sales", handle: "sales@acme.example", state: "warm",
  settings: { provider: "Google", health: 90, cap: 40, rotate: true }, campaignIds: [], isSample: false, ...over,
});
const dom = (over = {}) => ({ id: "d1", host: "acme.example", spf: true, dkim: true, dmarc: true, isSample: false, ...over });
const byId = (checks, id) => checks.find((c) => c.id === id);

test("an empty workspace is told what is true: nothing is connected — and nothing invented", () => {
  const checks = setupChecks({ accounts: [], domains: [] });
  assert.equal(byId(checks, "li-accounts").tone, "bad");
  // Connecting a mailbox is not built, so it is information rather than a blocker the user
  // cannot clear. Only LinkedIn blocks.
  assert.equal(byId(checks, "mail-accounts").tone, "info");
  assert.equal(byId(checks, "mail-dns"), undefined, "no domain, so nothing to authenticate");
  assert.equal(blockingCount(checks), 1);
  for (const check of checks) assert.doesNotMatch(check.detail, /Neha|getacme|acmehq/);
});

test("a healthy account and a verified domain pass", () => {
  const checks = setupChecks({ accounts: [li(), mb()], domains: [dom()] });
  assert.equal(blockingCount(checks), 0);
  assert.equal(byId(checks, "li-accounts").tone, "ok");
  assert.equal(byId(checks, "mail-dns").tone, "ok");
});

test("a signed-out LinkedIn account blocks, and names the account", () => {
  const check = byId(setupChecks({ accounts: [li({ state: "signed_out" })], domains: [] }), "li-accounts");
  assert.equal(check.tone, "bad");
  assert.match(check.detail, /Maya Reyes \(needs to log in again\)/);
});

test("an unauthenticated domain blocks and says which records are missing", () => {
  const check = byId(setupChecks({ accounts: [mb()], domains: [dom({ dkim: false, dmarc: false })] }), "mail-dns");
  assert.equal(check.tone, "bad");
  assert.match(check.detail, /acme\.example \(missing DKIM, DMARC\)/);
  assert.deepEqual(missingRecords({ spf: false, dkim: true, dmarc: true }), ["SPF"]);
});

test("a warming mailbox is information, not a blocker", () => {
  const checks = setupChecks({ accounts: [li(), mb({ state: "warming", settings: { provider: "G", warmDay: 9, health: 70, cap: 20, rotate: false } })], domains: [] });
  const warm = checks.find((c) => c.id.startsWith("warmup"));
  assert.equal(warm.tone, "info");
  assert.match(warm.detail, /day 9 of 14/);
  assert.equal(blockingCount(checks), 0);
});

test("planned channels are mentioned once, as information", () => {
  const planned = setupChecks({ accounts: [], domains: [] }).filter((c) => c.id === "planned");
  assert.equal(planned.length, 1);
  assert.equal(planned[0].tone, "info");
});

test("tab badges count only blocking checks, on the tab they point to", () => {
  const checks = setupChecks({ accounts: [], domains: [] });
  assert.deepEqual(tabIssues(checks), { li: 1 });
});
