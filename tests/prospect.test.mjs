import test from "node:test";
import assert from "node:assert/strict";
import { buildProspect, emailDomain, eventLabel } from "../lib/audiences/prospect.ts";

const audience = {
  id: "l_1",
  name: "Ana Ruiz",
  company: "Kitebox",
  title: "CTO",
  initials: "AR",
  phone: null,
  email: "ana@kitebox.example",
  stage: "new",
  score: 0,
  source: "csv",
  tags: [],
  consent: true,
  avgCallSeconds: null,
  messageCount: 0,
  callCount: 0,
  nextStep: "",
  ownerId: "u_1",
  ownerName: "Sam",
  strategyId: null,
  starred: false,
  updatedAt: "2026-10-01T10:00:00.000Z",
};

const empty = {
  audience,
  createdAt: null,
  companyFields: [],
  otherFields: [],
  strategy: null,
  run: null,
  audiences: [],
  threads: [],
  messages: [],
  events: [],
  tasks: [],
  colleagues: [],
  colleagueCount: 0,
};

test("a prospect with nothing recorded gets empty history, not invented figures", () => {
  const p = buildProspect(empty);
  assert.deepEqual(p.timeline, []);
  assert.equal(p.engagement.sent, 0);
  assert.equal(p.engagement.received, 0);
  assert.equal(p.engagement.lastReplyAt, null);
  assert.equal(p.engagement.lastTouchAt, null);
  assert.deepEqual(p.engagement.events, []);
  assert.equal(p.journey.strategy, null);
  assert.equal(p.journey.run, null);
});

test("engagement counts stored messages and events by direction and channel", () => {
  const p = buildProspect({
    ...empty,
    threads: [{ id: "t1", channel: "email", intent: "question", needsReply: true, lastAt: "2026-10-03T09:00:00.000Z", signals: [{ label: "Pricing visit", points: 10 }] }],
    messages: [
      { id: "m1", threadId: "t1", from: "us", channel: "email", body: "Hi Ana", sentAt: "2026-10-02T09:00:00.000Z" },
      { id: "m2", threadId: "t1", from: "them", channel: "email", body: "Tell me more", sentAt: "2026-10-03T09:00:00.000Z" },
      { id: "m3", threadId: "t1", from: "us", channel: "linkedin", body: "Following up", sentAt: "2026-10-04T09:00:00.000Z" },
    ],
    events: [
      { id: "e1", kind: "opened", channel: "email", occurredAt: "2026-10-02T10:00:00.000Z" },
      { id: "e2", kind: "opened", channel: "email", occurredAt: "2026-10-02T11:00:00.000Z" },
      { id: "e3", kind: "clicked", channel: "email", occurredAt: "2026-10-05T11:00:00.000Z" },
    ],
  });
  assert.equal(p.engagement.sent, 2);
  assert.equal(p.engagement.received, 1);
  assert.equal(p.engagement.lastReplyAt, "2026-10-03T09:00:00.000Z");
  assert.equal(p.engagement.lastTouchAt, "2026-10-05T11:00:00.000Z");
  assert.deepEqual(p.engagement.byChannel, [
    { channel: "email", sent: 1, received: 1 },
    { channel: "linkedin", sent: 1, received: 0 },
  ]);
  assert.deepEqual(p.engagement.events, [
    { kind: "opened", count: 2 },
    { kind: "clicked", count: 1 },
  ]);
  assert.deepEqual(p.engagement.signals, [{ label: "Pricing visit", points: 10 }]);
});

test("the timeline is newest first and holds only stored facts", () => {
  const p = buildProspect({
    ...empty,
    createdAt: "2026-09-01T08:00:00.000Z",
    audiences: [{ id: "s1", name: "Q4 founders", fileName: "q4.csv", importedAt: "2026-09-20T08:00:00.000Z" }],
    messages: [{ id: "m1", threadId: "t1", from: "them", channel: "email", body: "Sounds good", sentAt: "2026-09-25T08:00:00.000Z" }],
    tasks: [
      { id: "k1", kind: "call", summary: "Call back", channel: "call", done: false, when: "Today", createdAt: "2026-09-26T08:00:00.000Z" },
      { id: "k2", kind: "reply", summary: "No date", channel: "email", done: false, when: "", createdAt: null },
    ],
  });
  assert.deepEqual(
    p.timeline.map((t) => t.kind),
    ["task", "message_in", "imported", "created"],
  );
  // A to-do without a stored time is still listed, just not placed on the timeline.
  assert.equal(p.tasks.length, 2);
});

test("a prospect created by the import that brought it in is not listed twice", () => {
  const p = buildProspect({
    ...empty,
    createdAt: "2026-09-20T08:00:00.000Z",
    audiences: [{ id: "s1", name: "Q4", fileName: "q4.csv", importedAt: "2026-09-20T08:00:01.000Z" }],
  });
  assert.deepEqual(p.timeline.map((t) => t.kind), ["imported"]);
});

test("emailDomain ignores personal mailboxes", () => {
  assert.equal(emailDomain("ana@Kitebox.example"), "kitebox.example");
  assert.equal(emailDomain("ana@gmail.com"), null);
  assert.equal(emailDomain("ana@outlook.co.uk"), null);
  assert.equal(emailDomain(null), null);
  assert.equal(emailDomain("not-an-email"), null);
});

test("eventLabel names known kinds and makes unknown ones readable", () => {
  assert.equal(eventLabel("meeting_booked"), "Meeting booked");
  assert.equal(eventLabel("link_shared"), "Link shared");
});
