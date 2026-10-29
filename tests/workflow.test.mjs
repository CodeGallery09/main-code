import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CHECKS,
  NODE_W,
  OFFERED_CHECKS,
  PALETTE,
  STEPS,
  TEMPLATES,
  WORKFLOWS,
  blankCopySteps,
  blankWorkflow,
  copyField,
  edgePath,
  SEQUENCE_KINDS,
  graphForChannel,
  getWorkflow,
  graphFromSequence,
  graphFromTemplate,
  issues,
  layout,
  portX,
  stepLabel,
  stepStats,
  workflowChannels,
} from "../lib/app/workflow.ts";

/** The five multichannel strategies each have a workflow. */
test("seeds one workflow per multichannel strategy", () => {
  assert.deepEqual(
    WORKFLOWS.map((w) => [w.id, w.name, w.status]),
    [
      [1, "Net-new outbound", "live"],
      [2, "Inbound follow-up", "live"],
      [3, "Closed-lost re-engage", "live"],
      [4, "Event follow-up", "paused"],
      [5, "Q1 founders", "draft"],
    ],
  );
  assert.deepEqual(workflowChannels(getWorkflow(1)), ["li", "mail", "call"]);
});

test("every step but the audience is led into by an edge", () => {
  for (const w of WORKFLOWS) {
    const unreachable = w.nodes.filter(
      (n) => n.kind !== "audience" && !w.edges.some((e) => e.target === n.id),
    );
    // Only the Q1 founders draft carries a stray step, on purpose.
    assert.equal(unreachable.length, w.id === 5 ? 1 : 0, `workflow ${w.id}`);
  }
});

test("lays the tree out centred, one row per level", () => {
  const w = getWorkflow(1);
  const at = (kind, nth = 0) => w.nodes.filter((n) => n.kind === kind)[nth];
  assert.deepEqual([at("audience").x, at("audience").y], [-118, 0]);
  assert.deepEqual([at("li_invite").x, at("li_invite").y], [-118, 128]);
  // The condition's Yes branch hangs left, its No branch right.
  assert.deepEqual([at("li_msg").x, at("li_msg").y], [-260, 384]);
  assert.deepEqual([at("email").x, at("email").y], [166, 384]);
  assert.deepEqual([at("goal", 0).x, at("goal", 0).y], [-402, 768]);
  assert.deepEqual([at("exit").x, at("exit").y], [166, 640]);
});

test("layout parks a step nothing leads to below the tree", () => {
  const w = getWorkflow(5);
  const stray = w.nodes.find((n) => n.kind === "sms");
  const tidied = layout(w.nodes, w.edges).find((n) => n.id === stray.id);
  assert.equal(tidied.x, -NODE_W / 2);
  assert.ok(tidied.y > Math.max(...w.nodes.map((n) => n.y)));
});

test("walks the audience count down the funnel", () => {
  const w = getWorkflow(1);
  const stats = stepStats(w.nodes, w.edges);
  const of = (kind, nth = 0) => stats[w.nodes.filter((n) => n.kind === kind)[nth].id];

  // Rates carry a "~": they are typical rates applied to the audience size, not measurements,
  // and on the canvas they sit beside counts that look exactly like results.
  assert.deepEqual(of("audience"), [["612", "audiences"]]);
  assert.deepEqual(of("li_invite"), [["612", "sent"], ["~48%", "accepted"]]);
  // 48% of 612 accept, so that is what the LinkedIn message goes out to.
  assert.deepEqual(of("li_msg"), [["294", "sent"], ["~9.2%", "replied"]]);
  assert.deepEqual(of("email"), [["318", "sent"], ["~58%", "opened"]]);
  assert.deepEqual(of("wait", 0), [["24", "waiting"]]);
  assert.deepEqual(of("call"), [["256", "tasks"], ["~44%", "connected"]]);
  assert.deepEqual(of("goal", 0), [["15", "reached"]]);
  assert.deepEqual(of("goal", 1), [["102", "reached"]]);
  assert.deepEqual(of("exit"), [["318", "exited"]]);
});

test("reads the audience count off the chosen list", () => {
  const w = getWorkflow(2);
  const audience = w.nodes.find((n) => n.kind === "audience");
  const stats = stepStats(w.nodes, w.edges);
  assert.deepEqual(stats[audience.id], [["214", "audiences"]]);

  const swapped = w.nodes.map((n) => (n.kind === "audience" ? { ...n, data: { ...n.data, list: "lost" } } : n));
  assert.deepEqual(stepStats(swapped, w.edges)[audience.id], [["458", "audiences"]]);
});

