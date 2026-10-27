/**
 * The pure edits behind the drag-and-drop builder: connecting two steps, removing one, finding a
 * free place to drop a new card. Import-free and erasable, so the browser, the build and
 * `node --test` all load it; the shapes are structural so it needs nothing from the workflow model.
 *
 * The model is a tree (see lib/app/workflow.ts `layout`), so a step has at most one parent and a
 * connection that would close a loop is refused rather than stored.
 */

export type EditNode = { id: string; kind: string; x: number; y: number };
export type EditEdge = { id: string; source: string; target: string; port: string };

/** True when `target` already leads (directly or not) to `source`, so source → target would loop. */
export function wouldCycle(edges: EditEdge[], source: string, target: string): boolean {
  if (source === target) return true;
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const id = stack.pop() as string;
    if (id === source) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges) if (e.source === id) stack.push(e.target);
  }
  return false;
}

/** Why a connection can't be made, or null when it can. The reason is what the UI may show. */
export function refuseConnect(
  nodes: EditNode[],
  edges: EditEdge[],
  source: string,
  target: string,
): string | null {
  const to = nodes.find((n) => n.id === target);
  if (!to || !nodes.some((n) => n.id === source)) return "That step no longer exists.";
  if (source === target) return "A step can't lead to itself.";
  if (to.kind === "audience") return "The audience is where the plan starts, so nothing leads into it.";
  if (wouldCycle(edges, source, target)) return "That would loop the plan back on itself.";
  return null;
}

/**
 * Joins `source`'s `port` to `target`. The port's old connection and the target's old parent are
 * dropped first, so wiring a step somewhere new moves it rather than leaving two parents.
 * Returns null when the connection is refused.
 */
export function connect<N extends EditNode, E extends EditEdge>(
  nodes: N[],
  edges: E[],
  source: string,
  port: string,
  target: string,
  make: (source: string, target: string, port: string) => E,
): E[] | null {
  if (refuseConnect(nodes, edges, source, target)) return null;
  const kept = edges.filter((e) => !(e.source === source && e.port === port) && e.target !== target);
  return [...kept, make(source, target, port)];
}

/** Removes a step and every connection that touched it. */
export function removeNode<N extends EditNode, E extends EditEdge>(
  nodes: N[],
  edges: E[],
  id: string,
): { nodes: N[]; edges: E[] } {
  return {
    nodes: nodes.filter((n) => n.id !== id),
    edges: edges.filter((e) => e.source !== id && e.target !== id),
  };
}

/** The first of `ports` that has nothing leaving it yet. */
export function freePort(edges: EditEdge[], id: string, ports: string[]): string | null {
  return ports.find((p) => !edges.some((e) => e.source === id && e.port === p)) ?? null;
}

/**
 * The nearest spot to (x, y) where a card of `w`×`h` doesn't overlap another, searching right and
 * then down in card-sized steps. Positions never go negative.
 */
export function freeSlot(
  nodes: EditNode[],
  x: number,
  y: number,
  w: number,
  h: number,
  gap = 24,
): { x: number; y: number } {
  const overlaps = (px: number, py: number) =>
    nodes.some((n) => px < n.x + w + gap && px + w + gap > n.x && py < n.y + h + gap && py + h + gap > n.y);
  const px = Math.max(0, Math.round(x));
  let py = Math.max(0, Math.round(y));
  for (let row = 0; row < 40; row++) {
    for (let col = 0; col < 12; col++) {
      if (!overlaps(px + col * (w + gap), py)) return { x: px + col * (w + gap), y: py };
    }
    py += h + gap;
  }
  return { x: px, y: py };
}

/**
 * Slides the whole plan right and down so no card sits left of or above `margin`. A tidied tree is
 * centred on the audience, so half of it has negative x, which a scrolling canvas can't show.
 * Cards already clear of the margin are left where they are.
 */
export function keepInView<N extends EditNode>(nodes: N[], margin = 40): N[] {
  if (nodes.length === 0) return nodes;
  const dx = Math.min(...nodes.map((n) => n.x)) < margin ? margin - Math.min(...nodes.map((n) => n.x)) : 0;
  const dy = Math.min(...nodes.map((n) => n.y)) < margin ? margin - Math.min(...nodes.map((n) => n.y)) : 0;
  if (!dx && !dy) return nodes;
  return nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy }));
}
