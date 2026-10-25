import test from "node:test";
import assert from "node:assert/strict";
import { mergeAudiences, planImport } from "../lib/audiences/merge.ts";
import { identityGaps, splitFileFields } from "../lib/audiences/profile.ts";

const row = (n, fields = {}) => ({ row: n, email: null, mobile: null, whatsapp: null, linkedin: null, extra: {}, ...fields });
const known = (id, fields = {}) => ({ id, email: null, mobile: null, whatsapp: null, linkedin: null, ...fields });

test("a row nobody matches is a new prospect", () => {
  const plan = planImport([], [row(1, { email: "a@x.example" })]);
  assert.deepEqual(plan.rows, [{ row: 1, outcome: "new", audienceId: null, duplicateOf: null, matchedOn: null }]);
  assert.equal(plan.created, 1);
  assert.equal(plan.existing, 0);
  assert.equal(plan.duplicates, 0);
});

test("a row matching a workspace prospect is existing, on any contact field", () => {
  const plan = planImport(
    [known("l_1", { email: "maya@x.example" }), known("l_2", { linkedin: "https://linkedin.com/in/omar" })],
    [row(1, { email: "MAYA@x.example" }), row(2, { linkedin: "linkedin.com/in/omar/" })],
  );
  assert.deepEqual(
    plan.rows.map((r) => [r.outcome, r.audienceId, r.matchedOn]),
    [
      ["existing", "l_1", "email"],
      ["existing", "l_2", "linkedin"],
    ],
  );
  assert.equal(plan.created, 0);
  assert.equal(plan.existing, 2);
});

test("a later row repeating an earlier one in the file is a duplicate of that row", () => {
  const plan = planImport([], [row(1, { email: "a@x.example" }), row(2, { email: "b@x.example" }), row(3, { email: "a@x.example", mobile: "+447700900123" })]);
  assert.deepEqual(plan.rows[2], { row: 3, outcome: "duplicate", audienceId: null, duplicateOf: 1, matchedOn: "email" });
  assert.equal(plan.created, 2);
  assert.equal(plan.duplicates, 1);
});

test("two rows reaching the same existing prospect count it once and flag the second as a duplicate", () => {
  const plan = planImport([known("l_1", { email: "a@x.example" })], [row(4, { email: "a@x.example" }), row(9, { email: "a@x.example" })]);
  assert.deepEqual(
    plan.rows.map((r) => [r.row, r.outcome, r.duplicateOf]),
    [
      [4, "existing", null],
      [9, "duplicate", 4],
    ],
  );
  assert.equal(plan.existing, 1);
  assert.equal(plan.duplicates, 1);
});

test("rows with no contact at all are not part of the plan", () => {
  const plan = planImport([], [row(1), row(2, { email: "a@x.example" })]);
  assert.deepEqual(plan.rows.map((r) => r.row), [2]);
});

test("the plan agrees with what the save step's merge creates and merges", () => {
  const existing = [known("l_1", { email: "a@x.example" }), known("l_2", { mobile: "+447700900111" })];
  const incoming = [
    row(1, { email: "a@x.example" }),
    row(2, { email: "new@x.example" }),
    row(3, { mobile: "+447700900111", email: "c@x.example" }),
    row(4, { email: "c@x.example" }),
    row(5, { email: "new@x.example" }),
  ];
  const plan = planImport(existing, incoming);
  const merge = mergeAudiences(
    existing.map((p) => ({ ...p, segmentIds: [], extra: {}, createdAt: "", updatedAt: "" })),
    incoming,
    "seg",
    "",
    (n) => "n" + n,
  );
  assert.equal(plan.created, merge.created);
  // Everything the merge folds into a profile is either an existing match or an in-file duplicate.
  assert.equal(plan.rows.length - plan.created, merge.merged);
  assert.equal(plan.existing, 2);
  assert.equal(plan.duplicates, 2);
  // The saved audience's "matched existing" is the review's "existing", not rows merged.
  assert.equal(merge.matchedExisting, plan.existing);
});

test("identityGaps says which details the file itself leaves out", () => {
  assert.deepEqual(identityGaps({}), { name: true, company: true, title: true });
  assert.deepEqual(identityGaps({ "First Name": "Ana", Organisation: "Kite" }), { name: false, company: false, title: true });
  assert.deepEqual(identityGaps({ Name: "  ", Company: "", "Job title": "CTO" }), { name: true, company: true, title: false });
});

test("splitFileFields keeps company columns apart and drops the ones that are already audience fields", () => {
  const { company, other } = splitFileFields({
    Name: "Ana Ruiz",
    Company: "Kitebox",
    "Job Title": "CTO",
    Industry: "Logistics",
    "Company Size": "51-200",
    Website: "kitebox.example",
    Notes: "Met at SaaStr",
    Empty: "  ",
  });
  assert.deepEqual(company, [
    { label: "Industry", value: "Logistics" },
    { label: "Company Size", value: "51-200" },
    { label: "Website", value: "kitebox.example" },
  ]);
  assert.deepEqual(other, [{ label: "Notes", value: "Met at SaaStr" }]);
});
