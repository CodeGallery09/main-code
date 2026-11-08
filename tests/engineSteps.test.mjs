import test from "node:test";
import assert from "node:assert/strict";
import { bucket, DRY_RUN_DAY_MS, fillMergeFields, REAL_DAY_MS, runStep } from "../lib/engine/steps.ts";

const audience = { id: "a1", name: "Maya Ortiz", company: "Northwind", score: 82 };
const NOW = 1_000_000;

/** audience → invite → wait(2d) → cond(replied) → yes: goal / no: call → exit */
const nodes = [
  { id: "n0", kind: "audience", data: {} },
  { id: "n1", kind: "li_invite", data: { note: "Hi {first_name} at {company}" } },
  { id: "n2", kind: "wait", data: { days: 2 } },
  { id: "n3", kind: "cond", data: { check: "replied", within: 3 } },
  { id: "n4", kind: "goal", data: {} },
  { id: "n5", kind: "call", data: { notes: "Mention the demo" } },
  { id: "n6", kind: "exit", data: {} },
  { id: "n7", kind: "cond", data: { check: "score", score: 70 } },
  { id: "n8", kind: "split", data: { a: 50 } },
];
const edges = [
  { source: "n0", target: "n1", port: "out" },
  { source: "n1", target: "n2", port: "out" },
  { source: "n2", target: "n3", port: "out" },
  { source: "n3", target: "n4", port: "yes" },
  { source: "n3", target: "n5", port: "no" },
  { source: "n5", target: "n6", port: "out" },
  { source: "n7", target: "n4", port: "yes" },
  { source: "n7", target: "n5", port: "no" },
  { source: "n8", target: "n4", port: "a" },
  { source: "n8", target: "n5", port: "b" },
];
const run = (stepId) => runStep({ nodes, edges, stepId, audience, now: NOW });

test("the audience step just hands on", () => {
  const r = run("n0");
  assert.deepEqual(r.next, { stepId: "n1", runAt: NOW });
  assert.equal(r.finish, null);
});

test("a LinkedIn step hands the runner the words to send, merge fields already filled", () => {
  const r = run("n1");
  assert.equal(r.effects.length, 1);
  assert.equal(r.effects[0].type, "send");
  assert.equal(r.effects[0].kind, "li_invite");
  assert.equal(r.effects[0].channel, "linkedin");
  assert.equal(r.effects[0].body, "Hi Maya at Northwind");
  // The same effect carries what the log says when nothing can actually be sent.
  assert.match(r.effects[0].dryRunText, /^Would send Maya Ortiz a LinkedIn invite/);
  assert.equal(r.next.stepId, "n2");
});

test("a real day is used when the runner asks for one", () => {
  const real = runStep({ nodes, edges, stepId: "n2", audience, now: NOW, dayMs: REAL_DAY_MS });
  assert.equal(real.next.runAt, NOW + 2 * REAL_DAY_MS);
  assert.match(
    runStep({ nodes, edges, stepId: "n2", audience, now: NOW, dayMs: REAL_DAY_MS }).effects[0].text,
    /waits 2 days\.$/,
  );
});

test("a wait is compressed: a day is a minute", () => {
  const r = run("n2");
  assert.equal(r.next.runAt, NOW + 2 * DRY_RUN_DAY_MS);
});

test("a condition about the lead acting takes No after its window, because nobody can act", () => {
  const r = run("n3");
  assert.equal(r.next.stepId, "n5");
  assert.equal(r.next.runAt, NOW + 3 * DRY_RUN_DAY_MS);
});

test("a score condition is decided now, from the lead's score", () => {
  assert.equal(run("n7").next.stepId, "n4");
  const low = runStep({ nodes, edges, stepId: "n7", audience: { ...audience, score: 40 }, now: NOW });
  assert.equal(low.next.stepId, "n5");
  assert.equal(low.next.runAt, NOW);
});

test("a call step makes a to-do for a person", () => {
  const r = run("n5");
  const task = r.effects.find((e) => e.type === "task");
  assert.match(task.summary, /^Call Maya Ortiz at Northwind/);
  assert.match(task.summary, /Mention the demo/);
});

test("goal completes the run and exit stops it", () => {
  assert.equal(run("n4").finish, "completed");
  assert.equal(run("n4").next, null);
  assert.equal(run("n6").finish, "stopped");
});

test("a step with nothing after it ends the run", () => {
  const r = runStep({ nodes, edges: [], stepId: "n1", audience, now: NOW });
  assert.equal(r.next, null);
  assert.equal(r.finish, "completed");
});

test("an unknown step ends the run instead of hanging it", () => {
  assert.equal(run("missing").finish, "completed");
});

test("a split is stable for a lead and covers both sides across leads", () => {
  assert.equal(bucket("a1", "n8"), bucket("a1", "n8"));
  const sides = new Set();
  for (let i = 0; i < 40; i++) {
    sides.add(runStep({ nodes, edges, stepId: "n8", audience: { ...audience, id: `lead${i}` }, now: NOW }).next.stepId);
  }
  assert.deepEqual([...sides].sort(), ["n4", "n5"]);
});

test("merge fields", () => {
  assert.equal(fillMergeFields("{first_name}|{last_name}|{company}", audience), "Maya|Ortiz|Northwind");
});

