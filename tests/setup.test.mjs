import test from "node:test";
import assert from "node:assert/strict";
import { blockingCount, missingRecords, setupChecks, tabIssues } from "../lib/data/setup.ts";

const li = (over = {}) => ({
  id: "a1", channel: "linkedin", name: "Maya Reyes", handle: "linkedin.com/in/maya", state: "healthy",
  settings: { connections: 20, messages: 50, visits: 60, inmail: null }, strategyIds: [], isSample: false, ...over,
});
const HOURS = { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], from: "09:00", to: "17:00", zone: "" };
const mb = (over = {}) => ({
  id: "m1", channel: "email", name: "Sales", handle: "sales@acme.example", state: "healthy",
  settings: { provider: "GOOGLE_OAUTH", cap: 40, hours: HOURS, warmup: true }, pace: null,
  strategyIds: [], isSample: false, ...over,
});
const dom = (over = {}) => ({ id: "d1", host: "acme.example", spf: true, dkim: true, dmarc: true, isSample: false, ...over });
const byId = (checks, id) => checks.find((c) => c.id === id);

test("an empty workspace is told what is true: nothing is connected — and nothing invented", () => {
  const checks = setupChecks({ accounts: [], domains: [] });
  assert.equal(byId(checks, "li-accounts").tone, "bad");
  // Email is optional — a LinkedIn-only workspace is complete — so no mailbox is information with
  // a way to act on it, not a blocker. Only LinkedIn blocks.
  assert.equal(byId(checks, "mail-accounts").tone, "info");
  assert.equal(byId(checks, "mail-accounts").action, "Connect");
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

test("a warming mailbox is information, not a blocker, and reads its real pace", () => {
  const pace = { sentToday: 3, cap: 12, warming: true, ageDays: 8, open: true, nextOpenAt: null };
  const checks = setupChecks({ accounts: [li(), mb({ pace })], domains: [] });
  const warm = checks.find((c) => c.id.startsWith("warmup"));
  assert.equal(warm.tone, "info");
  assert.match(warm.detail, /day 9 of 14 — 12 emails today, climbing to 40/);
  assert.equal(blockingCount(checks), 0);
});

test("a mailbox that needs signing in again blocks, and names the address", () => {
  const check = byId(setupChecks({ accounts: [li(), mb({ state: "signed_out" })], domains: [] }), "mail-accounts");
  assert.equal(check.tone, "bad");
  assert.match(check.detail, /sales@acme\.example \(needs to sign in again\)/);
  assert.equal(check.goes, "mail");
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

test("a deployment with no scheduler says so, but is never a blocker", () => {
  const off = byId(setupChecks({ accounts: [], domains: [], scheduler: false }), "scheduler");
  assert.equal(off.tone, "info");
  assert.match(off.detail, /only advance while/);

  const on = byId(setupChecks({ accounts: [], domains: [], scheduler: true }), "scheduler");
  assert.equal(on.tone, "ok");

  // Info never counts against the score, so it cannot leave a workspace permanently short.
  assert.equal(
    blockingCount(setupChecks({ accounts: [], domains: [], scheduler: false })),
    blockingCount(setupChecks({ accounts: [], domains: [], scheduler: true })),
  );
});
