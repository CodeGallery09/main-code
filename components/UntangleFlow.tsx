"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useInView } from "@/lib/useInView";
import { pipSay } from "@/lib/pip";

/* ---------------------------------------------------------------------------
   The "Today" chaos and the "With Flightpath" order are the same five tools in the same area.
   This component starts from the tangled layout and untangles it: chips glide into columns,
   crossing wires fade, and clean curves draw into one hub, then packets start to flow.
   Positions are percentages of the area; everything animates through refs (no React re-renders).
   --------------------------------------------------------------------------- */
type Pt = { x: number; y: number; r: number };
export type Tool = { label: string; tangled: Pt; neat: Pt; side: "in" | "out"; dur: number };

export const TOOLS: Tool[] = [
  { label: "Audience lists", tangled: { x: 20, y: 20, r: -6 }, neat: { x: 15, y: 22, r: 0 }, side: "in", dur: 4.2 },
  { label: "Sequencer", tangled: { x: 74, y: 16, r: 4 }, neat: { x: 85, y: 30, r: 0 }, side: "out", dur: 3.6 },
  { label: "LinkedIn", tangled: { x: 46, y: 50, r: -3 }, neat: { x: 85, y: 70, r: 0 }, side: "out", dur: 4.8 },
  { label: "Call list", tangled: { x: 18, y: 80, r: 5 }, neat: { x: 15, y: 78, r: 0 }, side: "in", dur: 3.9 },
  { label: "CRM", tangled: { x: 78, y: 78, r: -5 }, neat: { x: 15, y: 50, r: 0 }, side: "in", dur: 4.4 },
];
/** Which tools are wired to which, in the tangled layout. */
export const LINKS: [number, number][] = [[0, 2], [0, 4], [1, 3], [1, 2], [2, 4], [3, 2], [3, 4], [0, 1]];
/** Control-point offset that makes each tangled wire bow, as on the "Today" card. */
export const bow = (k: number): [number, number] => [k % 2 ? 14 : -14, k % 3 ? -10 : 12];

const HUB = { x: 50, y: 50 };
const HOLD_MS = 900; // show the mess first
const MORPH_MS = 1900;
const FLOW_MS = 2400; // one packet trip

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Smooth S-curve with horizontal tangents, like a node-editor wire. */
const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const mx = (a.x + b.x) / 2;
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)} C${mx.toFixed(2)},${a.y.toFixed(2)} ${mx.toFixed(2)},${b.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
};
/** Neat wires always run in the direction of travel: sources into the hub, hub out to touches. */
const neatPath = (t: Tool, p: { x: number; y: number }) => (t.side === "in" ? curve(p, HUB) : curve(HUB, p));

const chipBase =
  "uf-chip absolute rounded-full border px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap shadow-[0_6px_16px_-12px_var(--shadow)]";