test("labels a step from its own settings", () => {
  assert.equal(stepLabel("wait", { days: 1, biz: true }), "1 business day");
  assert.equal(stepLabel("wait", { days: 3, biz: false }), "3 days");
  assert.equal(stepLabel("cond", { check: "accepted", within: 5 }), "Accepted invite in 5d?");
  assert.equal(stepLabel("cond", { check: "score", score: 70 }), "Score ≥ 70?");
  assert.equal(stepLabel("li_invite", { note: "" }), "No note");
  assert.equal(stepLabel("sms", { body: "" }), "Empty message");
  assert.equal(stepLabel("audience", { list: "q1" }), "Q1 founders · 340");
  assert.equal(stepLabel("split", { a: 40 }), "40 / 60");
});

test("flags the problems a workflow cannot launch with", () => {
  const w = getWorkflow(5);
  const found = issues(w.nodes, w.edges);
  const stray = w.nodes.find((n) => n.kind === "sms");
  assert.equal(found[stray.id], "Message is empty");

  const dangling = w.nodes.filter((n) => found[n.id] === "Next step missing");
  assert.equal(dangling.length, 0);

  // A step whose channel is switched off cannot send either.
  const off = issues(w.nodes, w.edges, (ch) => ch === "li");
  const invite = w.nodes.find((n) => n.kind === "li_invite");
  assert.equal(off[invite.id], "LinkedIn is turned off");
});

test("flags a step with nothing after it", () => {
  const w = getWorkflow(1);
  const goal = w.nodes.find((n) => n.kind === "goal");
  const trimmed = w.edges.filter((e) => e.target !== goal.id);
  assert.equal(issues(w.nodes, trimmed)[goal.id], "Not connected");

  const condition = w.nodes.find((n) => n.kind === "cond");
  const noYes = w.edges.filter((e) => !(e.source === condition.id && e.port === "yes"));
  assert.equal(issues(w.nodes, noYes)[condition.id], "Next step missing");
});

test("a blank workflow is just an audience", () => {
  const w = blankWorkflow();
  assert.equal(w.nodes.length, 1);
  assert.equal(w.nodes[0].kind, "audience");
  assert.equal(w.status, "draft");
  assert.equal(w.name, "Untitled workflow");
  assert.deepEqual(w.edges, []);
});

test("places ports under the card", () => {
  const cond = { id: "a", kind: "cond", x: 0, y: 0, data: {} };
  assert.equal(portX(cond, "yes"), NODE_W * 0.25);
  assert.equal(portX(cond, "no"), NODE_W * 0.75);
  assert.equal(portX({ id: "b", kind: "wait", x: 100, y: 0, data: {} }, "out"), 100 + NODE_W / 2);
});

test("draws a straight edge when the cards line up and a step when they do not", () => {
  assert.equal(edgePath(50, 0, 50, 100), "M50 0L50 100");
  const stepped = edgePath(0, 0, 200, 100);
  assert.match(stepped, /^M0 0L0 \d/);
  assert.ok(stepped.includes("Q"), "corners are rounded");
  assert.ok(stepped.endsWith("L200 100"));
});

test("only steps that can run are offered in the palette", () => {
  const offered = PALETTE.flatMap(([, kinds]) => kinds);
  // WhatsApp and SMS need a business number and approved templates that do not exist, so a
  // sequence built from them could never send with nothing on the canvas saying so.
  assert.equal(offered.includes("wa"), false);
  assert.equal(offered.includes("sms"), false);
  // A call step does run today: it becomes a to-do for a person.
  assert.equal(offered.includes("call"), true);
  for (const kind of offered) assert.ok(STEPS[kind], `${kind} is offered but not a known step`);
  // Still described, so a stored graph that already holds one keeps rendering.
  assert.ok(STEPS.wa && STEPS.sms);
});

test("no template builds a step that cannot run", () => {
  for (const template of TEMPLATES) {
    const { nodes } = graphFromTemplate(template.k);
    for (const node of nodes) {
      assert.ok(node.kind !== "wa" && node.kind !== "sms", `${template.k} starts with a ${node.kind} step`);
    }
    for (const channel of template.ch) {
      assert.ok(channel !== "wa" && channel !== "sms", `${template.k} advertises ${channel}`);
    }
  }
});

test("a condition only offers checks something can observe", () => {
  assert.equal(OFFERED_CHECKS.includes("read"), false, "nothing can observe a WhatsApp read");
  for (const key of OFFERED_CHECKS) assert.ok(CHECKS[key], `${key} is offered but has no label`);
});

/* ---------- is a plan ready to send? -------------------------------------- */

test("a starting plan arrives with its copy already written", () => {
  // Worth pinning: a plan whose steps were empty would launch and send a bare connection request.
  assert.deepEqual(blankCopySteps(graphForChannel("li")), []);
});

test("copy cleared in the builder is reported, written copy is not", () => {
  const graph = graphForChannel("li");
  const invite = graph.nodes.find((n) => n.kind === "li_invite");
  invite.data.note = "";
  assert.deepEqual(
    blankCopySteps(graph).map((b) => b.kind),
    ["li_invite"],
  );
  assert.match(blankCopySteps(graph)[0].label, /connection request/);

  // Whitespace is not copy.
  invite.data.note = "   \n ";
  assert.equal(blankCopySteps(graph)[0].kind, "li_invite");
});

