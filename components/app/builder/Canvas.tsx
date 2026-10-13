"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Glyph } from "../icons";
import { StepCard } from "./StepCard";
import { CHANNEL } from "@/lib/app/channels";
import {
  NODE_H,
  NODE_W,
  PORT_LABEL,
  STEPS,
  edgePath,
  portX,
  type FlowEdge,
  type Port,
  type StepKind,
  type StepNode,
  type StepStat,
  type AudienceList,
} from "@/lib/app/workflow";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1.6;
/** Steps land on an 8px grid, so hand-dragged cards still line up. */
const GRID = 8;
const DOT_GAP = 22;
const MAP_W = 150;
const MAP_H = 100;

type View = { x: number; y: number; k: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const snap = (v: number) => Math.round(v / GRID) * GRID;

/** Colour a step shows as in the minimap. */
const mapColor = (kind: StepKind) => {
  const ch = STEPS[kind].ch;
  if (ch) return CHANNEL[ch].hex;
  return kind === "audience" ? "#111316" : "#C3CAD3";
};

/** What the builder needs to reach into the canvas for. */
export type CanvasApi = {
  /** The flow coordinate at the middle of the visible pane. */
  center: () => { x: number; y: number };
  fit: () => void;
};

export type CanvasProps = {
  api?: RefObject<CanvasApi | null>;
  nodes: StepNode[];
  edges: FlowEdge[];
  selected: string | null;
  issues: Record<string, string>;
  stats: Record<string, StepStat[]>;
  /** Audiences the workflow can start from, so a card can name its segment. */
  lists: AudienceList[];
  /** The audience the first step is set to, which channel cards read columns from. */
  audienceKey?: string;
  /** Bumped by the parent to re-fit the view, after a tidy. */
  fitKey: number;
  onSelect: (id: string | null) => void;
  /** Called once when a drag starts, so the parent can snapshot for undo. */
  onBeginDrag: () => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onConnect: (source: string, port: Port, target: string) => void;
  onDropStep: (kind: StepKind, x: number, y: number) => void;
  onQuickAdd: (id: string, port: Port, from: HTMLElement) => void;
};

export function Canvas({
  api,
  nodes,
  edges,
  selected,
  issues,
  stats,
  lists,
  audienceKey,
  fitKey,
  onSelect,
  onBeginDrag,
  onMoveNode,
  onConnect,
  onDropStep,
  onQuickAdd,
}: CanvasProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [panning, setPanning] = useState(false);
  const [link, setLink] = useState<{ source: string; port: Port; x: number; y: number } | null>(null);

  // Live copies for the pointer handlers, which must not re-subscribe per frame.
  const viewRef = useRef(view);
  viewRef.current = view;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const heightRef = useRef(heights);
  heightRef.current = heights;

  const heightOf = useCallback((id: string) => heightRef.current[id] ?? NODE_H, []);

  /* ---- measuring ---------------------------------------------------------- */

  const cards = useRef(new Map<string, HTMLElement>());
  useLayoutEffect(() => {
    const read = () => {
      const next: Record<string, number> = {};
      for (const [id, el] of cards.current) next[id] = el.offsetHeight || NODE_H;
      setHeights((prev) => {
        const ids = Object.keys(next);
        const same =
          ids.length === Object.keys(prev).length && ids.every((id) => prev[id] === next[id]);
        return same ? prev : next;
      });
    };
    read();
    const observer = new ResizeObserver(read);
    for (const el of cards.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [nodes]);

  /* ---- coordinates -------------------------------------------------------- */

  const toFlow = useCallback((clientX: number, clientY: number) => {
    const box = wrap.current?.getBoundingClientRect();
    const { x, y, k } = viewRef.current;
    if (!box) return { x: 0, y: 0 };
    return { x: (clientX - box.left - x) / k, y: (clientY - box.top - y) / k };
  }, []);

  const bounds = useCallback(() => {
    const list = nodesRef.current;
    if (!list.length) return null;
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const n of list) {
      x1 = Math.min(x1, n.x);
      y1 = Math.min(y1, n.y);
      x2 = Math.max(x2, n.x + NODE_W);
      y2 = Math.max(y2, n.y + heightOf(n.id));
    }
    return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
  }, [heightOf]);

  const fit = useCallback(() => {
    const box = wrap.current?.getBoundingClientRect();
    const b = bounds();
    if (!box || !b || !box.width) return;
    const narrow = box.width < 820;
    const pad = narrow ? 0.15 : 0.2;
    const maxZoom = narrow ? 0.9 : 1;
    const k = clamp(
      Math.min(box.width / (b.w * (1 + pad * 2)), box.height / (b.h * (1 + pad * 2))),
      MIN_ZOOM,
      maxZoom,
    );
    setView({ k, x: (box.width - b.w * k) / 2 - b.x1 * k, y: (box.height - b.h * k) / 2 - b.y1 * k });
  }, [bounds]);

  // Fit on mount, when the parent asks, and while the pane is still unsized.
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let seen = el.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const next = el.getBoundingClientRect().width;
      if (!seen && next) fit();
      seen = next;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  useEffect(() => {
    if (!api) return;
    api.current = {
      center: () => {
        const box = wrap.current?.getBoundingClientRect();
        const v = viewRef.current;
        if (!box) return { x: 0, y: 0 };
        return { x: (box.width / 2 - v.x) / v.k, y: (box.height / 2 - v.y) / v.k };
      },
      fit,
    };
  }, [api, fit]);

  /* ---- zoom --------------------------------------------------------------- */

  const zoomBy = useCallback((factor: number, cx?: number, cy?: number) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const px = cx ?? box.width / 2;
    const py = cy ?? box.height / 2;
    setView((v) => {
      const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM);
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });
  }, []);

  // Wheel is a non-passive listener, so the page does not scroll with it.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - box.left, e.clientY - box.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  /* ---- dragging ----------------------------------------------------------- */

  /** Finds the step under a point, for dropping a connection on it. */
  const nodeAt = useCallback(
    (fx: number, fy: number) =>
      [...nodesRef.current]
        .reverse()
        .find((n) => fx > n.x && fx < n.x + NODE_W && fy > n.y && fy < n.y + heightOf(n.id)) || null,
    [heightOf],
  );

  const startPan = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const from = { x: e.clientX, y: e.clientY };
    const base = { ...viewRef.current };
    setPanning(true);
    const move = (ev: PointerEvent) => {
      setView({ ...base, x: base.x + (ev.clientX - from.x), y: base.y + (ev.clientY - from.y) });
    };
    const up = () => {
      setPanning(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startNodeDrag = (e: React.PointerEvent, node: StepNode) => {
    if (e.button !== 0) return;
    const handle = (e.target as HTMLElement).closest(".react-flow__handle");
    if (handle) return startLink(e, node, (handle.getAttribute("data-port") || "out") as Port);

    e.stopPropagation();
    onSelect(node.id);
    const from = { x: e.clientX, y: e.clientY };
    const base = { x: node.x, y: node.y };
    let moved = false;
    const move = (ev: PointerEvent) => {
      const k = viewRef.current.k;
      const dx = (ev.clientX - from.x) / k;
      const dy = (ev.clientY - from.y) / k;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      if (!moved) onBeginDrag();
      moved = true;
      onMoveNode(node.id, snap(base.x + dx), snap(base.y + dy));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startLink = (e: React.PointerEvent, node: StepNode, port: Port) => {
    if (!STEPS[node.kind].ports.includes(port)) return;
    e.stopPropagation();
    const at = toFlow(e.clientX, e.clientY);
    setLink({ source: node.id, port, x: at.x, y: at.y });
    const move = (ev: PointerEvent) => {
      const p = toFlow(ev.clientX, ev.clientY);
      setLink((l) => (l ? { ...l, x: p.x, y: p.y } : l));
    };
    const up = (ev: PointerEvent) => {
      const p = toFlow(ev.clientX, ev.clientY);
      const target = nodeAt(p.x, p.y);
      if (target && target.id !== node.id && target.kind !== "audience") {
        onConnect(node.id, port, target.id);
      }
      setLink(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /* ---- minimap ------------------------------------------------------------ */

  const b = bounds();
  const mapScale = b ? Math.min(MAP_W / (b.w + 80), MAP_H / (b.h + 80)) : 1;
  const mapAt = (fx: number, fy: number) =>
    b ? { x: (fx - b.x1 + 40) * mapScale, y: (fy - b.y1 + 40) * mapScale } : { x: 0, y: 0 };

  const jumpTo = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!b) return;
    const box = e.currentTarget.getBoundingClientRect();
    const pane = wrap.current?.getBoundingClientRect();
    if (!pane) return;
    const fx = (e.clientX - box.left) / mapScale + b.x1 - 40;
    const fy = (e.clientY - box.top) / mapScale + b.y1 - 40;
    setView((v) => ({ ...v, x: pane.width / 2 - fx * v.k, y: pane.height / 2 - fy * v.k }));
  };

  const pane = wrap.current?.getBoundingClientRect();
  const windowBox = b &&
    pane && {
      ...mapAt(-view.x / view.k, -view.y / view.k),
      w: (pane.width / view.k) * mapScale,
      h: (pane.height / view.k) * mapScale,
    };

  /* ---- render ------------------------------------------------------------- */

  const taken = (id: string, port: Port) => edges.some((e) => e.source === id && e.port === port);
  const byId = (id: string) => nodes.find((n) => n.id === id);

  return (
    <div
      className="react-flow"
      ref={wrap}
      role="application"
      aria-label="Workflow canvas"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const kind = e.dataTransfer.getData("application/fp") as StepKind;
        if (!kind || !STEPS[kind]) return;
        const at = toFlow(e.clientX, e.clientY);
        onDropStep(kind, snap(at.x - NODE_W / 2), snap(at.y - 30));
      }}
    >
      <div
        className="rf-dots"
        aria-hidden="true"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(22,30,42,.22) ${Math.max(
            0.6,
            0.7 * view.k,
          )}px, transparent ${Math.max(0.6, 0.7 * view.k) + 0.6}px)`,
          backgroundSize: `${DOT_GAP * view.k}px ${DOT_GAP * view.k}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      />

      <div
        className={"react-flow__pane" + (panning ? " dragging" : "")}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          onSelect(null);
          startPan(e);
        }}
      >
        <div
          className="react-flow__viewport"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          <svg className="react-flow__edges" aria-hidden="true">
            <defs>
              <marker
                id="fp-arrow"
                markerWidth="16"
                markerHeight="16"
                viewBox="-10 -10 20 20"
                markerUnits="strokeWidth"
                orient="auto-start-reverse"
                refX="0"
                refY="0"
              >
                <polyline
                  points="-5,-4 0,0 -5,4 -5,-4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ strokeWidth: 1, stroke: "#AEB6C1", fill: "#AEB6C1" }}
                />
              </marker>
            </defs>

            {edges.map((edge) => {
              const source = byId(edge.source);
              const target = byId(edge.target);
              if (!source || !target) return null;
              const sx = portX(source, edge.port);
              const sy = source.y + heightOf(source.id);
              const tx = target.x + NODE_W / 2;
              const ty = target.y;
              const label = PORT_LABEL[edge.port];
              const lw = label.length * 7 + 12;
              return (
                <g className="react-flow__edge" key={edge.id}>
                  <path
                    className="react-flow__edge-path"
                    d={edgePath(sx, sy, tx, ty)}
                    fill="none"
                    markerEnd="url(#fp-arrow)"
                  />
                  {label && (
                    <>
                      <rect
                        className="react-flow__edge-textbg"
                        x={(sx + tx) / 2 - lw / 2}
                        y={(sy + ty) / 2 - 10}
                        width={lw}
                        height={20}
                        rx={6}
                      />
                      <text
                        className="react-flow__edge-text"
                        x={(sx + tx) / 2}
                        y={(sy + ty) / 2 + 4}
                        textAnchor="middle"
                      >
                        {label}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {link &&
              (() => {
                const source = byId(link.source);
                if (!source) return null;
                return (
                  <path
                    className="react-flow__connection-path"
                    fill="none"
                    d={edgePath(portX(source, link.port), source.y + heightOf(source.id), link.x, link.y)}
                  />
                );
              })()}
          </svg>

          {nodes.map((node) => (
            <div
              key={node.id}
              className={"react-flow__node" + (selected === node.id ? " selected" : "")}
              style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
              ref={(el) => {
                if (el) cards.current.set(node.id, el);
                else cards.current.delete(node.id);
              }}
              onPointerDown={(e) => startNodeDrag(e, node)}
            >
              <StepCard
                node={node}
                stats={stats[node.id]}
                lists={lists}
                audienceKey={audienceKey}
                issue={issues[node.id]}
                lonely={nodes.length <= 1}
                taken={(port) => taken(node.id, port)}
                onQuickAdd={(port, from) => onQuickAdd(node.id, port, from)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="react-flow__panel react-flow__controls vertical bottom right" aria-label="Zoom">
        <button
          type="button"
          className="react-flow__controls-button"
          title="Zoom in"
          aria-label="Zoom in"
          onClick={() => zoomBy(1.2)}
        >
          <Glyph n="plus" style={{ fill: "none" }} />
        </button>
        <button
          type="button"
          className="react-flow__controls-button"
          title="Zoom out"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.2)}
        >
          <Glyph n="minus" style={{ fill: "none" }} />
        </button>
        <button
          type="button"
          className="react-flow__controls-button"
          title="Fit view"
          aria-label="Fit view"
          onClick={fit}
        >
          <Glyph n="fit" style={{ fill: "none" }} />
        </button>
      </div>

      <div
        className="react-flow__panel react-flow__minimap top right"
        style={{ width: MAP_W, height: MAP_H }}
        onPointerDown={jumpTo}
        aria-hidden="true"
      >
        <svg width={MAP_W} height={MAP_H}>
          {nodes.map((node) => {
            const p = mapAt(node.x, node.y);
            return (
              <rect
                key={node.id}
                x={p.x}
                y={p.y}
                width={NODE_W * mapScale}
                height={heightOf(node.id) * mapScale}
                rx={2}
                fill={mapColor(node.kind)}
                opacity={0.85}
              />
            );
          })}
          {windowBox && (
            <rect
              x={windowBox.x}
              y={windowBox.y}
              width={windowBox.w}
              height={windowBox.h}
              fill="none"
              stroke="rgba(17,19,22,.4)"
              strokeWidth={1}
              rx={3}
            />
          )}
        </svg>
      </div>

    </div>
  );
}
