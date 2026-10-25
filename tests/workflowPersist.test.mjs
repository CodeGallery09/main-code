import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIENCE_CAMPAIGN,
  DEFAULT_SETTINGS,
  GRAPH_LIMITS,
  TEMPLATES,
  fromGraph,
  graphFromTemplate,
  toGraph,
  validateWorkflowGraph,
  validateWorkflowName,
} from "../lib/app/workflow.ts";

const clone = (value) => JSON.parse(JSON.stringify(value));
/** A known-good graph to mutate one thing at a time, so each test isolates one refusal. */
const good = () => clone(graphFromTemplate("outbound"));
const refused = (graph, pattern) => {
  const result = validateWorkflowGraph(graph);
  assert.equal(result.ok, false, "expected the graph to be refused");
  if (pattern) assert.match(result.error, pattern);
};

/* ------------------------------------------------------- what is accepted -- */

test("every template produces a graph the validator accepts", () => {
  for (const t of TEMPLATES) {
    const result = validateWorkflowGraph(clone(graphFromTemplate(t.k)));
    assert.equal(result.ok, true, `${t.k}: ${result.error}`);
  }
});

test("a template graph starts from the strategy's own audiences, not a demo list", () => {
  const audience = graphFromTemplate("outbound").nodes.find((n) => n.kind === "audience");
  assert.equal(audience.data.list, AUDIENCE_CAMPAIGN);
});

test("an unknown template falls back to a blank workflow rather than throwing", () => {
  const graph = graphFromTemplate("does-not-exist");
  assert.equal(graph.nodes.length, 1);
  assert.equal(graph.nodes[0].kind, "audience");
});

test("a graph survives toGraph, JSON and fromGraph unchanged", () => {
  const graph = good();
  const checked = validateWorkflowGraph(clone(graph));
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.data, graph);

  const workflow = fromGraph(checked.data, { id: "c_1", name: "Mine", status: "draft", started: null });
  assert.equal(workflow.id, "c_1", "the id is the strategy's string id");
  assert.deepEqual(toGraph(workflow), graph);
});

