import test from "node:test";
import assert from "node:assert/strict";
import { findInJourney, journeyReport } from "../lib/leads/merge.ts";

const none = { email: null, mobile: null, whatsapp: null, linkedin: null };
const known = (id, campaignId, fields) => ({ id, campaignId, ...none, ...fields });
const row = (n, fields) => ({ row: n, ...none, ...fields });

test("a row matching a lead who is in a campaign is in a journey", () => {
  const found = findInJourney(
    [known("l1", "c1", { email: "maya@acme.example" })],
    [row(1, { email: "maya@acme.example" })],
  );
  assert.deepEqual(found, [{ row: 1, leadId: "l1", campaignId: "c1", matchedOn: "email" }]);
});

test("a lead with no campaign is not in a journey, so the row is kept", () => {
  assert.deepEqual(
    findInJourney([known("l1", null, { email: "maya@acme.example" })], [row(1, { email: "maya@acme.example" })]),
    [],
  );
});

test("emails match case-insensitively and phone numbers on their digits", () => {
  const leads = [known("l1", "c1", { email: "Maya@Acme.Example", mobile: "+91 98765 43210" })];
  assert.equal(findInJourney(leads, [row(1, { email: "maya@acme.example" })]).length, 1);
  assert.equal(findInJourney(leads, [row(2, { mobile: "+919876543210" })]).length, 1);
});

test("LinkedIn URLs match on their normalised path", () => {
  const leads = [known("l1", "c1", { linkedin: "https://www.linkedin.com/in/maya-reyes/" })];
  assert.equal(findInJourney(leads, [row(1, { linkedin: "linkedin.com/in/maya-reyes" })]).length, 1);
});

test("ANY matching field counts, even when the first match is a lead outside a journey", () => {
  // Email belongs to a free lead, phone to a lead in a campaign. Contacting this person would
  // still start a second journey for someone we are already talking to.
  const leads = [
    known("free", null, { email: "maya@acme.example" }),
    known("busy", "c9", { mobile: "+14155550100" }),
  ];
  const found = findInJourney(leads, [row(1, { email: "maya@acme.example", mobile: "+14155550100" })]);
  assert.equal(found.length, 1);
  assert.equal(found[0].leadId, "busy");
  assert.equal(found[0].matchedOn, "mobile");
});

test("rows with nothing to match on are never reported", () => {
  assert.deepEqual(findInJourney([known("l1", "c1", { email: "a@b.example" })], [row(1, {})]), []);
});

test("one entry per row, however many fields match", () => {
  const leads = [known("l1", "c1", { email: "a@b.example", mobile: "+14155550100" })];
  assert.equal(findInJourney(leads, [row(1, { email: "a@b.example", mobile: "+14155550100" })]).length, 1);
});

test("the report counts excluded rows per campaign, biggest first", () => {
  const report = journeyReport([
    { row: 1, leadId: "a", campaignId: "c1", matchedOn: "email" },
    { row: 2, leadId: "b", campaignId: "c2", matchedOn: "email" },
    { row: 5, leadId: "c", campaignId: "c2", matchedOn: "mobile" },
  ]);
  assert.equal(report.excluded, 3);
  assert.deepEqual(report.rows, [1, 2, 5]);
  assert.deepEqual(report.byCampaign, [
    { campaignId: "c2", count: 2 },
    { campaignId: "c1", count: 1 },
  ]);
});

test("an empty report is all zeros", () => {
  assert.deepEqual(journeyReport([]), { excluded: 0, rows: [], byCampaign: [] });
});
