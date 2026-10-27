"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, LayoutTemplate, Minus, Plus, Redo2, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { SENDING_ENABLED } from "@/lib/capabilities";
import {
  defaults,
  issues as findIssues,
  layout,
  makeEdge,
  NODE_H,
  NODE_W,
  nextId,
  PALETTE,
  reserveIds,
  STEPS,
  stepLabel,
  stepStats,
  type AudienceList,
  type FlowEdge,
  type Port,
  type StepChannel,
  type StepData,
  type StepKind,
  type StepNode,
  type WorkflowGraph,
} from "@/lib/app/workflow";
import { connect, freePort, freeSlot, keepInView, removeNode } from "@/lib/ws/graphEdit";
import { SETUP_HREF } from "@/lib/nav";
import type { Channel } from "@/lib/data/types";
import { cn, fmt } from "@/lib/ws/utils";
import { SidebarRail } from "@/components/ws/shell/sidebar";
import { Button } from "@/components/ws/ui/button";
import { EASE_OUT } from "@/components/ws/ui/motion";
import { Switch } from "@/components/ws/ui/misc";
import { Canvas, StepTile, type Selection } from "./canvas";
import { Inspector } from "./inspector";

export type AudienceOption = { value: string; label: string; size: number | null };

type Save = "idle" | "pending" | "saving" | "saved" | "failed";
type Snapshot = { nodes: StepNode[]; edges: FlowEdge[] };

const SAVE_DELAY = 900;
const HISTORY = 60;
const ZOOMS = [0.6, 0.7, 0.8, 0.9, 1, 1.15];

/** The two channels a user can connect today; a step on one without an account can't run. */
const ACCOUNT_OF: Partial<Record<StepChannel, Channel>> = { li: "linkedin", mail: "email" };

/**
 * The strategy builder: the plan as steps you drag, wire and fill in.
 *
 * The palette on the left adds a step (drag it onto the canvas, or click to add it after the
 * selected one), the canvas holds the plan, and the panel on the right edits whatever is selected.
 * Edits save themselves a moment after you stop and once more when you leave. Nothing sends: see
 * lib/capabilities.ts.
 */