test("default settings are a Monday-to-Friday working day", () => {
  assert.deepEqual(DEFAULT_SETTINGS.days, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  assert.ok(DEFAULT_SETTINGS.from < DEFAULT_SETTINGS.to);
});

test("the output is a copy: mutating the input afterwards cannot change what was validated", () => {
  const input = good();
  const checked = validateWorkflowGraph(input);
  input.nodes[0].data.list = "tampered";
  input.nodes.pop();
  assert.notEqual(checked.data.nodes[0].data.list, "tampered");
  assert.equal(checked.data.nodes.length, good().nodes.length);
});

/* ------------------------------------------- fields it must not let through -- */

test("unknown fields on a node are dropped, never stored", () => {
  const graph = good();
  graph.nodes[0].evil = "<script>";
  graph.nodes[0].__injected = { deep: true };
  const checked = validateWorkflowGraph(graph);
  assert.equal(checked.ok, true);
  for (const node of checked.data.nodes) {
    assert.deepEqual(Object.keys(node).sort(), ["data", "id", "kind", "x", "y"]);
  }
});

test("an unknown field inside step data is refused, not silently kept", () => {
  const graph = good();
  graph.nodes[1].data.webhook = "https://attacker.example";
  refused(graph, /not a field a step can have/);
});

test("a __proto__ key in step data is refused", () => {
  const graph = good();
  // JSON.parse makes this an own property, which is how it would really arrive.
  graph.nodes[1].data = JSON.parse('{"__proto__": {"polluted": true}, "body": "hi"}');
  refused(graph, /not a field a step can have/);
  assert.equal({}.polluted, undefined, "the global object prototype must stay clean");
});

test("step data values must have the right type and size", () => {
  const withData = (patch) => {
    const graph = good();
    const emailNode = graph.nodes.find((n) => n.kind === "email");
    Object.assign(emailNode.data, patch);
    return graph;
  };
  refused(withData({ body: 42 }), /body/);
  refused(withData({ body: "x".repeat(GRAPH_LIMITS.text + 1) }), /body/);
  refused(withData({ thread: "yes" }), /thread/);
  refused(withData({ list: "x".repeat(GRAPH_LIMITS.shortText + 1) }), /list/);
  assert.equal(validateWorkflowGraph(withData({ body: "x".repeat(GRAPH_LIMITS.text) })).ok, true);
});

test("numeric and enum step data are range-checked", () => {
  const withKind = (kind, patch) => {
    const graph = good();
    const node = graph.nodes.find((n) => n.kind === kind);
    Object.assign(node.data, patch);
    return graph;
  };
  refused(withKind("wait", { days: -1 }), /days/);
  refused(withKind("wait", { days: Infinity }), /days/);
  refused(withKind("wait", { days: NaN }), /days/);
  refused(withKind("cond", { check: "teleported" }), /check/);
  refused(withKind("cond", { score: 101 }), /score/);
  refused(withKind("goal", { goal: "world-peace" }), /goal/);
  refused(withKind("call", { assign: "everyone" }), /assign/);
  assert.equal(validateWorkflowGraph(withKind("wait", { days: 0 })).ok, true);
});

/* ------------------------------------------------------- structural rules -- */

test("an unknown step kind is refused", () => {
  const graph = good();
  graph.nodes[1].kind = "launch_missiles";
  refused(graph, /not a known step/);
});

test("duplicate node ids are refused", () => {
  const graph = good();
  graph.nodes[2].id = graph.nodes[1].id;
  refused(graph, /used twice/);
});

test("a workflow needs exactly one Audience", () => {
  const none = good();
  none.nodes = none.nodes.filter((n) => n.kind !== "audience");
  none.edges = [];
  refused(none, /exactly one Audience/);

  const two = good();
  two.nodes.push({ id: "extra", kind: "audience", x: 0, y: 0, data: {} });
  refused(two, /exactly one Audience/);
});

test("edges must connect steps that exist", () => {
  const dangling = good();
  dangling.edges[0].target = "ghost";
  refused(dangling, /no such step/);
  const orphan = good();
  orphan.edges[0].source = "ghost";
  refused(orphan, /no such step/);
});

test("a step cannot lead to itself, and nothing can lead into the Audience", () => {
  const self = good();
  self.edges.push({ id: "loop", source: self.nodes[1].id, target: self.nodes[1].id, port: "out" });
  refused(self);

  const intoRoot = good();
  const root = intoRoot.nodes.find((n) => n.kind === "audience");
  const email = intoRoot.nodes.find((n) => n.kind === "email");
  intoRoot.edges.push({ id: "back", source: email.id, target: root.id, port: "out" });
  refused(intoRoot);
});

test("an edge must use a socket its source step actually has", () => {
  const graph = good();
  const wait = graph.nodes.find((n) => n.kind === "wait");
  const target = graph.nodes.find((n) => n.kind === "goal");
  graph.edges.push({ id: "bad", source: wait.id, target: target.id, port: "yes" });
  refused(graph, /no "yes" socket/);
});

test("one socket leads to one step", () => {
  const graph = good();
  const first = graph.edges[0];
  const other = graph.nodes.find((n) => n.id !== first.source && n.id !== first.target && n.kind !== "audience");
  graph.edges.push({ id: "dup-socket", source: first.source, target: other.id, port: first.port });
  refused(graph, /already audiences somewhere/);
});

test("a cycle is refused — the canvas walks the graph recursively and would hang", () => {
  const graph = graphFromTemplate("blank");
  const root = graph.nodes[0];
  graph.nodes.push(
    { id: "a", kind: "wait", x: 0, y: 100, data: { days: 1, biz: true } },
    { id: "b", kind: "wait", x: 0, y: 200, data: { days: 1, biz: true } },
  );
  graph.edges = [
    { id: "e1", source: root.id, target: "a", port: "out" },
    { id: "e2", source: "a", target: "b", port: "out" },
    { id: "e3", source: "b", target: "a", port: "out" },
  ];
  refused(clone(graph), /loop back/);
});

test("size is bounded", () => {
  const big = graphFromTemplate("blank");
  for (let i = 0; i < GRAPH_LIMITS.nodes + 1; i++) {
    big.nodes.push({ id: `w${i}`, kind: "wait", x: 0, y: i, data: { days: 1 } });
  }
  refused(big, /at most/);

  const manyEdges = good();
  manyEdges.edges = Array.from({ length: GRAPH_LIMITS.edges + 1 }, (_, i) => ({
    id: `e${i}`,
    source: "x",
    target: "y",
    port: "out",
  }));
  refused(manyEdges, /at most/);
});

test("coordinates must be finite and sane", () => {
  const graph = good();
  graph.nodes[1].x = Infinity;
  refused(graph, /x and y/);
  const far = good();
  far.nodes[1].y = GRAPH_LIMITS.coord + 1;
  refused(far, /x and y/);
});

test("non-objects and wrong containers are refused without throwing", () => {
  for (const input of [null, undefined, 42, "graph", [], { nodes: "no", edges: [], settings: {} }, { nodes: [], edges: "no", settings: {} }]) {
    assert.equal(validateWorkflowGraph(input).ok, false);
  }
});

/* ------------------------------------------------------------ the settings -- */

test("sending-window settings are validated", () => {
  const withSettings = (patch) => {
    const graph = good();
    Object.assign(graph.settings, patch);
    return graph;
  };
  refused(withSettings({ days: [] }), /weekday/);
  refused(withSettings({ days: ["Mon", "Mon"] }), /weekday/);
  refused(withSettings({ days: ["Someday"] }), /weekday/);
  refused(withSettings({ from: "9am" }), /times like/);
  refused(withSettings({ to: "25:00" }), /times like/);
  refused(withSettings({ from: "18:00", to: "09:00" }), /end after it starts/);
  refused(withSettings({ from: "09:00", to: "09:00" }), /end after it starts/);
  refused(withSettings({ daily: 0 }), /daily/);
  refused(withSettings({ daily: 1.5 }), /daily/);
  refused(withSettings({ daily: 10_001 }), /daily/);
  refused(withSettings({ skipOther: "yes" }), /skipOther/);
  assert.equal(validateWorkflowGraph(withSettings({ daily: 10_000 })).ok, true);
});

test("missing settings are refused", () => {
  const graph = good();
  delete graph.settings;
  refused(graph, /settings/);
});

/* ----------------------------------------------------------------- the name -- */

test("a workflow name is trimmed, required and capped", () => {
  assert.deepEqual(validateWorkflowName("  Q4 outbound  "), { ok: true, data: "Q4 outbound" });
  assert.equal(validateWorkflowName("   ").ok, false);
  assert.equal(validateWorkflowName(undefined).ok, false);
  assert.equal(validateWorkflowName(42).ok, false);
  assert.equal(validateWorkflowName("x".repeat(121)).ok, false);
  assert.equal(validateWorkflowName("x".repeat(120)).ok, true);
});
