import test from "node:test";
import assert from "node:assert/strict";
import {
  hasRun,
  relativeTime,
  toAppStrategy,
  toAppAudience,
  toChannel,
  toChannelKey,
  toStage,
  toStageLabel,
} from "../lib/app/adapt.ts";

/* -------------------------------------------------------------- round trips --
 * The mapping is the one place a silent data bug could hide: a wrong channel or stage would
 * render plausibly and be wrong. These assert every value round-trips, not just a sample. */

test("every channel round-trips", () => {
  for (const channel of ["linkedin", "email", "whatsapp", "call", "sms"]) {
    assert.equal(toChannel(toChannelKey(channel)), channel, `${channel} should survive`);
  }
  assert.equal(toChannelKey("linkedin"), "li");
  assert.equal(toChannelKey("email"), "mail");
  assert.equal(toChannelKey("whatsapp"), "wa");
});

test("every audience stage round-trips, including the widened values", () => {
  for (const stage of [
    "new",
    "reaching",
    "engaged",
    "hot",
    "meeting",
    "nurture",
    "paused",
    "stopped",
    "closed",
  ]) {
    assert.equal(toStage(toStageLabel(stage)), stage, `${stage} should survive`);
  }
  assert.equal(toStageLabel("closed"), "Closed");
  assert.equal(toStageLabel("stopped"), "Stopped", "a won deal and an opt-out stay distinct");
});

/* --------------------------------------------------------------------- audience -- */

const LEAD = {
  id: "l_omar",
  name: "Omar Haddad",
  company: "Brightline Logistics",
  title: "VP Sales",
  initials: "OH",
  phone: "+971500000001",
  email: "omar@brightline.example",
  stage: "hot",
  score: 80,
  source: "linkedin",
  tags: ["pricing", "8 seats"],
  consent: true,
  avgCallSeconds: 212,
  messageCount: 6,
  callCount: 1,
  nextStep: "Send pricing for 8 seats",
  ownerId: "u_1",
  ownerName: "Aarav Kapoor",
  strategyId: "c_net_new",
  starred: true,
  updatedAt: new Date().toISOString(),
};

test("an audience maps onto the table's shape", () => {
  const row = toAppAudience(LEAD);
  assert.equal(row.id, "l_omar", "the string id is kept, so the row can address the API");
  assert.equal(row.n, "Omar Haddad");
  assert.equal(row.c, "Brightline Logistics");
  assert.equal(row.t, "VP Sales");
  assert.equal(row.stage, "Hot");
  assert.equal(row.src, "LinkedIn");
  assert.equal(row.own, "AK", "owner initials match the OWNERS filter keys");
  assert.equal(row.fav, true);
  assert.equal(row.consent, true);
  assert.equal(row.avgCall, 212);
  assert.equal(row.msgs, 6);
  assert.equal(row.calls, 1);
  assert.equal(row.next, "Send pricing for 8 seats");
});

test("the title becomes a derived tag, after the stored ones", () => {
  const row = toAppAudience(LEAD);
  assert.deepEqual(row.tags, ["pricing", "8 seats", "Title: VP Sales"]);
});

test("an audience with no title gets no title tag", () => {
  const row = toAppAudience({ ...LEAD, title: "" });
  assert.deepEqual(row.tags, ["pricing", "8 seats"]);
});

test("the editor's fields survive the mapping, so an edit cannot silently drop them", () => {
  const row = toAppAudience(LEAD);
  assert.equal(row.strategyId, "c_net_new");
  assert.equal(row.ownerId, "u_1");
  assert.equal(row.source, "linkedin");
});

test("a missing next step renders as an em dash, not an empty cell", () => {
  assert.equal(toAppAudience({ ...LEAD, nextStep: "" }).next, "—");
});

test("nulls become the shapes the table expects", () => {
  const row = toAppAudience({ ...LEAD, phone: null, email: null, avgCallSeconds: null });
  assert.equal(row.ph, undefined, "the phone cell checks for undefined");
  assert.equal(row.email, "");
  assert.equal(row.avgCall, null);
});

test("an unassigned owner does not produce initials from nothing", () => {
  assert.equal(toAppAudience({ ...LEAD, ownerName: "Unassigned" }).own, "U");
});

/* ----------------------------------------------------------------- strategy -- */

const DAY = 86_400_000;

const CAMPAIGN = {
  id: "c_net_new",
  name: "Net-new outbound",
  status: "live",
  type: "multichannel",
  channels: ["linkedin", "email", "call"],
  version: "v2",
  startedAt: new Date(Date.now() - 30 * DAY).toISOString(),
  audiences: 612,
  sent: 4820,
  delivered: 4712,
  openRate: 41.2,
  replyRate: 6.8,
  clicks: 388,
};

test("a strategy maps onto the table's shape", () => {
  const row = toAppStrategy(CAMPAIGN);
  assert.equal(row.id, "c_net_new");
  assert.equal(row.type, "multi");
  assert.deepEqual(row.channels, ["li", "mail", "call"]);
  assert.equal(row.ver, 2, "'v2' becomes 2");
  assert.equal(row.audiences, 612);
  assert.equal(row.openRate, 41.2, "rates stay numbers, not strings");
});

test("a standalone strategy maps to the legacy 'single' type", () => {
  assert.equal(toAppStrategy({ ...CAMPAIGN, type: "standalone" }).type, "single");
});

test("a draft has no published version", () => {
  const row = toAppStrategy({ ...CAMPAIGN, status: "draft", version: null });
  assert.equal(row.ver, 0);
  assert.equal(hasRun(row), false, "so the figure columns read as not-yet-run");
});

test("a future start date is a schedule, a past one is a start", () => {
  const future = toAppStrategy({ ...CAMPAIGN, startedAt: new Date(Date.now() + 12 * DAY).toISOString() });
  assert.ok(future.scheduledAt, "a future date surfaces as scheduledAt");
  assert.equal(future.startedAt, undefined);
  assert.equal(hasRun(future), false, "a scheduled strategy has not run yet");

  const past = toAppStrategy(CAMPAIGN);
  assert.ok(past.startedAt);
  assert.equal(past.scheduledAt, undefined);
  assert.equal(hasRun(past), true);
});

/* ------------------------------------------------------------------ helpers -- */

test("relative time buckets into the table's compact units", () => {
  const ago = (ms) => relativeTime(new Date(Date.now() - ms).toISOString());
  assert.equal(ago(30_000), "now");
  assert.equal(ago(5 * 60_000), "5m");
  assert.equal(ago(3 * 3_600_000), "3h");
  assert.equal(ago(2 * DAY), "2d");
});

test("an unparseable date does not crash the row", () => {
  assert.equal(relativeTime("not a date"), "—");
});
