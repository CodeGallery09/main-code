"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BarChart3, Check, Gauge, Hourglass, Inbox, Mail, Pause, Phone, Play, Repeat, Split, Zap } from "lucide-react";
import { ChannelIcon } from "./ChannelIcon";
import { Reveal } from "./Reveal";
import { useInView, usePrefersReducedMotion } from "@/lib/useInView";
import { pipSay, setPipBusy } from "@/lib/pip";

/* ---------------- graph model ---------------- */
type Kind = "trigger" | "inbound" | "linkedin" | "email" | "wait" | "score" | "if" | "call" | "nurture" | "pause" | "benchmark";
type NodeId = "t" | "a" | "b" | "c" | "s" | "if" | "yes" | "no" | "bm";
type NodeDef = { label: string; sub: string; kind: Kind };
type Template = {
  name: string;
  nodes: Record<NodeId, NodeDef>;
  branch: "yes" | "no";
  ifNote: string;
  result: { text: string; good: boolean };
  say: string;
};

/** Every template shares one shape: five steps, an IF node, two branches, then the benchmark. */
const POS: Record<NodeId, [col: number, row: number]> = {
  t: [0, 0], a: [1, 0], b: [2, 0], c: [3, 0], s: [4, 0], if: [5, 0], yes: [6, -1], no: [6, 1], bm: [7, 0],
};
const EDGES: { from: NodeId; to: NodeId; label?: "true" | "false" }[] = [
  { from: "t", to: "a" }, { from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "s" }, { from: "s", to: "if" },
  { from: "if", to: "yes", label: "true" }, { from: "if", to: "no", label: "false" }, { from: "yes", to: "bm" }, { from: "no", to: "bm" },
];
const STEP_OF: Record<NodeId, number> = { t: 0, a: 1, b: 1, c: 1, s: 2, if: 3, yes: 3, no: 3, bm: 3 };

const score: NodeDef = { label: "Score engagement", sub: "Opens · clicks · replies", kind: "score" };
const bench: NodeDef = { label: "Benchmark", sub: "vs. your range", kind: "benchmark" };
const call: NodeDef = { label: "Call task", sub: "To the owner", kind: "call" };

const TEMPLATES: Template[] = [
  {
    name: "Net-new outbound",
    nodes: {
      t: { label: "New audience list", sub: "Trigger", kind: "trigger" },
      a: { label: "Connect", sub: "LinkedIn", kind: "linkedin" },
      b: { label: "Message", sub: "Once accepted", kind: "linkedin" },
      c: { label: "Follow-up", sub: "Email · if no reply", kind: "email" },
      s: score,
      if: { label: "IF score ≥ 70", sub: "Route", kind: "if" },
      yes: call,
      no: { label: "Nurture", sub: "Value email", kind: "nurture" },
      bm: bench,
    },
    branch: "yes",
    ifNote: "score 76 ≥ 70 → true",
    result: { text: "5.8% · in range", good: true },
    say: "Score 76 cleared the bar, so the owner gets a call task. Routed, not scheduled.",
  },
  {
    name: "Inbound follow-up",
    nodes: {
      t: { label: "Form fill", sub: "Trigger", kind: "inbound" },
      a: { label: "Instant reply", sub: "Email", kind: "email" },
      b: { label: "Connect", sub: "LinkedIn", kind: "linkedin" },
      c: { label: "Wait for signal", sub: "Up to 2 days", kind: "wait" },
      s: score,
      if: { label: "IF replied", sub: "Route", kind: "if" },
      yes: call,
      no: { label: "Follow-up", sub: "Email · second touch", kind: "email" },
      bm: bench,
    },
    branch: "yes",
    ifNote: "replied by email → true",
    result: { text: "21.5% · in range", good: true },
    say: "She replied, so a human takes it from here. No bot pestering a warm audience.",
  },
  {
    name: "Closed-lost re-engage",
    nodes: {
      t: { label: "Closed-lost", sub: "Trigger · 90+ days", kind: "trigger" },
      a: { label: "What's changed", sub: "Email", kind: "email" },
      b: { label: "Re-connect", sub: "LinkedIn", kind: "linkedin" },
      c: { label: "Wait 5 days", sub: "Listen for signals", kind: "wait" },
      s: score,
      if: { label: "IF score ≥ 70", sub: "Route", kind: "if" },
      yes: call,
      no: { label: "Pause", sub: "Retry in 60 days", kind: "pause" },
      bm: bench,
    },
    branch: "no",
    ifNote: "score 34 < 70 → false",
    result: { text: "2.1% · below range", good: false },
    say: "Score 34, so she's paused for 60 days instead of spammed. And the benchmark flags it.",
  },
];