/* ---------- conditions that watch for the lead acting ---------------------- */

/** audience → invite → cond(accepted within 5) → yes: message / no: exit */
const watching = {
  nodes: [
    { id: "w0", kind: "audience", data: {} },
    { id: "w1", kind: "li_invite", data: { note: "" } },
    { id: "w2", kind: "cond", data: { check: "accepted", within: 5 } },
    { id: "w3", kind: "li_msg", data: { body: "Thanks for connecting, {first_name}" } },
    { id: "w4", kind: "exit", data: {} },
  ],
  edges: [
    { source: "w0", target: "w1", port: "out" },
    { source: "w1", target: "w2", port: "out" },
    { source: "w2", target: "w3", port: "yes" },
    { source: "w2", target: "w4", port: "no" },
  ],
};
const at = (now, observe) =>
  runStep({ ...watching, stepId: "w2", audience, now, dayMs: REAL_DAY_MS, observe });

test("the invite → if accepted → message sequence: an acceptance takes Yes straight away", () => {
  const r = at(NOW, { signals: { accepted: NOW - 1000 }, enteredAt: NOW - 3600_000, firstVisit: false });
  assert.equal(r.next.stepId, "w3", "the message step comes next");
  assert.equal(r.next.runAt, NOW, "with no waiting out the rest of the window");
  assert.match(r.effects[0].text, /Maya Ortiz accepted the invite — takes Yes/);
});

test("with nothing seen yet, a condition looks again soon instead of deciding", () => {
  const first = at(NOW, { signals: {}, enteredAt: NOW, firstVisit: true });
  assert.equal(first.next.stepId, "w2", "the same condition, again");
  assert.equal(first.finish, null);
  assert.equal(first.next.runAt, NOW + 30 * 60_000, "half an hour later");
  assert.match(first.effects[0].text, /Waiting up to 5 days to see whether Maya Ortiz accepted the invite/);

  // Later visits are silent: one waiting line, not one every half hour.
  const later = at(NOW + 3600_000, { signals: {}, enteredAt: NOW, firstVisit: false });
  assert.equal(later.effects.length, 0);
  assert.equal(later.next.stepId, "w2");
});

test("a re-check never lands past the end of the window", () => {
  const deadline = NOW + 5 * REAL_DAY_MS;
  const r = at(deadline - 60_000, { signals: {}, enteredAt: NOW, firstVisit: false });
  assert.equal(r.next.runAt, deadline);
});

test("once the window is out with nothing seen, the lead takes No — and only then", () => {
  const r = at(NOW + 5 * REAL_DAY_MS, { signals: {}, enteredAt: NOW, firstVisit: false });
  assert.equal(r.next.stepId, "w4");
  assert.match(r.effects[0].text, /hasn't accepted the invite within 5 days — takes No/);
});

test("a signal for a different behaviour does not satisfy the condition", () => {
  const r = at(NOW, { signals: { opened: NOW, replied: NOW }, enteredAt: NOW, firstVisit: true });
  assert.equal(r.next.stepId, "w2", "a reply is not an acceptance");
});

test("in a dry run the re-check is compressed with the days", () => {
  const r = runStep({ ...watching, stepId: "w2", audience, now: NOW, observe: { signals: {}, enteredAt: NOW, firstVisit: true } });
  assert.ok(r.next.runAt - NOW < 60_000, "well inside a compressed day");
  assert.ok(r.next.runAt - NOW >= 5_000);
});

test("replied, opened and clicked are each their own signal", () => {
  for (const check of ["replied", "opened", "clicked"]) {
    const graph = {
      nodes: watching.nodes.map((n) => (n.id === "w2" ? { ...n, data: { check, within: 3 } } : n)),
      edges: watching.edges,
    };
    const r = runStep({ ...graph, stepId: "w2", audience, now: NOW, dayMs: REAL_DAY_MS, observe: { signals: { [check]: NOW }, enteredAt: NOW, firstVisit: false } });
    assert.equal(r.next.stepId, "w3", check);
  }
});

test("an email step carries its thread setting to the sender", () => {
  const r = runStep({
    nodes: [{ id: "e1", kind: "email", data: { subject: "", body: "Hi {first_name}", thread: true } }],
    edges: [],
    stepId: "e1",
    audience,
    now: NOW,
  });
  const send = r.effects.find((e) => e.type === "send");
  assert.equal(send.channel, "email");
  assert.equal(send.thread, true);
  assert.equal(send.body, "Hi Maya");
});

test("every variable the builder offers is filled, so a lead never receives braces", async () => {
  const { MERGE_VARS } = await import("../lib/app/workflow.ts");
  const lead = { id: "a", name: "Maya Ortiz", company: "Northwind", score: 50, title: "Head of Sales" };
  const filled = fillMergeFields(MERGE_VARS.join(" "), lead);
  assert.doesNotMatch(filled, /[{}]/);
  assert.equal(filled, "Maya Northwind Head of Sales");
});

test("a lead with no first name is greeted as 'there', not 'Hi ,'", () => {
  assert.equal(fillMergeFields("Hi {first_name},", { id: "a", name: "", company: "", score: 0 }), "Hi there,");
});
