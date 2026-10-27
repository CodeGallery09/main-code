"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, Flag, GitBranch, LogOut, Split, TriangleAlert, Users, X } from "lucide-react";
import {
  edgePath,
  NODE_H,
  NODE_W,
  PORT_LABEL,
  portX,
  STEPS,
  stepLabel,
  type AudienceList,
  type FlowEdge,
  type Port,
  type StepKind,
  type StepNode,
  type StepStat,
} from "@/lib/app/workflow";
import { refuseConnect } from "@/lib/ws/graphEdit";
import type { Channel } from "@/lib/data/types";
import { cn } from "@/lib/ws/utils";
import { ChannelTile } from "@/components/ws/ui/channel-tile";

/** Which workspace channel a sending step belongs to, for its tile. */
const CHANNEL_OF: Record<string, Channel> = { li: "linkedin", mail: "email", wa: "whatsapp", call: "call", sms: "sms" };

const LOGIC_ICON: Partial<Record<StepKind, typeof Clock>> = {
  audience: Users,
  wait: Clock,
  cond: GitBranch,
  split: Split,
  goal: Flag,
  exit: LogOut,
};

/** The tile on a step's card and in the palette: the channel's own colour, or a neutral glyph. */
export function StepTile({ kind, size = "md" }: { kind: StepKind; size?: "xs" | "sm" | "md" }) {
  const ch = STEPS[kind].ch;
  if (ch) return <ChannelTile channel={CHANNEL_OF[ch]} size={size} />;
  const Icon = LOGIC_ICON[kind] ?? Flag;
  const box = size === "xs" ? "size-[22px]" : size === "sm" ? "size-[26px]" : "size-[32px]";
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-lg bg-muted text-body", box)}>
      <Icon className="size-[14px]" strokeWidth={1.8} />
    </span>
  );
}

/** Where the drag started: a card to move, or a socket to wire from. */
type Wiring = { source: string; port: Port; x: number; y: number };

export type Selection = { type: "node"; id: string } | { type: "edge"; id: string } | null;

const PAD = 160;

/**
 * The plan as a canvas: cards you can drag, sockets you can wire, and a drop target for steps
 * dragged in from the palette. Everything it changes goes up through the callbacks, so the owner
 * holds the one copy of the graph (and its undo history).
 *
 * Positions are in graph coordinates; `zoom` only scales how they are drawn, so pointer positions
 * are divided by it on the way in.
 */