export function BuilderView({
  strategyId,
  initialName,
  status,
  graph,
  stored,
  audiences,
}: {
  strategyId: string;
  initialName: string;
  status: "live" | "paused" | "draft";
  graph: WorkflowGraph;
  stored: boolean;
  audiences: AudienceOption[];
}) {
  const still = useReducedMotion();
  const [name, setName] = useState(initialName);
  const [nodes, setNodes] = useState<StepNode[]>(() => keepInView(graph.nodes));
  const [edges, setEdges] = useState<FlowEdge[]>(graph.edges);
  const [skipOther, setSkipOther] = useState(graph.settings.skipOther);
  const [selection, setSelection] = useState<Selection>(null);
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [save, setSave] = useState<Save>(stored ? "idle" : "saving");
  const [depth, setDepth] = useState({ past: 0, future: 0 });

  // Steps added here must not reuse an id the server already handed over.
  useEffect(() => reserveIds(graph.nodes), [graph]);

  /* ---------- what the canvas needs to read the plan ---------- */

  const lists = useMemo<AudienceList[]>(
    () => audiences.map((a) => ({ k: a.value, name: a.label, n: a.size ?? 0, src: "" })),
    [audiences],
  );

  const [accounts, setAccounts] = useState<Channel[] | null>(null);
  useEffect(() => {
    let live = true;
    api
      .accounts()
      .then(({ accounts: rows }) => live && setAccounts([...new Set(rows.map((a) => a.channel as Channel))]))
      .catch(() => live && setAccounts([]));
    return () => {
      live = false;
    };
  }, []);

  const channelOff = useCallback(
    (ch: StepChannel) => {
      const needs = ACCOUNT_OF[ch];
      return accounts !== null && needs !== undefined && !accounts.includes(needs);
    },
    [accounts],
  );

  const problems = useMemo(() => {
    const found = findIssues(nodes, edges, channelOff);
    for (const id of Object.keys(found)) found[id] = found[id].replace(/ is turned off$/, " isn't connected");
    return found;
  }, [nodes, edges, channelOff]);

  const stats = useMemo(() => stepStats(nodes, edges, lists), [nodes, edges, lists]);
  const audienceNode = nodes.find((n) => n.kind === "audience");
  const chosen = lists.find((l) => l.k === audienceNode?.data.list);

  /* ---------- history and autosave ---------- */

  const dirty = useRef(!stored);
  const history = useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
  const typing = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  const current = useRef<Snapshot>({ nodes, edges });
  current.current = { nodes, edges };

  const touch = useCallback(() => {
    dirty.current = true;
    setSave("pending");
  }, []);

  const remember = useCallback(() => {
    const h = history.current;
    h.past.push(structuredClone(current.current));
    if (h.past.length > HISTORY) h.past.shift();
    h.future = [];
    setDepth({ past: h.past.length, future: 0 });
  }, []);

  /** One structural edit: take an undo snapshot, then apply it. */
  const edit = useCallback(
    (next: Snapshot) => {
      remember();
      typing.current = { id: null, at: 0 };
      setNodes(next.nodes);
      setEdges(next.edges);
      touch();
    },
    [remember, touch],
  );

  const undo = useCallback(() => {
    const h = history.current;
    const back = h.past.pop();
    if (!back) return;
    h.future.push(structuredClone(current.current));
    setNodes(back.nodes);
    setEdges(back.edges);
    setSelection(null);
    setDepth({ past: h.past.length, future: h.future.length });
    touch();
  }, [touch]);

  const redo = useCallback(() => {
    const h = history.current;
    const forward = h.future.pop();
    if (!forward) return;
    h.past.push(structuredClone(current.current));
    setNodes(forward.nodes);
    setEdges(forward.edges);
    setSelection(null);
    setDepth({ past: h.past.length, future: h.future.length });
    touch();
  }, [touch]);

  const latest = useRef({ name, nodes, edges, skipOther });
  latest.current = { name, nodes, edges, skipOther };

  const persist = useCallback(async () => {
    const snap = latest.current;
    setSave("saving");
    try {
      await api.saveWorkflow(strategyId, {
        name: snap.name.trim() || "Untitled strategy",
        graph: {
          nodes: snap.nodes,
          edges: snap.edges,
          settings: { ...graph.settings, skipOther: snap.skipOther },
        },
      });
      dirty.current = false;
      setSave("saved");
    } catch {
      setSave("failed");
    }
  }, [graph.settings, strategyId]);

  // Debounced while editing, and flushed when the page goes away so a half-typed edit survives.
  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(() => void persist(), SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [name, nodes, edges, skipOther, persist]);

  useEffect(() => {
    const flush = () => {
      if (dirty.current) void persist();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persist]);

  /* ---------- edits ---------- */

  const say = useCallback((text: string) => setNotice(text), []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(t);
  }, [notice]);

  const selectedNode = selection?.type === "node" ? nodes.find((n) => n.id === selection.id) : undefined;

  function addStep(kind: StepKind, at?: { x: number; y: number }) {
    const parent = selectedNode ?? nodes[nodes.length - 1];
    const spot = freeSlot(
      nodes,
      at?.x ?? parent?.x ?? 40,
      at?.y ?? (parent ? parent.y + 128 : 40),
      NODE_W,
      NODE_H,
    );
    const node: StepNode = { id: nextId(), kind, x: spot.x, y: spot.y, data: defaults(kind) };
    let nextEdges = edges;
    // Clicking a step continues the plan from the selected one (or the last one added); dropping it leaves it for you to wire.
    if (!at && parent) {
      const port = freePort(edges, parent.id, STEPS[parent.kind].ports);
      if (port) nextEdges = [...edges, makeEdge(parent.id, node.id, port as Port)];
    }
    edit({ nodes: [...nodes, node], edges: nextEdges });
    setSelection({ type: "node", id: node.id });
  }

  function wire(source: string, port: Port, target: string) {
    const next = connect(nodes, edges, source, port, target, (s, t, p) => makeEdge(s, t, p as Port));
    if (!next) return say("That connection isn't possible.");
    edit({ nodes, edges: next });
  }

  function link(source: string, port: Port, target: string) {
    if (!target) {
      edit({ nodes, edges: edges.filter((e) => !(e.source === source && e.port === port)) });
      return;
    }
    wire(source, port, target);
  }

  function deleteStep(id: string) {
    const node = nodes.find((n) => n.id === id);
    if (!node || node.kind === "audience") return;
    edit(removeNode(nodes, edges, id));
    setSelection(null);
  }

  function deleteEdge(id: string) {
    edit({ nodes, edges: edges.filter((e) => e.id !== id) });
    setSelection(null);
  }

  function patchStep(id: string, patch: Partial<StepData>) {
    // A run of keystrokes in one field is one undo step.
    const now = Date.now();
    if (typing.current.id !== id || now - typing.current.at > 900) remember();
    typing.current = { id, at: now };
    setNodes((list) => list.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    touch();
  }

  function tidy() {
    edit({ nodes: keepInView(layout(nodes, edges)), edges });
  }

  // Keyboard: delete, undo and redo, unless the user is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        e.preventDefault();
        if (selection.type === "node") deleteStep(selection.id);
        else deleteEdge(selection.id);
      } else if (e.key === "Escape") {
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // deleteStep and deleteEdge close over the current graph, so the listener follows it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, nodes, edges, undo, redo]);

  const moveStart = useCallback(() => remember(), [remember]);
  const moveStep = useCallback(
    (id: string, x: number, y: number) => {
      setNodes((list) => list.map((n) => (n.id === id ? { ...n, x, y } : n)));
      touch();
    },
    [touch],
  );
  const dropStep = useCallback(
    (kind: StepKind, x: number, y: number) => addStep(kind, { x, y }),
    // addStep reads the current graph on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, edges, selectedNode],
  );

  const problemCount = Object.keys(problems).length;
  const steps = nodes.filter((n) => n.kind !== "audience").length;
  const saveLabel: Record<Save, string> = {
    idle: "saved",
    pending: "unsaved changes",
    saving: "saving…",
    saved: "saved",
    failed: "not saved — we'll retry on your next change",
  };
  const selectedEdge = selection?.type === "edge" ? edges.find((e) => e.id === selection.id) : undefined;

  return (
    <div className="flex min-h-dvh lg:h-full lg:min-h-0">
      <SidebarRail />
      <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-chrome px-4 py-[6px]">
          <div className="flex min-w-0 items-center gap-[10px]">
            <Link
              href="/dashboard/strategies"
              aria-label="Back to strategies"
              className="flex size-[28px] shrink-0 items-center justify-center rounded-lg border border-input bg-card hover:bg-accent"
            >
              <ArrowLeft aria-hidden className="size-[14px]" strokeWidth={2} />
            </Link>
            <label htmlFor="strategy-name" className="sr-only">
              Strategy name
            </label>
            <input
              id="strategy-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                touch();
              }}
              className="w-[260px] max-w-full rounded-md border border-transparent bg-transparent px-2 py-[4px] font-mono text-[13px] font-bold tracking-[-0.01em] hover:border-input"
            />
            <span
              className={cn("whitespace-nowrap font-mono text-[11px]", save === "failed" ? "text-warning" : "text-muted-foreground")}
            >
              {status === "draft" ? "Draft" : status === "live" ? "Live" : "Paused"} · {saveLabel[save]}
            </span>
          </div>

          <div className="flex items-center gap-[6px]">
            <Button variant="outline" size="icon" aria-label="Undo" disabled={depth.past === 0} onClick={undo}>
              <Undo2 aria-hidden strokeWidth={1.9} />
            </Button>
            <Button variant="outline" size="icon" aria-label="Redo" disabled={depth.future === 0} onClick={redo}>
              <Redo2 aria-hidden strokeWidth={1.9} />
            </Button>
            <Button variant="outline" size="sm" onClick={tidy} title="Arrange the steps as a tree">
              <LayoutTemplate aria-hidden strokeWidth={1.9} />
              Tidy up
            </Button>
            <span className="flex items-center gap-[2px] rounded-lg border border-input bg-card p-[2px]">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom out"
                disabled={zoom <= ZOOMS[0]}
                onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)])}
              >
                <Minus aria-hidden strokeWidth={2} />
              </Button>
              <span className="w-[38px] text-center font-mono text-[11px]">{Math.round(zoom * 100)}%</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom in"
                disabled={zoom >= ZOOMS[ZOOMS.length - 1]}
                onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)])}
              >
                <Plus aria-hidden strokeWidth={2} />
              </Button>
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[188px_minmax(0,1fr)_292px] lg:grid-rows-1">
          {/* Palette */}
          <aside
            aria-label="Steps you can add"
            className="flex shrink-0 gap-3 overflow-x-auto border-b border-border bg-chrome p-3 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r"
          >
            {PALETTE.map(([group, kinds]) => (
              <div key={group} className="flex shrink-0 flex-col gap-[6px]">
                <h2 className="label-mono">{group}</h2>
                <div className="flex gap-[6px] lg:flex-col">
                  {kinds.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-step", kind);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => addStep(kind)}
                      className="flex shrink-0 cursor-grab items-center gap-2 rounded-lg border border-border bg-card px-2 py-[6px] text-left text-[12px] transition-colors hover:border-input active:cursor-grabbing"
                    >
                      <StepTile kind={kind} size="xs" />
                      <span className="whitespace-nowrap">{STEPS[kind].label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="hidden text-[11px] leading-[1.5] text-muted-foreground lg:block">
              Drag a step onto the canvas, or click one to add it after the selected step. Pull from a dot under a
              step to the next step to connect them.
            </p>
          </aside>

          {/* Canvas */}
          <section className="relative flex min-h-[440px] min-w-0 flex-col lg:min-h-0">
            <Canvas
              nodes={nodes}
              edges={edges}
              stats={stats}
              problems={problems}
              lists={lists}
              selection={selection}
              zoom={zoom}
              onSelect={setSelection}
              onMoveStart={moveStart}
              onMove={moveStep}
              onConnect={wire}
              onDisconnect={deleteEdge}
              onDropStep={dropStep}
              onRefused={say}
            />
            <p className="border-t border-border bg-chrome px-4 py-[6px] text-[11px] text-muted-foreground">
              Figures on the steps are estimates from your audience size, not your results.{" "}
              {SENDING_ENABLED ? "" : "Nothing sends yet."}
            </p>
            <AnimatePresence>
              {notice ? (
                <motion.p
                  role="status"
                  initial={still ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={EASE_OUT}
                  className="absolute bottom-12 left-1/2 -translate-x-1/2 rounded-lg bg-primary px-3 py-[7px] text-[12px] text-primary-foreground"
                >
                  {notice}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </section>

          {/* Settings */}
          <aside
            aria-label="Settings"
            className="min-h-0 shrink-0 overflow-y-auto border-t border-border bg-card lg:border-l lg:border-t-0"
          >
            {selectedNode ? (
              <Inspector
                key={selectedNode.id}
                node={selectedNode}
                nodes={nodes}
                edges={edges}
                lists={lists}
                problem={problems[selectedNode.id]}
                onPatch={patchStep}
                onDelete={deleteStep}
                onLink={link}
              />
            ) : selectedEdge ? (
              <div className="flex flex-col gap-3 px-4 py-4">
                <h2 className="font-mono text-[13px] font-bold">Connection</h2>
                <p className="text-[12px] leading-[1.5] text-muted-foreground">
                  From {STEPS[nodes.find((n) => n.id === selectedEdge.source)?.kind ?? "exit"].label} to{" "}
                  {STEPS[nodes.find((n) => n.id === selectedEdge.target)?.kind ?? "exit"].label}.
                </p>
                <Button variant="danger" onClick={() => deleteEdge(selectedEdge.id)}>
                  <Trash2 aria-hidden strokeWidth={1.8} />
                  Remove the connection
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 px-4 py-4">
                <div>
                  <h2 className="font-mono text-[13px] font-bold">This strategy</h2>
                  <p className="mt-1 text-[12px] leading-[1.5] text-muted-foreground">
                    {steps === 0
                      ? "Nothing in it yet. Add the first step from the left."
                      : `${steps} ${steps === 1 ? "step" : "steps"}${chosen ? `, going to ${chosen.name}${chosen.n ? ` (${fmt(chosen.n)} ${chosen.n === 1 ? "lead" : "leads"})` : ""}` : ""}. Select a step to edit it.`}
                  </p>
                </div>

                <div className="flex items-start justify-between gap-3 border-t border-divider pt-3">
                  <span className="flex flex-col gap-[2px]">
                    <span className="text-[12px] font-medium">Skip anyone already in another strategy</span>
                    <span className="text-[11.5px] text-muted-foreground">
                      A lead is only ever in one sequence, so nobody gets two at once.
                    </span>
                  </span>
                  <Switch
                    checked={skipOther}
                    onChange={(v) => {
                      setSkipOther(v);
                      touch();
                    }}
                    label="Skip anyone already in another strategy"
                  />
                </div>

                {problemCount > 0 ? (
                  <div className="flex flex-col gap-[6px] border-t border-divider pt-3">
                    <h3 className="label-mono">Needs attention · {problemCount}</h3>
                    {nodes
                      .filter((n) => problems[n.id])
                      .map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => setSelection({ type: "node", id: n.id })}
                          className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-surface px-[10px] py-[7px] text-left text-[11.5px] text-warning"
                        >
                          <TriangleAlert aria-hidden className="mt-px size-[12px] shrink-0" strokeWidth={2} />
                          <span>
                            <span className="font-medium">{STEPS[n.kind].label}</span> · {problems[n.id]}
                            <span className="block text-[11px] opacity-80">{stepLabel(n.kind, n.data, lists)}</span>
                          </span>
                        </button>
                      ))}
                    {Object.values(problems).some((p) => /isn't connected/.test(p)) ? (
                      <Link href={SETUP_HREF} className="text-[12px] font-medium underline">
                        Connect an account
                      </Link>
                    ) : null}
                  </div>
                ) : null}

                {!SENDING_ENABLED ? (
                  <p className="rounded-lg bg-accent px-[11px] py-[9px] text-[11.5px] leading-[1.55] text-body">
                    <span className="font-medium">Nothing sends yet.</span> The plan is saved and ready; there is no
                    sender behind it, so turning a strategy on would be a claim we can&apos;t keep.
                  </p>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
