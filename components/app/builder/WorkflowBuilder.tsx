"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackIcon, Glyph, SettingsIcon } from "../icons";
import { Canvas, type CanvasApi } from "./Canvas";
import { Inspector, WorkflowSettings } from "./Inspector";
import { StepChip } from "./StepCard";
import { CHANNEL } from "@/lib/app/channels";
import {
  LISTS,
  type AudienceList,
  NODE_W,
  PALETTE,
  STEPS,
  defaults,
  issues as findIssues,
  layout,
  makeEdge,
  nextId,
  reserveIds,
  stepStats,
  toGraph,
  AUDIENCE_CAMPAIGN,
  AUDIENCE_WORKSPACE,
  type FlowEdge,
  type Port,
  type StepChannel,
  type StepData,
  type StepKind,
  type StepNode,
  type Workflow,
} from "@/lib/app/workflow";
import { api, fieldErrorsOf } from "@/lib/api";
import { SENDING_ENABLED, SENDING_OFF_NOTE } from "@/lib/capabilities";
import { onSegmentSaved } from "@/lib/app/segments";
import type { Segment } from "@/lib/leads/segments";

const CAMPAIGNS_HREF = "/dashboard/campaigns";

/** How long the editor waits after the last change before saving. */
const AUTOSAVE_MS = 800;

type SaveState = "saved" | "dirty" | "saving" | "error";

/**
 * A saved segment as an audience: its size is the reachable count the upload
 * summary reported, and each channel keeps the column it was mapped to.
 */
function asAudience(segment: Segment): AudienceList {
  const reach: AudienceList["reach"] = {};
  const columns: AudienceList["columns"] = {};
  for (const channel of segment.channels) {
    reach[channel.attribute] = channel.reachable;
    if (channel.column) columns[channel.attribute] = channel.column;
  }
  return { k: segment.id, name: segment.name, n: segment.reachableRows, src: "Uploaded file", reach, columns };
}

const STATUS_TAG = {
  live: ["pos", "Live"],
  paused: ["hl", "Paused"],
  draft: ["", "Draft"],
} as const;

type Panel = { type: "node"; id: string } | { type: "settings" } | null;
type Toast = { id: number; text: string; undo?: () => void };
type Snapshot = { nodes: StepNode[]; edges: FlowEdge[] };

/**
 * The campaign builder: a workflow on a pannable canvas, with the step palette
 * on the left and the settings for the selected step on the right.
 *
 * Edits save themselves to the campaign's stored workflow a moment after you stop typing, and once
 * more when you leave. Nothing sends: see lib/capabilities.ts.
 */
