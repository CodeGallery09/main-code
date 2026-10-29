/**
 * The order a plan's steps are walked in, for showing a journey as a list.
 *
 * A plan is a tree (a step has at most one parent), so walking it from the Audience step and
 * taking each step's ports in a fixed order gives one stable top-to-bottom reading. Steps that
 * hang off no path from the root are left out: no lead can ever reach them.
 *
 * Import-free and erasable, so `node --test` can load it directly (see CLAUDE.md).
 */

export type JourneyNode = { id: string; kind: string };
export type JourneyEdge = { source: string; target: string; port: string };

const PORT_ORDER: Record<string, number> = { out: 0, yes: 1, a: 1, no: 2, b: 2 };

/** Step ids in reading order, each with how deep it sits. Cycles cannot occur (the graph is validated) but are guarded anyway. */
export function journeyOrder(nodes: JourneyNode[], edges: JourneyEdge[]): { id: string; depth: number }[] {
  const root = nodes.find((n) => n.kind === "audience") ?? nodes[0];
  if (!root) return [];

  const out = new Map<string, JourneyEdge[]>();
  for (const e of edges) out.set(e.source, [...(out.get(e.source) ?? []), e]);
  for (const list of out.values()) list.sort((a, b) => (PORT_ORDER[a.port] ?? 9) - (PORT_ORDER[b.port] ?? 9));

  const known = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const order: { id: string; depth: number }[] = [];
  const visit = (id: string, depth: number) => {
    if (seen.has(id) || !known.has(id)) return;
    seen.add(id);
    order.push({ id, depth });
    for (const e of out.get(id) ?? []) visit(e.target, depth + 1);
  };
  visit(root.id, 0);
  return order;
}

export type JourneyGraphNode = JourneyNode & { data: Record<string, unknown> };

const KIND_LABEL: Record<string, string> = {
  audience: "Audience enrolled",
  li_invite: "LinkedIn invite",
  li_msg: "LinkedIn message",
  email: "Email",
  wa: "WhatsApp message",
  call: "Call task",
  sms: "SMS",
  wait: "Wait",
  cond: "Condition",
  split: "A/B split",
  goal: "Goal reached",
  exit: "Left the strategy",
};

const CHANNEL_OF: Record<string, "linkedin" | "email" | "call" | "whatsapp" | "sms"> = {
  li_invite: "linkedin",
  li_msg: "linkedin",
  email: "email",
  call: "call",
  wa: "whatsapp",
  sms: "sms",
};

export type JourneyRow = {
  id: string;
  label: string;
  kind: string;
  channel: "linkedin" | "email" | "call" | "whatsapp" | "sms" | null;
  depth: number;
  reached: number;
  here: number;
};

/**
 * One row per reachable step, in reading order. `reachedBy` counts distinct audiences that ran the
 * step; `hereBy` counts audiences waiting on it. The Audience step has no log line of its own, so
 * its reach is everyone enrolled.
 */
export function journeyRows(
  nodes: JourneyGraphNode[],
  edges: JourneyEdge[],
  reachedBy: Map<string, number>,
  hereBy: Map<string, number>,
  enrolled: number,
): JourneyRow[] {
  return journeyOrder(nodes, edges).flatMap(({ id, depth }) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return [];
    const days = typeof node.data.days === "number" ? node.data.days : null;
    const label = node.kind === "wait" && days !== null ? `Wait ${days} ${days === 1 ? "day" : "days"}` : (KIND_LABEL[node.kind] ?? node.kind);
    return [
      {
        id,
        label,
        kind: node.kind,
        channel: CHANNEL_OF[node.kind] ?? null,
        depth,
        reached: node.kind === "audience" ? enrolled : (reachedBy.get(id) ?? 0),
        here: hereBy.get(id) ?? 0,
      },
    ];
  });
}