const STEPS = [
  { k: "01", t: "Pick a workflow", d: "Outbound, inbound or re-engage, with channel order preset." },
  { k: "02", t: "Run the first touches", d: "LinkedIn and email in one sequence. Nothing is sent twice." },
  { k: "03", t: "Listen for engagement", d: "Accepts, opens, clicks and replies become one score." },
  { k: "04", t: "Route the next action", d: "The IF node branches on behaviour, not on a timer." },
];

function KindIcon({ kind }: { kind: Kind }): ReactNode {
  const p = { size: 22, strokeWidth: 1.7, "aria-hidden": true } as const;
  switch (kind) {
    case "trigger": return <Zap {...p} />;
    case "inbound": return <Inbox {...p} />;
    case "linkedin": return <ChannelIcon channel="linkedin" size={20} />;
    case "email": return <Mail {...p} />;
    case "wait": return <Hourglass {...p} />;
    case "score": return <Gauge {...p} />;
    case "if": return <Split {...p} className="rotate-90" />;
    case "call": return <Phone {...p} />;
    case "nurture": return <Repeat {...p} />;
    case "pause": return <Pause {...p} />;
    case "benchmark": return <BarChart3 {...p} />;
  }
}

/* ---------------- canvas geometry (design px, scaled to fit) ---------------- */
const W = 1024, H = 340, BOX = 60;
const X = (col: number) => 64 + col * 128;
const Y = (row: number) => 150 + row * 98;
const pt = (id: NodeId) => ({ x: X(POS[id][0]), y: Y(POS[id][1]) });
function edgeGeom(from: NodeId, to: NodeId) {
  const a = pt(from), b = pt(to);
  // The IF node has two output handles, like n8n: true on top, false below.
  const off = from === "if" ? (to === "yes" ? -14 : 14) : 0;
  const x1 = a.x + BOX / 2, y1 = a.y + off, x2 = b.x - BOX / 2 - 4, y2 = b.y, dx = Math.max(28, (x2 - x1) / 2);
  const c1 = { x: x1 + dx, y: y1 }, c2 = { x: x2 - dx, y: y2 };
  return {
    d: `M${x1},${y1} C${c1.x},${c1.y} ${c2.x},${c2.y} ${x2},${y2}`,
    mid: { x: (x1 + 3 * c1.x + 3 * c2.x + x2) / 8, y: (y1 + 3 * c1.y + 3 * c2.y + y2) / 8 },
    start: { x: x1, y: y1 },
    flat: y1 === y2,
  };
}
const ekey = (from: NodeId, to: NodeId) => `${from}>${to}`;

type NodeState = "idle" | "running" | "done" | "skipped";
type RunState = { nodes: Partial<Record<NodeId, NodeState>>; edges: Record<string, "done" | "skipped">; ifOpen: boolean; finished: boolean; current: NodeId | null };
const EMPTY: RunState = { nodes: {}, edges: {}, ifOpen: false, finished: false, current: null };

