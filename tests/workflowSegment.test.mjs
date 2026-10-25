import assert from "node:assert/strict";
import test from "node:test";

import { STEP_ATTRIBUTE, getWorkflow, stepLabel, stepStats } from "../lib/app/workflow.ts";

/** A saved segment as the builder sees it: sized by reachable audiences, not rows. */
const SEGMENT = {
  k: "seg_1",
  name: "Conference list",
  n: 200,
  src: "Uploaded file",
  reach: { email: 180, whatsapp: 120, mobile: 150, linkedin: 60 },
  columns: { email: "work_email", whatsapp: "wa", mobile: "phone", linkedin: "li_url" },
};

test("an audience set to a segment counts its reachable audiences", () => {
  const w = getWorkflow(1);
  const audience = w.nodes.find((n) => n.kind === "audience");
  const nodes = w.nodes.map((n) => (n.id === audience.id ? { ...n, data: { ...n.data, list: "seg_1" } } : n));

  assert.equal(stepLabel("audience", { list: "seg_1" }, [SEGMENT]), "Conference list · 200");
  assert.deepEqual(stepStats(nodes, w.edges, [SEGMENT])[audience.id], [["200", "audiences"]]);
});

test("a channel step cannot reach more audiences than its mapped column holds", () => {
  const w = getWorkflow(1);
  const audience = w.nodes.find((n) => n.kind === "audience");
  const nodes = w.nodes.map((n) => (n.id === audience.id ? { ...n, data: { ...n.data, list: "seg_1" } } : n));

  // The LinkedIn invite follows the audience, so it would otherwise see all 200.
  const invite = nodes.find((n) => n.kind === "li_invite");
  assert.equal(STEP_ATTRIBUTE.li_invite, "linkedin");
  assert.deepEqual(stepStats(nodes, w.edges, [SEGMENT])[invite.id][0], ["60", "sent"]);
});

test("every channel step knows which attribute it reads", () => {
  assert.deepEqual(STEP_ATTRIBUTE, {
    email: "email",
    wa: "whatsapp",
    sms: "mobile",
    call: "mobile",
    li_invite: "linkedin",
    li_msg: "linkedin",
  });
});
