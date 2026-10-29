import test from "node:test";
import assert from "node:assert/strict";
import { journeyOrder } from "../lib/engine/journey.ts";

const nodes = [
  { id: "a", kind: "audience" },
  { id: "inv", kind: "li_invite" },
  { id: "w", kind: "wait" },
  { id: "c", kind: "cond" },
  { id: "msg", kind: "li_msg" },
  { id: "mail", kind: "email" },
  { id: "orphan", kind: "call" },
];
const edges = [
  { source: "a", target: "inv", port: "out" },
  { source: "inv", target: "w", port: "out" },
  { source: "w", target: "c", port: "out" },
  { source: "c", target: "mail", port: "no" },
  { source: "c", target: "msg", port: "yes" },
];

test("walks the plan from the audience, yes before no, with depth", () => {
  assert.deepEqual(journeyOrder(nodes, edges), [
    { id: "a", depth: 0 },
    { id: "inv", depth: 1 },
    { id: "w", depth: 2 },
    { id: "c", depth: 3 },
    { id: "msg", depth: 4 },
    { id: "mail", depth: 4 },
  ]);
});

test("leaves out steps no lead can reach", () => {
  assert.ok(!journeyOrder(nodes, edges).some((s) => s.id === "orphan"));
});

test("survives a cycle and an empty plan", () => {
  const loop = [...edges, { source: "mail", target: "inv", port: "out" }];
  assert.equal(journeyOrder(nodes, loop).length, 6);
  assert.deepEqual(journeyOrder([], []), []);
});

test("rows carry labels, channels and per-step counts", async () => {
  const { journeyRows } = await import("../lib/engine/journey.ts");
  const graph = [
    { id: "a", kind: "audience", data: {} },
    { id: "inv", kind: "li_invite", data: {} },
    { id: "w", kind: "wait", data: { days: 3 } },
  ];
  const rows = journeyRows(
    graph,
    [
      { source: "a", target: "inv", port: "out" },
      { source: "inv", target: "w", port: "out" },
    ],
    new Map([["inv", 4]]),
    new Map([["w", 2]]),
    5,
  );
  assert.deepEqual(
    rows.map((r) => [r.label, r.channel, r.reached, r.here]),
    [
      ["Audience enrolled", null, 5, 0],
      ["LinkedIn invite", "linkedin", 4, 0],
      ["Wait 3 days", null, 0, 2],
    ],
  );
});