function finalState(tpl: Template): RunState {
  const skip = tpl.branch === "yes" ? "no" : "yes";
  const path = execPath(tpl);
  const nodes: RunState["nodes"] = {};
  path.forEach((id) => (nodes[id] = "done"));
  nodes[skip] = "skipped";
  const edges: RunState["edges"] = {};
  for (let i = 0; i < path.length - 1; i++) edges[ekey(path[i], path[i + 1])] = "done";
  edges[ekey("if", skip)] = "skipped";
  edges[ekey(skip, "bm")] = "skipped";
  return { nodes, edges, ifOpen: true, finished: true, current: "bm" };
}
const execPath = (tpl: Template): NodeId[] => ["t", "a", "b", "c", "s", "if", tpl.branch, "bm"];

export function WorkflowLibrary() {
  const [tplIdx, setTplIdx] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [run, setRun] = useState<RunState>(EMPTY);
  const [scale, setScale] = useState(1);
  const reduced = usePrefersReducedMotion();
  const { ref: canvasRef, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const packetRef = useRef<SVGCircleElement>(null);
  const tpl = TEMPLATES[tplIdx];

  // Fit the canvas to its container; below 72% it scrolls sideways instead of shrinking further.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, Math.max(0.72, el.clientWidth / W))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Execution: nodes run one at a time, a packet travels each edge, the IF node picks a branch.
  useEffect(() => {
    if (!inView) return;
    const t = TEMPLATES[tplIdx];
    if (reduced) {
      setRun(finalState(t));
      return;
    }
    let cancelled = false, raf = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sleep = (ms: number) => new Promise<void>((res) => timers.push(setTimeout(res, ms)));
    const set = (fn: (r: RunState) => RunState) => { if (!cancelled) setRun(fn); };
    const packet = (key: string, ms: number) =>
      new Promise<void>((res) => {
        const path = pathRefs.current[key], dot = packetRef.current;
        if (!path || !dot) return res();
        const len = path.getTotalLength(), t0 = performance.now();
        dot.style.opacity = "1";
        const step = (now: number) => {
          if (cancelled) return res();
          const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const p = path.getPointAtLength(len * e);
          dot.setAttribute("transform", `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
          if (k < 1) raf = requestAnimationFrame(step);
          else { dot.style.opacity = "0"; res(); }
        };
        raf = requestAnimationFrame(step);
      });
    const pan = (id: NodeId) => {
      const sc = scrollerRef.current;
      if (sc && sc.scrollWidth > sc.clientWidth + 4) {
        const s = sc.scrollWidth / W;
        sc.scrollTo({ left: X(POS[id][0]) * s - sc.clientWidth / 2, behavior: "smooth" });
      }
    };

    setRun(EMPTY);
    setPipBusy(true);
    (async () => {
      const path = execPath(t), skip = t.branch === "yes" ? "no" : "yes";
      await sleep(450);
      for (let i = 0; i < path.length; i++) {
        if (cancelled) return;
        const id = path[i];
        pan(id);
        set((r) => ({ ...r, current: id, nodes: { ...r.nodes, [id]: "running" } }));
        await sleep(id === "if" ? 650 : 480);
        set((r) => ({ ...r, nodes: { ...r.nodes, [id]: "done" } }));
        if (id === "if") {
          set((r) => ({
            ...r,
            ifOpen: true,
            nodes: { ...r.nodes, [skip]: "skipped" },
            edges: { ...r.edges, [ekey("if", skip)]: "skipped", [ekey(skip, "bm")]: "skipped" },
          }));
          await sleep(450);
        }
        if (i < path.length - 1) {
          const key = ekey(id, path[i + 1]);
          await packet(key, 520);
          set((r) => ({ ...r, edges: { ...r.edges, [key]: "done" } }));
        }
      }
      set((r) => ({ ...r, finished: true }));
      setPipBusy(false);
      if (!cancelled) pipSay(t.say, 5200);
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
      setPipBusy(false);
    };
  }, [inView, reduced, tplIdx, runKey]);

  const choose = (i: number) => (i === tplIdx ? setRunKey((k) => k + 1) : setTplIdx(i));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (tplIdx + (e.key === "ArrowRight" ? 1 : TEMPLATES.length - 1)) % TEMPLATES.length;
    setTplIdx(next);
    e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  };

  const running = !!run.current && !run.finished;
  const curStep = run.current ? STEP_OF[run.current] : 0;
  const doneCount = Object.values(run.nodes).filter((s) => s === "done").length;
  const status = run.finished ? "Finished · sample run" : running ? `Executing… ${doneCount + 1} / 8` : "Ready";

  return (
    <section id="how-it-works" data-pip-section="how" aria-labelledby="how-title" className="border-t border-line py-24 md:py-32">
      <div className="container-page">
        <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="eyebrow">How it works · Workflow library</p>
            <h2 id="how-title" className="display mt-4 text-[2.4rem] text-ink sm:text-5xl lg:text-[3.2rem]">
              Pick a workflow. <em>Watch it run.</em>
            </h2>
          </div>
          <p className="max-w-sm text-[16px] leading-relaxed text-ink-2">
            Every template is a few nodes: touches, a score and a routing rule. Here&rsquo;s one executing, step by step.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-10">
          <div ref={canvasRef} id="wf-canvas" className="card overflow-hidden">
            {/* editor bar */}
            <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div role="radiogroup" aria-label="Workflow template" onKeyDown={onKey} className="inline-flex flex-wrap gap-0.5 rounded-full bg-[rgb(120_120_128/0.14)] p-[3px]">
                {TEMPLATES.map((t, i) => {
                  const on = i === tplIdx;
                  return (
                    <button
                      key={t.name}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      tabIndex={on ? 0 : -1}
                      onClick={() => choose(i)}
                      className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors duration-200 ${
                        on ? "bg-white font-semibold text-ink shadow-[0_2px_8px_rgb(0_0_0/0.14),0_0_0_0.5px_rgb(0_0_0/0.04)]" : "text-ink-2 hover:text-ink"
                      }`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-muted" aria-live="polite">
                  {status}
                </span>
                <button
                  type="button"
                  onClick={() => setRunKey((k) => k + 1)}
                  aria-disabled={running || undefined}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-medium text-surface transition-colors hover:bg-accent-ink aria-disabled:opacity-70"
                >
                  <Play size={13} fill="currentColor" aria-hidden="true" />
                  Execute workflow
                </button>
              </div>
            </div>

            {/* canvas */}
            <div ref={scrollerRef} className="wf-canvas-bg relative overflow-x-auto">
              <div className="relative mx-auto" style={{ width: W * scale, height: H * scale }}>
                <div className="absolute top-0 left-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
                  <svg className="absolute inset-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
                    {EDGES.map(({ from, to, label }) => {
                      const g = edgeGeom(from, to), key = ekey(from, to), st = run.edges[key];
                      return (
                        <g key={key}>
                          <path
                            ref={(el) => {
                              pathRefs.current[key] = el;
                            }}
                            className="wf-edge"
                            data-state={st}
                            d={g.d}
                            fill="none"
                            stroke="var(--line-strong)"
                            strokeWidth="2"
                          />
                          <circle cx={g.start.x} cy={g.start.y} r="4.5" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="1.5" />
                          {label && (
                            <text x={g.start.x + 9} y={g.start.y + (label === "true" ? 12 : -5)} className="fill-muted font-mono text-[10px]">
                              {label}
                            </text>
                          )}
                          {st === "done" && g.flat && (
                            <text key={`${key}-${tplIdx}-${runKey}`} x={g.mid.x} y={g.mid.y - 9} textAnchor="middle" className="wf-fade fill-accent-ink font-mono text-[9.5px]">
                              1 item
                            </text>
                          )}
                        </g>
                      );
                    })}
                    <circle ref={packetRef} r="5.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" style={{ opacity: 0 }} />
                  </svg>

                  {(Object.keys(POS) as NodeId[]).map((id) => {
                    const n = tpl.nodes[id], p = pt(id), st = run.nodes[id] ?? "idle";
                    const trigger = n.kind === "trigger" || n.kind === "inbound";
                    return (
                      <div
                        key={`${tplIdx}-${id}`}
                        className="wf-node wf-fade absolute flex w-[124px] flex-col items-center text-center"
                        data-state={st}
                        style={{ left: p.x - 62, top: p.y - BOX / 2 }}
                      >
                        <div
                          className={`wf-box relative flex h-[60px] w-[60px] items-center justify-center border-2 border-line-strong bg-surface text-ink-2 shadow-[0_8px_18px_-14px_var(--shadow)] ${
                            trigger ? "rounded-l-[30px] rounded-r-[14px]" : "rounded-[14px]"
                          }`}
                        >
                          <KindIcon kind={n.kind} />
                          <span className="wf-spin pointer-events-none absolute -inset-[5px] rounded-[18px] border-2 border-transparent border-t-accent" />
                          <span className="wf-badge absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-success text-surface">
                            <Check size={12} strokeWidth={3} aria-hidden="true" />
                          </span>
                        </div>
                        <p className="mt-2 text-[12.5px] leading-tight font-medium text-ink">{n.label}</p>
                        <p className="text-[11px] leading-tight text-muted">{n.sub}</p>
                        {id === "bm" && st === "done" && (
                          <span
                            className={`wf-pop mt-2 rounded-full px-2 py-0.5 font-mono text-[10px] whitespace-nowrap ${
                              tpl.result.good ? "bg-success-soft text-success" : "bg-alert-soft text-warn"
                            }`}
                          >
                            {tpl.result.text}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {run.ifOpen && (
                    <span
                      key={`note-${tplIdx}-${runKey}`}
                      className="wf-pop absolute -translate-x-1/2 rounded-[8px] border border-line bg-surface px-2 py-1 font-mono text-[10px] whitespace-nowrap text-accent-ink-ink shadow-sm"
                      style={{ left: X(POS.if[0]) - 44, top: Y(0) - BOX / 2 - 36 }}
                    >
                      {tpl.ifNote}
                    </span>
                  )}
                </div>
              </div>
              <span className="tag-sample absolute bottom-3 left-4">Sample run</span>
              <span className="absolute right-4 bottom-3 font-mono text-[10px] text-muted sm:hidden" aria-hidden="true">swipe →</span>
            </div>

            {/* how it works, in four steps, lit by the run */}
            <ol className="grid grid-cols-1 border-t border-line sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => {
                const active = running && curStep === i;
                const done = run.finished || (running && curStep > i);
                return (
                  <li
                    key={s.k}
                    data-wf-step
                    className={`relative border-line px-5 py-3.5 sm:py-5 transition-colors duration-300 sm:[&:nth-child(odd)]:border-r lg:border-r lg:last:border-r-0 [&:not(:last-child)]:border-b sm:[&:nth-child(-n+2)]:border-b lg:border-b-0 ${
                      active ? "bg-accent-soft/50" : ""
                    }`}
                  >
                    <span
                      className={`absolute inset-x-0 top-0 h-0.5 origin-left bg-accent transition-transform duration-500 ${active || done ? "scale-x-100" : "scale-x-0"}`}
                      aria-hidden="true"
                    />
                    <p className="flex items-center gap-2 font-mono text-[11px] text-accent-ink">
                      {s.k}
                      {done && <Check size={12} className="text-success" aria-label="done" />}
                    </p>
                    <p className="mt-2 text-[15px] font-semibold text-ink">{s.t}</p>
                    <p className="mt-1 hidden text-[13.5px] leading-relaxed text-ink-2 sm:block">{s.d}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