export function WorkflowBuilder({
  workflow,
  stored,
  isSample = false,
  campaigns,
  channelsOff = [],
}: {
  workflow: Workflow;
  /** False when the campaign has no workflow row yet, so the starting graph is saved on mount. */
  stored: boolean;
  isSample?: boolean;
  /** The workspace's multichannel campaigns, for the switcher. */
  campaigns: { id: string; name: string }[];
  channelsOff?: StepChannel[];
}) {
  const campaignId = String(workflow.id);
  const router = useRouter();
  const [meta, setMeta] = useState<Workflow>(workflow);
  const [nodes, setNodes] = useState<StepNode[]>(workflow.nodes);
  const [edges, setEdges] = useState<FlowEdge[]>(workflow.edges);

  const [panel, setPanel] = useState<Panel>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menu, setMenu] = useState<{ id: string; port: Port; x: number; y: number } | null>(null);
  const [launching, setLaunching] = useState(false);
  const [save, setSave] = useState<SaveState>(stored ? "saved" : "dirty");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const canvas = useRef<CanvasApi | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const history = useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  /** The last step edited, so a run of keystrokes is one undo step. */
  const typing = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });

  // Steps added here must not reuse an id the server already handed over.
  useEffect(() => reserveIds(workflow.nodes), [workflow]);

  const channelOff = useCallback((ch: StepChannel) => channelsOff.includes(ch), [channelsOff]);

  /**
   * Audiences the first step can start from: segments uploaded from a file,
   * then the demo lists. A segment's size is its reachable count, not its row
   * count, and it carries the column each channel reads.
   */
  const [uploaded, setUploaded] = useState<AudienceList[]>([]);
  const loadSegments = useCallback(() => {
    api
      .segments()
      .then(({ segments }) => setUploaded(segments.map(asAudience)))
      .catch(() => setUploaded([]));
  }, []);
  useEffect(() => {
    loadSegments();
    return onSegmentSaved(() => loadSegments());
  }, [loadSegments]);

  // The workspace's own leads, counted live: the campaign's, and all of them.
  const [counts, setCounts] = useState<{ campaign: number; workspace: number } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([api.leads({ campaignId, pageSize: 1 }), api.leads({ pageSize: 1 })])
      .then(([inCampaign, all]) => live && setCounts({ campaign: inCampaign.total, workspace: all.total }))
      .catch(() => live && setCounts(null));
    return () => {
      live = false;
    };
  }, [campaignId]);

  const lists = useMemo<AudienceList[]>(
    () => [
      { k: AUDIENCE_CAMPAIGN, name: "Leads in this campaign", n: counts?.campaign ?? 0, src: "This campaign" },
      { k: AUDIENCE_WORKSPACE, name: "All leads", n: counts?.workspace ?? 0, src: "Workspace" },
      ...uploaded,
      // The demo lists are invented, so say so wherever one is picked.
      ...LISTS.map((l) => ({ ...l, name: `${l.name} (demo)` })),
    ],
    [uploaded, counts],
  );

  const toast = useCallback((text: string, undo?: () => void) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, undo }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4000);
  }, []);

  /* ---- history ------------------------------------------------------------ */

  const mark = useCallback(() => {
    const h = history.current;
    h.past = [...h.past.slice(-40), { nodes, edges }];
    h.future = [];
    setDepth({ past: h.past.length, future: 0 });
  }, [nodes, edges]);

  const undo = useCallback(() => {
    const h = history.current;
    const last = h.past[h.past.length - 1];
    if (!last) return;
    h.future = [{ nodes, edges }, ...h.future];
    h.past = h.past.slice(0, -1);
    setNodes(last.nodes);
    setEdges(last.edges);
    setDepth({ past: h.past.length, future: h.future.length });
  }, [nodes, edges]);

  const redo = useCallback(() => {
    const h = history.current;
    const next = h.future[0];
    if (!next) return;
    h.past = [...h.past, { nodes, edges }];
    h.future = h.future.slice(1);
    setNodes(next.nodes);
    setEdges(next.edges);
    setDepth({ past: h.past.length, future: h.future.length });
  }, [nodes, edges]);

  /* ---- keyboard ----------------------------------------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.matches?.("input,textarea,select")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.key === "Backspace" || e.key === "Delete") && selected) {
        const node = nodes.find((n) => n.id === selected);
        if (!node || node.kind === "audience") return;
        e.preventDefault();
        removeStep(selected);
      }
      if (e.key === "Escape") {
        setMenu(null);
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, selected, nodes]);

  /* ---- the save indicator -------------------------------------------------- */

  // The newest content, read by the save so a slow request never sends stale steps.
  const latest = useRef({ name: meta.name, graph: toGraph({ ...meta, nodes, edges }) });
  latest.current = {
    name: meta.name.trim() || "Untitled workflow",
    graph: toGraph({ ...meta, nodes, edges }),
  };
  const inflight = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    dirty.current = false;
    setSave("saving");
    const sent = latest.current;
    try {
      await api.saveWorkflow(campaignId, sent);
      savedFp.current = JSON.stringify(sent);
      setSaveError(null);
    } catch (caught) {
      dirty.current = true;
      const fields = fieldErrorsOf(caught);
      setSaveError(fields ? Object.values(fields)[0] : caught instanceof Error ? caught.message : "Could not save.");
      inflight.current = false;
      setSave("error");
      return;
    }
    inflight.current = false;
    if (again.current) {
      again.current = false;
      void flush();
    } else setSave(dirty.current ? "dirty" : "saved");
  }, [campaignId]);

  // What the server last accepted, so an unchanged graph (the first render, or Strict Mode's second
  // one) never triggers a save. Null means the campaign has no workflow row yet.
  const savedFp = useRef<string | null>(stored ? JSON.stringify(latest.current) : null);

  useEffect(() => {
    if (JSON.stringify(latest.current) === savedFp.current) return;
    dirty.current = true;
    setSave((s) => (s === "saving" ? s : "dirty"));
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [nodes, edges, meta.name, meta.days, meta.from, meta.to, meta.daily, meta.skipOther, flush]);

  // Leaving the page (a link, a reload, closing the tab) must not drop the last few edits.
  useEffect(() => {
    const send = () => {
      if (!dirty.current || inflight.current) return;
      dirty.current = false;
      savedFp.current = JSON.stringify(latest.current);
      void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/workflow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(latest.current),
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", send);
    return () => {
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [campaignId]);

  /* ---- derived ------------------------------------------------------------ */

  const issues = useMemo(() => findIssues(nodes, edges, channelOff), [nodes, edges, channelOff]);
  const issueCount = Object.keys(issues).length;

  // A step waiting for its next step is only worth flagging once you ask.
  const shown = useMemo(
    () => Object.fromEntries(Object.entries(issues).filter(([, text]) => showAll || text !== "Next step missing")),
    [issues, showAll],
  );

  const stats = useMemo(
    () => (meta.status === "draft" ? {} : stepStats(nodes, edges, lists)),
    [nodes, edges, meta.status, lists],
  );

  const allowed = (kind: StepKind) => {
    const ch = STEPS[kind].ch;
    return !ch || !channelOff(ch);
  };

  /* ---- editing ------------------------------------------------------------ */

  /** Nudges a new step sideways until it is not sitting on another one. */
  const freeSpot = (at: { x: number; y: number }) => {
    let { x } = at;
    const { y } = at;
    for (let i = 0; i < 12; i++) {
      if (!nodes.some((n) => Math.abs(n.x - x) < NODE_W * 0.8 && Math.abs(n.y - y) < 80)) break;
      x += NODE_W + 40;
    }
    return { x, y };
  };

  const addStep = (
    kind: StepKind,
    at: { x: number; y: number },
    after?: { id: string; port: Port },
    data?: StepData,
  ) => {
    mark();
    const id = nextId();
    const spot = freeSpot(at);
    setNodes((list) => [...list, { id, kind, x: spot.x, y: spot.y, data: { ...defaults(kind), ...data } }]);
    if (after) setEdges((list) => [...list, makeEdge(after.id, id, after.port)]);
    setSelected(id);
    setPanel({ type: "node", id });
    typing.current = { id, at: Date.now() };
    return id;
  };

  const addAfter = (id: string, port: Port, kind: StepKind) => {
    const parent = nodes.find((n) => n.id === id);
    if (!parent) return;
    const offset = port === "yes" || port === "a" ? -150 : port === "no" || port === "b" ? 150 : 0;
    addStep(kind, { x: parent.x + offset, y: parent.y + 150 }, { id, port });
  };

  /** The first socket on a step that nothing leads out of yet. */
  const freePort = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return null;
    return STEPS[node.kind].ports.find((p) => !edges.some((e) => e.source === id && e.port === p)) || null;
  };

  /** Clicking the palette attaches to the selection, or drops in the middle. */
  const pickStep = (kind: StepKind) => {
    if (!allowed(kind)) return;
    const port = selected ? freePort(selected) : null;
    if (selected && port) addAfter(selected, port, kind);
    else {
      const at = canvas.current?.center() || { x: 0, y: 0 };
      addStep(kind, { x: at.x - NODE_W / 2, y: at.y - 30 });
    }
    setPaletteOpen(false);
  };

  /** A dropped step snaps onto the nearest free socket above it. */
  const dropStep = (kind: StepKind, x: number, y: number) => {
    const near: { id: string; port: Port; dist: number }[] = [];
    for (const node of nodes) {
      const ports = STEPS[node.kind].ports;
      ports.forEach((port, i) => {
        if (edges.some((e) => e.source === node.id && e.port === port)) return;
        const px = node.x + NODE_W * (ports.length === 2 ? (i ? 0.75 : 0.25) : 0.5);
        const py = node.y + 60;
        const dx = x + NODE_W / 2 - px;
        const dy = y - py;
        if (Math.abs(dx) > 160 || dy < -10 || dy > 200) return;
        near.push({ id: node.id, port, dist: Math.hypot(dx, dy) });
      });
    }
    near.sort((a, b) => a.dist - b.dist);
    addStep(kind, { x, y }, near[0] && { id: near[0].id, port: near[0].port });
  };

  const patchStep = (id: string, patch: StepData) => {
    const now = Date.now();
    if (typing.current.id !== id || now - typing.current.at > 2000) mark();
    typing.current = { id, at: now };
    setNodes((list) => list.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  };

  const removeStep = (id: string) => {
    const before = { nodes, edges };
    mark();
    setNodes((list) => list.filter((n) => n.id !== id));
    setEdges((list) => list.filter((e) => e.source !== id && e.target !== id));
    setSelected(null);
    setPanel(null);
    toast("Step deleted", () => {
      setNodes(before.nodes);
      setEdges(before.edges);
    });
  };

  const duplicateStep = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    addStep(node.kind, { x: node.x + 40, y: node.y + 40 }, undefined, node.data);
  };

  /** One socket leads to one step, so a new connection replaces the old one. */
  const connect = (source: string, port: Port, target: string) => {
    mark();
    setEdges((list) => [
      ...list.filter((e) => !(e.source === source && e.port === port)),
      makeEdge(source, target, port),
    ]);
  };

  const moveNode = (id: string, x: number, y: number) =>
    setNodes((list) => list.map((n) => (n.id === id ? { ...n, x, y } : n)));

  const tidy = () => {
    mark();
    setNodes(layout(nodes, edges));
    setFitKey((k) => k + 1);
  };

  const fixFirst = () => {
    const first = Object.keys(issues)[0];
    if (!first) return;
    setShowAll(true);
    setSelected(first);
    setPanel({ type: "node", id: first });
  };

  /* ---- the step menu under a `+` ------------------------------------------ */

  const openMenu = (id: string, port: Port, from: HTMLElement) => {
    const box = from.getBoundingClientRect();
    const area = shell.current?.getBoundingClientRect();
    if (!area) return;
    const x = Math.min(Math.max(8, box.left - area.left - 150), area.width - 308);
    const below = box.bottom - area.top + 8;
    setMenu({ id, port, x, y: below + 300 > area.height ? Math.max(8, box.top - area.top - 308) : below });
  };

  /* ---- render ------------------------------------------------------------- */

  const step = panel?.type === "node" ? nodes.find((n) => n.id === panel.id) : null;
  const [tone, label] = STATUS_TAG[meta.status];
  const audience = nodes.find((n) => n.kind === "audience");
  const list = audience && lists.find((l) => l.k === audience.data.list);

  return (
    <div className="builder">
      <div className="bh">
        <Link className="ib" href={CAMPAIGNS_HREF} aria-label="Back to campaigns">
          <BackIcon />
        </Link>
        <select
          className="sel pill hide-s"
          aria-label="Switch campaign"
          value={campaignId}
          onChange={(e) => router.push(`/dashboard/workflows/${e.target.value}`)}
        >
          {!campaigns.some((c) => c.id === campaignId) && <option value={campaignId}>{meta.name}</option>}
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          className="name"
          value={meta.name}
          onChange={(e) => setMeta((w) => ({ ...w, name: e.target.value }))}
          aria-label="Workflow name"
          size={Math.min(26, Math.max(8, meta.name.length))}
        />
        <span className={"tag " + tone}>{label}</span>
        {isSample && <span className="tag">Sample</span>}
        {save === "error" ? (
          <button
            type="button"
            className="saved sortb"
            title={saveError ?? "Could not save"}
            onClick={() => void flush()}
          >
            Couldn&apos;t save · Retry
          </button>
        ) : (
          <span className="saved hide-s" role="status">
            {save === "saved" ? "Saved" : save === "saving" ? "Saving…" : "Unsaved changes"}
          </span>
        )}
        <span className="sp" />

        <button className="ib sm" onClick={undo} disabled={!depth.past} title="Undo" aria-label="Undo">
          <Glyph n="undo" />
        </button>
        <button className="ib sm hide-s" onClick={redo} disabled={!depth.future} title="Redo" aria-label="Redo">
          <Glyph n="redo" />
        </button>
        <button className="ib sm" onClick={tidy} title="Tidy layout" aria-label="Tidy layout">
          <Glyph n="tidy" />
        </button>
        <button
          className={"ib sm" + (panel?.type === "settings" ? " on" : "")}
          onClick={() => setPanel(panel?.type === "settings" ? null : { type: "settings" })}
          title="Settings"
          aria-label="Workflow settings"
        >
          <SettingsIcon />
        </button>

        <span className="vsep hide-s" />
        <button className="btn sm line hide-s" disabled title={SENDING_OFF_NOTE}>
          Test
        </button>

        {issueCount > 0 && meta.status !== "live" ? (
          <button className="btn sm warn" onClick={fixFirst}>
            Fix {issueCount}
          </button>
        ) : meta.status === "live" ? (
          <button
            className="btn sm line"
            onClick={() => {
              setMeta((w) => ({ ...w, status: "paused" }));
              api
                .setCampaignStatus(campaignId, "paused")
                .then(() => toast("Paused"))
                .catch(() => {
                  setMeta((w) => ({ ...w, status: "live" }));
                  toast("Couldn't pause — try again");
                });
            }}
          >
            Pause
          </button>
        ) : (
          <button
            className="btn sm acc"
            disabled={!SENDING_ENABLED}
            title={SENDING_ENABLED ? undefined : SENDING_OFF_NOTE}
            onClick={() => setLaunching(true)}
          >
            {meta.status === "paused" ? "Resume" : "Launch"}
          </button>
        )}
      </div>

      <div className="bbody" ref={shell}>
        <aside className={"palette" + (paletteOpen ? " open" : "")} aria-label="Steps">
          {PALETTE.map(([group, kinds]) => (
            <div key={group}>
              <span className="eyebrow">{group}</span>
              <div className="pgrid">
                {kinds.map((kind) => (
                  <button
                    key={kind}
                    className={"pi" + (allowed(kind) ? "" : " off")}
                    draggable={allowed(kind)}
                    title={allowed(kind) ? "" : `${CHANNEL[STEPS[kind].ch as StepChannel].name} is off in Settings`}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/fp", kind);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => pickStep(kind)}
                  >
                    <StepChip kind={kind} />
                    <span className="pi-l">{STEPS[kind].label}</span>
                    <Glyph n="grip" className="grip" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>

        <div className="canvas">
          <Canvas
            api={canvas}
            nodes={nodes}
            edges={edges}
            selected={selected}
            issues={shown}
            stats={stats}
            lists={lists}
            audienceKey={audience ? audience.data.list : undefined}
            fitKey={fitKey}
            onSelect={(id) => {
              setSelected(id);
              setPanel(id ? { type: "node", id } : null);
              setMenu(null);
              if (!id) setPaletteOpen(false);
            }}
            onBeginDrag={mark}
            onMoveNode={moveNode}
            onConnect={connect}
            onDropStep={dropStep}
            onQuickAdd={openMenu}
          />

          {nodes.length <= 1 && <div className="canvas-tip">Drag a step in, or press + under Audience</div>}

          <button className="btn pri fab" onClick={() => setPaletteOpen((open) => !open)}>
            Add step
          </button>

          {menu && (
            <div className="qmenu" style={{ left: menu.x, top: menu.y }} role="menu" aria-label="Add a step">
              {PALETTE.map(([group, kinds]) => (
                <div key={group}>
                  <span className="eyebrow">{group}</span>
                  <div className="qg">
                    {kinds.map((kind) => (
                      <button
                        key={kind}
                        className={"pi" + (allowed(kind) ? "" : " off")}
                        onClick={() => {
                          if (!allowed(kind)) return;
                          addAfter(menu.id, menu.port, kind);
                          setMenu(null);
                        }}
                      >
                        <StepChip kind={kind} />
                        <span className="pi-l">{STEPS[kind].label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {step && (
          <Inspector
            node={step}
            issue={issues[step.id]}
            lists={lists}
            audienceKey={audience ? audience.data.list : undefined}
            onChange={(patch) => patchStep(step.id, patch)}
            onClose={() => setPanel(null)}
            onDelete={() => removeStep(step.id)}
            onDuplicate={() => duplicateStep(step.id)}
          />
        )}

        {panel?.type === "settings" && (
          <WorkflowSettings meta={meta} setMeta={setMeta} onClose={() => setPanel(null)} />
        )}
      </div>

      {launching && (
        <>
          <div className="scrim" onClick={() => setLaunching(false)} />
          <div className="modal" role="dialog" aria-modal="true" aria-label="Launch workflow">
            <div className="m-h">
              <div>
                <h2>
                  {meta.status === "paused" ? "Resume" : "Launch"} {meta.name}?
                </h2>
              </div>
              <button className="ib" onClick={() => setLaunching(false)} aria-label="Close">
                <Glyph n="x" />
              </button>
            </div>
            <div className="m-b">
              <div className="trio">
                <div>
                  <span className="eyebrow">Leads</span>
                  <b>{list ? list.n : 0}</b>
                </div>
                <div>
                  <span className="eyebrow">Per day</span>
                  <b>{meta.daily}</b>
                </div>
                <div>
                  <span className="eyebrow">Starts</span>
                  <b>
                    {meta.days[0] || "Mon"} {meta.from}
                  </b>
                </div>
              </div>
            </div>
            <div className="m-f">
              <button className="btn ghost" onClick={() => setLaunching(false)}>
                Cancel
              </button>
              <button
                className="btn acc"
                onClick={() => {
                  setLaunching(false);
                  api
                    .setCampaignStatus(campaignId, "live")
                    .then(() => {
                      setMeta((w) => ({ ...w, status: "live" }));
                      toast(`${meta.name} is live`);
                    })
                    .catch(() => toast("Couldn't launch — try again"));
                }}
              >
                {meta.status === "paused" ? "Resume" : "Launch"}
              </button>
            </div>
          </div>
        </>
      )}

      {toasts.length > 0 && (
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <div className="toast" key={t.id}>
              <span>{t.text}</span>
              {t.undo && (
                <button
                  onClick={() => {
                    t.undo?.();
                    setToasts((list) => list.filter((x) => x.id !== t.id));
                  }}
                >
                  Undo
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
