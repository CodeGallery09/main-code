import test from "node:test";
import assert from "node:assert/strict";
import { connect, freePort, freeSlot, keepInView, refuseConnect, removeNode, wouldCycle } from "../lib/ws/graphEdit.ts";

const n = (id, kind = "email", x = 0, y = 0) => ({ id, kind, x, y });
const e = (source, target, port = "out") => ({ id: `e${source}-${port}-${target}`, source, target, port });
const make = (s, t, p) => e(s, t, p);

test("a connection that would loop is refused", () => {
  const edges = [e("a", "b"), e("b", "c")];
  assert.equal(wouldCycle(edges, "c", "a"), true);
  assert.equal(wouldCycle(edges, "a", "c"), false);
  assert.equal(wouldCycle(edges, "a", "a"), true);
});

test("nothing leads into the audience, and a missing step is refused", () => {
  const nodes = [n("aud", "audience"), n("x")];
  assert.match(refuseConnect(nodes, [], "x", "aud"), /starts/);
  assert.match(refuseConnect(nodes, [], "x", "gone"), /no longer/);
  assert.equal(refuseConnect(nodes, [], "aud", "x"), null);
});

test("connecting moves a step instead of giving it two parents", () => {
  const nodes = [n("a", "audience"), n("b"), n("c")];
  const edges = [e("a", "b"), e("b", "c")];
  const next = connect(nodes, edges, "a", "out", "c", make);
  // a's one port now leads to c; b lost its child because c moved, and a no longer leads to b.
  assert.deepEqual(next.map((x) => x.id).sort(), ["ea-out-c"]);
});

test("a cyclic connection returns null and changes nothing", () => {
  const nodes = [n("a", "audience"), n("b"), n("c")];
  const edges = [e("a", "b"), e("b", "c")];
  assert.equal(connect(nodes, edges, "c", "out", "b", make), null);
});

test("removing a step drops its connections", () => {
  const out = removeNode([n("a"), n("b"), n("c")], [e("a", "b"), e("b", "c")], "b");
  assert.deepEqual(out.nodes.map((x) => x.id), ["a", "c"]);
  assert.deepEqual(out.edges, []);
});

test("freePort finds the first unused socket", () => {
  assert.equal(freePort([e("a", "b", "yes")], "a", ["yes", "no"]), "no");
  assert.equal(freePort([e("a", "b", "yes"), e("a", "c", "no")], "a", ["yes", "no"]), null);
});

test("freeSlot moves a new card clear of the ones already there", () => {
  const slot = freeSlot([n("a", "email", 0, 0)], 10, 10, 236, 88);
  assert.ok(slot.x >= 236 || slot.y >= 88);
  assert.deepEqual(freeSlot([], -50, -20, 236, 88), { x: 0, y: 0 });
});

test("keepInView slides a plan with negative coordinates into view and leaves a clear one alone", () => {
  const moved = keepInView([n("a", "audience", -300, 10), n("b", "email", 20, 150)]);
  assert.deepEqual(moved.map((x) => [x.x, x.y]), [[40, 40], [360, 180]]);
  const clear = [n("a", "audience", 100, 100)];
  assert.equal(keepInView(clear), clear);
});