export function UntangleFlow() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.5 });
  const [runKey, setRunKey] = useState(0);
  const chips = useRef<(HTMLSpanElement | null)[]>([]);
  const hub = useRef<HTMLSpanElement>(null);
  const tangledPaths = useRef<(SVGPathElement | null)[]>([]);
  const neatPaths = useRef<(SVGPathElement | null)[]>([]);
  const dots = useRef<(HTMLSpanElement | null)[]>([]);
  const pos = useRef(TOOLS.map((t) => ({ ...t.neat })));

  /** Draws the whole scene for morph progress t (0 = tangled, 1 = untangled). */
  const apply = (t: number) => {
    TOOLS.forEach((tool, i) => {
      const el = chips.current[i];
      const p = { x: lerp(tool.tangled.x, tool.neat.x, t), y: lerp(tool.tangled.y, tool.neat.y, t), r: lerp(tool.tangled.r, 0, t) };
      pos.current[i] = p;
      if (el) {
        el.style.left = `${p.x}%`;
        el.style.top = `${p.y}%`;
        el.style.transform = `translate(-50%,-50%) rotate(${p.r.toFixed(2)}deg)`;
      }
    });
    LINKS.forEach(([a, b], k) => {
      const A = pos.current[a], B = pos.current[b], [ox, oy] = bow(k);
      const cx = (A.x + B.x) / 2 + ox * (1 - t), cy = (A.y + B.y) / 2 + oy * (1 - t);
      const el = tangledPaths.current[k];
      if (el) {
        el.setAttribute("d", `M${A.x.toFixed(2)},${A.y.toFixed(2)} Q${cx.toFixed(2)},${cy.toFixed(2)} ${B.x.toFixed(2)},${B.y.toFixed(2)}`);
        el.style.opacity = String(clamp(1 - t * 1.6));
      }
    });
    TOOLS.forEach((tool, i) => {
      const el = neatPaths.current[i];
      if (el) {
        el.setAttribute("d", neatPath(tool, pos.current[i]));
        el.style.opacity = String(clamp((t - 0.45) / 0.55));
      }
    });
    const h = hub.current;
    if (h) {
      const k = clamp((t - 0.25) / 0.75);
      h.style.opacity = String(k);
      h.style.transform = `translate(-50%,-50%) scale(${(0.8 + 0.2 * k).toFixed(3)})`;
    }
  };

  // Before first paint, put the scene in its starting (tangled) state when motion is allowed.
  // Server HTML and no-JS show the untangled end state, so nothing is hidden or broken.
  useLayoutEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) apply(0);
  }, []);

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply(1);
      return;
    }
    let raf = 0, said = false;
    const t0 = performance.now();
    const tick = (now: number) => {
      const el = now - t0;
      const t = ease(clamp((el - HOLD_MS) / MORPH_MS));
      apply(t);
      if (t >= 1) {
        if (!said) {
          said = true;
          pipSay("Same five tools. Now they share one workflow and one clock.", 4200);
        }
        // packets ride the clean wires once everything has settled
        const since = el - HOLD_MS - MORPH_MS;
        TOOLS.forEach((_, i) => {
          const path = neatPaths.current[i], dot = dots.current[i];
          if (!path || !dot) return;
          const ph = (((since / FLOW_MS) + i * 0.21) % 1 + 1) % 1;
          const pt = path.getPointAtLength(path.getTotalLength() * ph);
          dot.style.left = `${pt.x}%`;
          dot.style.top = `${pt.y}%`;
          dot.style.opacity = String(Math.sin(Math.PI * ph) * clamp(since / 400));
        });
      } else {
        dots.current.forEach((d) => d && (d.style.opacity = "0"));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, runKey]);

  const end = (i: number) => TOOLS[i].neat;

  return (
    <div>
      <div ref={ref} className="why-area" aria-hidden="true">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {LINKS.map(([a, b], k) => (
            <path
              key={k}
              ref={(el) => { tangledPaths.current[k] = el; }}
              className="why-ants"
              d={`M${end(a).x},${end(a).y} L${end(b).x},${end(b).y}`}
              style={{ opacity: 0 }}
              fill="none"
              stroke="var(--line-strong)"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {TOOLS.map((t, i) => (
            <path
              key={t.label}
              ref={(el) => { neatPaths.current[i] = el; }}
              className="why-ants"
              d={neatPath(t, t.neat)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.8"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {TOOLS.map((t, i) => (
          <span
            key={t.label}
            ref={(el) => { chips.current[i] = el; }}
            className={`${chipBase} border-line-strong bg-surface text-ink-2`}
            style={{ left: `${t.neat.x}%`, top: `${t.neat.y}%`, transform: "translate(-50%,-50%)" }}
          >
            {t.label}
          </span>
        ))}

        <span
          ref={hub}
          className="absolute inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[14px] font-bold whitespace-nowrap text-white shadow-[0_16px_34px_-14px_rgb(10_10_10/0.5),inset_0_1px_0_rgb(255_255_255/0.3)]"
          style={{ left: `${HUB.x}%`, top: `${HUB.y}%`, transform: "translate(-50%,-50%)" }}
        >
          <span className="live-dot text-white" />
          Flightpath
        </span>

        {TOOLS.map((t, i) => (
          <span
            key={`dot-${t.label}`}
            ref={(el) => { dots.current[i] = el; }}
            className="pointer-events-none absolute h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_10px_rgb(10_10_10/0.55)]"
            style={{ opacity: 0, left: `${t.neat.x}%`, top: `${t.neat.y}%`, transform: "translate(-50%,-50%)" }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRunKey((k) => k + 1)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold text-ink-2 transition-colors hover:bg-surface-2 hover:text-accent-ink"
      >
        <RotateCcw size={13} aria-hidden="true" />
        Replay the untangling
      </button>
    </div>
  );
}
