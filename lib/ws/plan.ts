/**
 * The plan behind a strategy, read as an ordered list of touches.
 *
 * A workflow is stored as a graph (lib/app/workflow.ts) so that branching
 * remains possible. The builder people actually use is a list: who it goes
 * to, what happens in order, how often, when to stop. These helpers are the
 * seam between the two — they read a graph into a list and write a list back
 * into a graph, and they refuse to flatten anything they can't represent.
 */

import {
  defaults,
  edgeId,
  layout,
  nextId,
  STEPS,
  type FlowEdge,
  type StepChannel,
  type StepKind,
  type StepNode,
  type WorkflowGraph,
} from "@/lib/app/workflow";
import type { Channel } from "@/lib/data/types";

/** The channel steps the product can actually run today. SMS and WhatsApp are not offered. */
export const TOUCH_KINDS: StepKind[] = ["li_invite", "li_msg", "email", "call"];

const CHANNEL_OF: Partial<Record<StepKind, Channel>> = {
  li_invite: "linkedin",
  li_msg: "linkedin",
  email: "email",
  wa: "whatsapp",
  call: "call",
  sms: "sms",
};

/** What each touch does, in the words the plan uses. */
export const TOUCH_WHAT: Partial<Record<StepKind, string>> = {
  li_invite: "Send a LinkedIn invite",
  li_msg: "Message them on LinkedIn",
  email: "Send an email",
  wa: "Send a WhatsApp message",
  call: "Call them",
  sms: "Send an SMS",
};

export type Pace = "gentle" | "standard" | "persistent";

/**
 * Days between touches, by pace. The first touch is always day 1; the rest
 * read off this table, repeating the last gap once the plan is longer than it.
 */
export const PACE_GAPS: Record<Pace, number[]> = {
  gentle: [0, 4, 5, 5, 4, 5],
  standard: [0, 2, 3, 3, 3, 3],
  persistent: [0, 2, 2, 2, 2, 2],
};

export type Touch = {
  /** The channel step's node id — stable, so editing one row never disturbs another. */
  id: string;
  kind: StepKind;
  channel: Channel;
  what: string;
  /** Days since the first touch started, 1-based. */
  day: number;
  /** Days waited before this touch. 0 on the first. */
  gap: number;
};

export type Plan = {
  /** The audience node's `list` key: a segment id, or one of the workspace keys. */
  audience: string;
  touches: Touch[];
  /** False when the stored graph branches, which this editor cannot represent. */
  linear: boolean;
};

const isTouch = (kind: StepKind) => Boolean(CHANNEL_OF[kind]);

/**
 * Read a stored graph as a plan.
 *
 * A graph that branches (a condition or an A/B split), or that forks, is
 * reported as `linear: false` with whatever touches were found: the caller
 * shows it read-only rather than silently throwing away the branches.
 */
export function readPlan(graph: WorkflowGraph): Plan {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out = new Map<string, FlowEdge[]>();
  for (const e of graph.edges) {
    const list = out.get(e.source) ?? [];
    list.push(e);
    out.set(e.source, list);
  }

  const root = graph.nodes.find((n) => n.kind === "audience");
  const touches: Touch[] = [];
  let linear = true;
  let day = 1;
  let pending = 0;
  let node: StepNode | undefined = root;
  const seen = new Set<string>();

  while (node) {
    if (seen.has(node.id)) break; // a cycle cannot happen in a validated graph, but never loop
    seen.add(node.id);

    if (node.kind === "wait") pending += Math.max(0, node.data.days ?? 0);
    else if (isTouch(node.kind)) {
      const gap = touches.length === 0 ? 0 : pending;
      day += gap;
      touches.push({
        id: node.id,
        kind: node.kind,
        channel: CHANNEL_OF[node.kind] as Channel,
        what: TOUCH_WHAT[node.kind] ?? STEPS[node.kind].label,
        day,
        gap,
      });
      pending = 0;
    } else if (node.kind !== "audience" && STEPS[node.kind].ports.length > 1) linear = false;

    const next = out.get(node.id) ?? [];
    if (next.length > 1) linear = false;
    const edge: FlowEdge | undefined = next[0];
    node = edge ? byId.get(edge.target) : undefined;
  }

  return { audience: root?.data.list ?? "", touches: touches, linear };
}

/** Which pace a stored plan was built at, so the control opens on the truth. */
export function paceOf(touches: Touch[]): Pace {
  const gaps = touches.slice(1).map((t) => t.gap);
  // Nothing to read a pace from: an empty plan, or one whose gaps were never set.
  if (gaps.length === 0 || gaps.every((g) => g === 0)) return "standard";
  const average = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (average >= 4) return "gentle";
  if (average <= 2) return "persistent";
  return "standard";
}

const gapAt = (pace: Pace, index: number) => {
  const gaps = PACE_GAPS[pace];
  return index === 0 ? 0 : gaps[Math.min(index, gaps.length - 1)];
};

/** Re-date a list of touches at a pace, without touching their order or channels. */
export function repace(touches: Touch[], pace: Pace): Touch[] {
  let day = 1;
  return touches.map((t, i) => {
    const gap = gapAt(pace, i);
    day += gap;
    return { ...t, day, gap };
  });
}

/**
 * Write a plan back into a graph: audience → (wait →) touch → … The settings
 * and any node data already stored for a touch are carried over, so editing
 * the order never rewrites a message.
 */
export function writePlan(graph: WorkflowGraph, plan: { audience: string; touches: Touch[] }): WorkflowGraph {
  const existing = new Map(graph.nodes.map((n) => [n.id, n]));
  const nodes: StepNode[] = [];
  const edges: FlowEdge[] = [];

  const root: StepNode = {
    ...(existing.get(graph.nodes.find((n) => n.kind === "audience")?.id ?? "") ?? {
      id: nextId(),
      kind: "audience",
      x: 0,
      y: 0,
      data: defaults("audience"),
    }),
    kind: "audience",
    data: { ...(existing.get(graph.nodes.find((n) => n.kind === "audience")?.id ?? "")?.data ?? {}), list: plan.audience },
  };
  nodes.push(root);

  let previous = root.id;
  for (const touch of plan.touches) {
    if (touch.gap > 0) {
      const wait: StepNode = { id: nextId(), kind: "wait", x: 0, y: 0, data: { days: touch.gap, biz: true } };
      nodes.push(wait);
      edges.push({ id: edgeId(previous, "out", wait.id), source: previous, target: wait.id, port: "out" });
      previous = wait.id;
    }
    const kept = existing.get(touch.id);
    const step: StepNode = kept
      ? { ...kept, kind: touch.kind }
      : { id: touch.id, kind: touch.kind, x: 0, y: 0, data: defaults(touch.kind) };
    nodes.push(step);
    edges.push({ id: edgeId(previous, "out", step.id), source: previous, target: step.id, port: "out" });
    previous = step.id;
  }

  return { nodes: layout(nodes, edges), edges, settings: graph.settings };
}

/** A new touch, ready to append. */
export function newTouch(kind: StepKind, pace: Pace, index: number): Touch {
  return {
    id: nextId(),
    kind,
    channel: CHANNEL_OF[kind] as Channel,
    what: TOUCH_WHAT[kind] ?? STEPS[kind].label,
    day: 1,
    gap: gapAt(pace, index),
  };
}

/** The channels a plan touches, for the strategy row. */
export function planChannels(touches: Touch[]): Channel[] {
  return [...new Set(touches.map((t) => t.channel))];
}

export type { StepChannel };
