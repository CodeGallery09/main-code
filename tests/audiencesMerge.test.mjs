import assert from "node:assert/strict";
import test from "node:test";

import { mergeAudiences } from "../lib/audiences/merge.ts";

const NOW = "2026-01-01T00:00:00.000Z";
let seq = 0;
const ids = () => "prof_" + ++seq;

const audience = (row, fields) => ({
  row,
  email: null,
  mobile: null,
  whatsapp: null,
  linkedin: null,
  ...fields,
});

test("a row with no match becomes a new profile", () => {
  const result = mergeAudiences([], [audience(1, { email: "maya@example.com" })], "seg_1", NOW, ids);
  assert.equal(result.created, 1);
  assert.equal(result.merged, 0);
  assert.deepEqual(result.profiles[0].segmentIds, ["seg_1"]);
  assert.equal(result.outcomes[0].action, "created");
});

test("a matching email merges into the parent and enriches it", () => {
  const parent = {
    id: "prof_parent",
    email: "maya@example.com",
    mobile: null,
    whatsapp: null,
    linkedin: null,
    segmentIds: ["seg_old"],
    extra: {},
    createdAt: NOW,
    updatedAt: NOW,
  };

  const result = mergeAudiences(
    [parent],
    [
      audience(1, {
        email: "MAYA@example.com",
        mobile: "+919820055123",
        whatsapp: "+919820055123",
        linkedin: "https://linkedin.com/in/maya",
      }),
    ],
    "seg_2",
    NOW,
    ids,
  );

  assert.equal(result.profiles.length, 1, "no second profile is created");
  assert.equal(result.merged, 1);
  const merged = result.profiles[0];
  assert.equal(merged.id, "prof_parent", "the parent keeps its id");
  assert.equal(merged.mobile, "+919820055123");
  assert.equal(merged.whatsapp, "+919820055123");
  assert.equal(merged.linkedin, "https://linkedin.com/in/maya");
  assert.deepEqual(merged.segmentIds, ["seg_old", "seg_2"], "the audience stays linked to both segments");
  assert.deepEqual(result.outcomes[0].enriched, ["mobile", "whatsapp", "linkedin"]);
  assert.equal(result.outcomes[0].matchedOn, "email");
});

test("the parent's own values win over the child's", () => {
  const parent = {
    id: "prof_parent",
    email: "maya@example.com",
    mobile: "+14155550142",
    whatsapp: null,
    linkedin: null,
    segmentIds: ["seg_1"],
    extra: { company: "Example Co" },
    createdAt: NOW,
    updatedAt: NOW,
  };
  const result = mergeAudiences(
    [parent],
    [audience(1, { email: "maya@example.com", mobile: "+919820055123", extra: { company: "Other Co" } })],
    "seg_2",
    NOW,
    ids,
  );
  assert.equal(result.profiles[0].mobile, "+14155550142");
  assert.deepEqual(result.profiles[0].extra, { company: "Example Co" });
  assert.deepEqual(result.outcomes[0].enriched, []);
});

test("matching falls through email, mobile, whatsapp then linkedin", () => {
  const parent = {
    id: "prof_parent",
    email: null,
    mobile: null,
    whatsapp: null,
    linkedin: "https://www.linkedin.com/in/maya-reyes/",
    segmentIds: ["seg_1"],
    extra: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
  // Same profile URL typed differently is the same person.
  const result = mergeAudiences(
    [parent],
    [audience(1, { email: "maya@example.com", linkedin: "https://linkedin.com/in/maya-reyes" })],
    "seg_2",
    NOW,
    ids,
  );
  assert.equal(result.merged, 1);
  assert.equal(result.outcomes[0].matchedOn, "linkedin");
  assert.equal(result.profiles[0].email, "maya@example.com");
});

test("numbers match on their digits, however they were typed", () => {
  const parent = {
    id: "prof_parent",
    email: null,
    mobile: "+91 98200 55123",
    whatsapp: null,
    linkedin: null,
    segmentIds: ["seg_1"],
    extra: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
  const result = mergeAudiences([parent], [audience(1, { mobile: "+919820055123" })], "seg_2", NOW, ids);
  assert.equal(result.merged, 1);
  assert.equal(result.profiles.length, 1);
});

test("rows inside one file dedupe against each other", () => {
  const result = mergeAudiences(
    [],
    [
      audience(1, { email: "maya@example.com" }),
      audience(2, { email: "maya@example.com", mobile: "+919820055123" }),
      audience(3, { email: "omar@example.com" }),
    ],
    "seg_1",
    NOW,
    ids,
  );
  assert.equal(result.created, 2);
  assert.equal(result.merged, 1);
  assert.equal(result.profiles.length, 2);
  assert.equal(result.profiles[0].mobile, "+919820055123");
  assert.deepEqual(result.profiles[0].segmentIds, ["seg_1"], "one segment link, not two");
});

test("a row with nothing reachable is not stored", () => {
  const result = mergeAudiences([], [audience(1, {})], "seg_1", NOW, ids);
  assert.equal(result.profiles.length, 0);
  assert.equal(result.outcomes.length, 0);
});

test("the profiles passed in are never mutated", () => {
  const parent = {
    id: "prof_parent",
    email: "maya@example.com",
    mobile: null,
    whatsapp: null,
    linkedin: null,
    segmentIds: ["seg_1"],
    extra: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
  mergeAudiences([parent], [audience(1, { email: "maya@example.com", mobile: "+919820055123" })], "seg_2", NOW, ids);
  assert.equal(parent.mobile, null);
  assert.deepEqual(parent.segmentIds, ["seg_1"]);
});