export function Canvas({
  nodes,
  edges,
  stats,
  problems,
  lists,
  selection,
  zoom,
  readOnly,
  onSelect,
  onMoveStart,
  onMove,
  onConnect,
  onDisconnect,
  onDropStep,
  onRefused,
}: {
  nodes: StepNode[];
  edges: FlowEdge[];
  stats: Record<string, StepStat[]>;
  problems: Record<string, string>;
  lists: AudienceList[];
  selection: Selection;
  zoom: number;
  readOnly?: boolean;
  onSelect: (selection: Selection) => void;
  /** Called once when a card starts to move, so the owner can take an undo snapshot. */
  onMoveStart: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (source: string, port: Port, target: string) => void;
  onDisconnect: (edgeId: string) => void;
  onDropStep: (kind: StepKind, x: number, y: number) => void;
  onRefused: (reason: string) => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const [wiring, setWiring] = useState<Wiring | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const width = Math.max(900, ...nodes.map((n) => n.x + NODE_W)) + PAD;
  const height = Math.max(560, ...nodes.map((n) => n.y + NODE_H)) + PAD;

  /** Pointer position in graph coordinates. */
  const toGraph = useCallback(
    (clientX: number, clientY: number) => {
      const box = surface.current?.getBoundingClientRect();
      if (!box) return { x: 0, y: 0 };
      return { x: (clientX - box.left) / zoom, y: (clientY - box.top) / zoom };
    },
    [zoom],
  );

  /* ---------- moving a card ---------- */

  const drag = useRef<{ id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);

  function startMove(e: React.PointerEvent, node: StepNode) {
    if (e.button !== 0) return;
    onSelect({ type: "node", id: node.id });
    if (readOnly) return;
    const at = toGraph(e.clientX, e.clientY);
    drag.current = { id: node.id, dx: at.x - node.x, dy: at.y - node.y, sx: e.clientX, sy: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveCard(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
      d.moved = true;
      onMoveStart();
    }
    const at = toGraph(e.clientX, e.clientY);
    onMove(d.id, Math.max(0, Math.round(at.x - d.dx)), Math.max(0, Math.round(at.y - d.dy)));
  }

  function endMove() {
    drag.current = null;
  }

  /* ---------- wiring two steps ---------- */

  function startWire(e: React.PointerEvent, node: StepNode, port: Port) {
    if (e.button !== 0 || readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    const at = toGraph(e.clientX, e.clientY);
    setWiring({ source: node.id, port, x: at.x, y: at.y });
  }

  useEffect(() => {
    if (!wiring) return;
    const move = (e: PointerEvent) => {
      const at = toGraph(e.clientX, e.clientY);
      setWiring((w) => (w ? { ...w, x: at.x, y: at.y } : w));
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-step]");
      setHover(over?.dataset.step ?? null);
    };
    const up = (e: PointerEvent) => {
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-step]");
      const target = over?.dataset.step;
      if (target && target !== wiring.source) {
        const why = refuseConnect(nodes, edges, wiring.source, target);
        if (why) onRefused(why);
        else onConnect(wiring.source, wiring.port, target);
      }
      setWiring(null);
      setHover(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [wiring, toGraph, nodes, edges, onConnect, onRefused]);

  /* ---------- dropping a step from the palette ---------- */

  function drop(e: React.DragEvent) {
    const kind = e.dataTransfer.getData("application/x-step") as StepKind;
    if (!kind || !STEPS[kind] || readOnly) return;
    e.preventDefault();
    const at = toGraph(e.clientX, e.clientY);
    onDropStep(kind, Math.max(0, Math.round(at.x - NODE_W / 2)), Math.max(0, Math.round(at.y - NODE_H / 2)));
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const live = wiring ? byId.get(wiring.source) : undefined;

  return (
    <div
      className="relative min-h-0 flex-1 overflow-auto bg-background"
      onClick={() => onSelect(null)}
      aria-label="The plan canvas"
    >
      <div style={{ width: width * zoom, height: height * zoom }}>
        <div
          ref={surface}
          className="relative origin-top-left"
          style={{ width, height, transform: `scale(${zoom})` }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={drop}
        >
          <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
            <defs>
              <marker id="wf-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M1 1L6 4L1 7" fill="none" stroke="#b9b5ab" strokeWidth="1.4" strokeLinecap="round" />
              </marker>
            </defs>
            {edges.map((edge) => {
              const from = byId.get(edge.source);
              const to = byId.get(edge.target);
              if (!from || !to) return null;
              const d = edgePath(portX(from, edge.port), from.y + NODE_H, to.x + NODE_W / 2, to.y);
              const on = selection?.type === "edge" && selection.id === edge.id;
              return (
                <g key={edge.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={on ? "var(--primary)" : "#b9b5ab"}
                    strokeWidth={on ? 2 : 1.5}
                    markerEnd="url(#wf-arrow)"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    className="cursor-pointer"
                    style={{ pointerEvents: "stroke" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect({ type: "edge", id: edge.id });
                    }}
                  />
                </g>
              );
            })}
            {live && wiring ? (
              <path
                d={edgePath(portX(live, wiring.port), live.y + NODE_H, wiring.x, wiring.y)}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={1.6}
                strokeDasharray="5 4"
              />
            ) : null}
          </svg>

          {selection?.type === "edge"
            ? (() => {
                const edge = edges.find((x) => x.id === selection.id);
                const from = edge && byId.get(edge.source);
                const to = edge && byId.get(edge.target);
                if (!edge || !from || !to) return null;
                const mx = (portX(from, edge.port) + to.x + NODE_W / 2) / 2;
                const my = (from.y + NODE_H + to.y) / 2;
                return (
                  <button
                    type="button"
                    aria-label="Remove this connection"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisconnect(edge.id);
                    }}
                    className="absolute flex size-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-input bg-card text-destructive hover:bg-destructive-bg"
                    style={{ left: mx, top: my }}
                  >
                    <X aria-hidden className="size-[12px]" strokeWidth={2.2} />
                  </button>
                );
              })()
            : null}

          {nodes.map((node) => {
            const step = STEPS[node.kind];
            const on = selection?.type === "node" && selection.id === node.id;
            const problem = problems[node.id];
            const figures = stats[node.id];
            const target = wiring && hover === node.id && !refuseConnect(nodes, edges, wiring.source, node.id);
            return (
              <div
                key={node.id}
                data-step={node.id}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`${step.label}: ${stepLabel(node.kind, node.data, lists)}${problem ? `. ${problem}` : ""}`}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect({ type: "node", id: node.id });
                  }
                }}
                onPointerDown={(e) => startMove(e, node)}
                onPointerMove={moveCard}
                onPointerUp={endMove}
                onPointerCancel={endMove}
                className={cn(
                  "absolute flex touch-none select-none flex-col justify-between rounded-xl border bg-card px-3 py-[9px]",
                  readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
                  on ? "border-2 border-primary" : problem ? "border-warning-border bg-warning-surface" : "border-border",
                  target && "ring-2 ring-primary ring-offset-2",
                )}
                style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
              >
                <span className="flex items-center gap-[9px]">
                  <StepTile kind={node.kind} size="sm" />
                  <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                    <span className="truncate text-[12px] font-semibold">{step.label}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {stepLabel(node.kind, node.data, lists)}
                    </span>
                  </span>
                </span>
                <span className="flex min-h-[16px] items-center gap-3 font-mono text-[10.5px] text-muted-foreground">
                  {problem ? (
                    <span className="flex min-w-0 items-center gap-[5px] text-warning">
                      <TriangleAlert aria-hidden className="size-[11px] shrink-0" strokeWidth={2} />
                      <span className="truncate">{problem}</span>
                    </span>
                  ) : (
                    figures?.map(([value, label]) => (
                      <span key={label}>
                        {value} {label}
                      </span>
                    ))
                  )}
                </span>

                {node.kind !== "audience" ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -top-[5px] left-1/2 size-[10px] -translate-x-1/2 rounded-full border-2 bg-card",
                      target ? "border-primary bg-primary" : "border-input",
                    )}
                  />
                ) : null}

                {step.ports.map((port) => {
                  const taken = edges.some((e) => e.source === node.id && e.port === port);
                  return (
                    <button
                      key={port}
                      type="button"
                      disabled={readOnly}
                      aria-label={`Connect ${step.label}${PORT_LABEL[port] ? ` (${PORT_LABEL[port]})` : ""} to another step`}
                      onPointerDown={(e) => startWire(e, node, port)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute -bottom-[9px] flex -translate-x-1/2 cursor-crosshair touch-none items-center gap-[3px]"
                      style={{ left: portX(node, port) - node.x }}
                    >
                      {PORT_LABEL[port] ? (
                        <span className="rounded bg-card px-[4px] font-mono text-[9.5px] font-medium text-muted-foreground">
                          {PORT_LABEL[port]}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "size-[12px] rounded-full border-2 bg-card transition-colors hover:border-primary hover:bg-primary",
                          taken ? "border-primary" : "border-input",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