test("a step nothing leads to is never reported, because it never runs", () => {
  const graph = graphForChannel("li");
  const invite = graph.nodes.find((n) => n.kind === "li_invite");
  invite.data.note = "";
  graph.edges = graph.edges.filter((e) => e.target !== invite.id);
  assert.equal(
    blankCopySteps(graph).some((b) => b.id === invite.id),
    false,
  );
});

test("steps that carry no words are never reported", () => {
  const graph = graphFromTemplate("blank");
  for (const node of graph.nodes) {
    if (node.kind === "audience") continue;
    assert.deepEqual(blankCopySteps({ ...graph, nodes: [node], edges: [] }), []);
  }
});

test("the copy field matches where each step really stores its words", () => {
  assert.equal(copyField("li_invite"), "note");
  assert.equal(copyField("call"), "notes");
  assert.equal(copyField("email"), "body");
  assert.equal(copyField("li_msg"), "body");
});


/* ---------- a sequence written as a list --------------------------------- */

/** Walks the single chain out of the Audience step, so the test reads the order a lead meets. */
function chain(graph) {
  const onward = new Map(graph.edges.map((e) => [e.source, e.target]));
  const order = [];
  let at = graph.nodes.find((n) => n.kind === "audience");
  while (at) {
    order.push(at);
    const next = onward.get(at.id);
    at = next ? graph.nodes.find((n) => n.id === next) : null;
  }
  return order;
}

test("a written sequence becomes one straight chain, in the order it was written", () => {
  const graph = graphFromSequence([
    { kind: "li_invite", data: { note: "Hello" } },
    { kind: "li_msg", wait: 3, data: { body: "Following up" } },
    { kind: "email", wait: 5, data: { subject: "One more", body: "Last try" } },
  ]);
  assert.deepEqual(
    chain(graph).map((n) => n.kind),
    ["audience", "li_invite", "wait", "li_msg", "wait", "email", "exit"],
  );
  // Every node is on the chain: nothing is orphaned where it would silently never run.
  assert.equal(chain(graph).length, graph.nodes.length);
});

test("the first touch has no wait before it, and a wait of zero adds no step", () => {
  const graph = graphFromSequence([
    { kind: "li_invite", wait: 9, data: { note: "Hi" } },
    { kind: "li_msg", wait: 0, data: { body: "Hi again" } },
  ]);
  assert.deepEqual(
    chain(graph).map((n) => n.kind),
    ["audience", "li_invite", "li_msg", "exit"],
  );
});

test("a sequence carries its own words, including a deliberately blank one", () => {
  const graph = graphFromSequence([
    { kind: "li_invite", data: { note: "" } },
    { kind: "call", wait: 2, data: { notes: "Ask about renewal" } },
  ]);
  const byKind = Object.fromEntries(graph.nodes.map((n) => [n.kind, n.data]));
  assert.equal(byKind.li_invite.note, "");
  assert.equal(byKind.call.notes, "Ask about renewal");
  // A blank note is reported before a launch rather than refused here.
  assert.equal(
    blankCopySteps(graph).some((b) => b.kind === "li_invite"),
    true,
  );
});

test("a sequence starts on the audience it was given", () => {
  const graph = graphFromSequence([{ kind: "li_invite", data: { note: "Hi" } }], "seg_123");
  assert.equal(graph.nodes.find((n) => n.kind === "audience").data.list, "seg_123");
});

test("waits are whole, non-negative days", () => {
  const graph = graphFromSequence([
    { kind: "li_invite", data: { note: "Hi" } },
    { kind: "li_msg", wait: 2.6, data: { body: "a" } },
    { kind: "email", wait: -4, data: { body: "b" } },
  ]);
  const waits = graph.nodes.filter((n) => n.kind === "wait").map((n) => n.data.days);
  assert.deepEqual(waits, [3]);
});

test("an empty sequence is still a valid plan that does nothing", () => {
  assert.deepEqual(
    chain(graphFromSequence([])).map((n) => n.kind),
    ["audience", "exit"],
  );
});

test("a sequence only offers touches the palette offers, and all of them", () => {
  const offered = PALETTE.flatMap(([, kinds]) => kinds).filter((k) => STEPS[k].group === "channel");
  assert.deepEqual([...SEQUENCE_KINDS].sort(), [...offered].sort());
});

test("a step the palette does not offer is dropped rather than quietly built", () => {
  const graph = graphFromSequence([
    { kind: "li_invite", data: { note: "Hi" } },
    { kind: "sms", wait: 1, data: { body: "nope" } },
  ]);
  assert.equal(
    graph.nodes.some((n) => n.kind === "sms"),
    false,
  );
});
