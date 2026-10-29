import test from "node:test";
import assert from "node:assert/strict";
import { bucket, DRY_RUN_DAY_MS, fillMergeFields, runStep } from "../lib/engine/steps.ts";

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

test("a LinkedIn step is logged as a dry run with its merge fields filled, never sent", () => {
  const r = run("n1");
  assert.equal(r.effects.length, 1);
  assert.equal(r.effects[0].type, "log");
  assert.match(r.effects[0].text, /^Dry run: would send Maya Ortiz a LinkedIn invite/);
  assert.match(r.effects[0].text, /Hi Maya at Northwind/);
  assert.equal(r.next.stepId, "n2");
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
