"use client";

/**
 * "How it works" scroll diagram: leads, channels and signals converging into one routed campaign.
 *
 * The mechanism is the one on giga.ai's own "How it works" section — labelled source groups fan
 * into a single node as the section scrolls through view, each strand drawing in with the scroll
 * position rather than fading in on a timer. The palette, layout and labels are Flightpath's own:
 * three inputs the product actually has (who you're reaching, which channels, what they do) feeding
 * the one thing it produces (a routed campaign), not GIGA's agent-building copy.
 *
 * Progress is read from the section's own position in the viewport on scroll (one rAF loop, no
 * React state per frame — see CLAUDE.md's animation conventions), the same approach `Hero` uses for
 * its pinned assembly, but without the pin: this section scrolls normally, and the strands simply
 * draw in as it passes through a band of the viewport, and draw back out if you scroll past and
 * return. `pathLength` + `stroke-dasharray` is the draw-in technique, so these paths deliberately
 * carry no `vector-effect: non-scaling-stroke` (that combination silently clips the path — see
 * CLAUDE.md).
 */

import { useEffect, useMemo, useRef } from "react";
import { Reveal } from "./Reveal";
import { usePrefersReducedMotion } from "@/lib/useInView";

type Group = {
  label: string;
  caption: string;
  /** Row center, in the 0–60 viewBox. */
  y: number;
  /** Strand colors, one per strand — a short list repeats. */
  colors: string[];
  strands: number;
};

const GROUPS: Group[] = [
  {
    label: "Leads",
    caption: "Every contact you upload or sync",
    y: 9,
    colors: ["var(--accent)"],
    strands: 5,
  },
  {
    label: "Channels",
    caption: "LinkedIn, email, WhatsApp, calls, SMS",
    y: 30,
    colors: ["#C2477E", "#B5841A", "#2A8C6C", "#8A63B8"],
    strands: 4,
  },
  {
    label: "Signals",
    caption: "Opens, replies, clicks, scores",
    y: 51,
    // A plain hex, not `var(--hl)`: that token is reused on this page as the glass skin's
    // 0-to-1 pointer-highlight opacity (see CLAUDE.md), so inside `.card` it resolves to a
    // number, not a color, and the strand silently disappears.
    colors: ["#B8841F"],
    strands: 3,
  },
];

const NODE = { x: 83, y: 30 };
const START_X = 13;

/** A Sankey-ish strand: starts flat, then bends into the shared node. */
function strandPath(x0: number, y0: number): string {
  const c1x = x0 + (NODE.x - x0) * 0.48;
  const c2x = x0 + (NODE.x - x0) * 0.86;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} C${c1x.toFixed(2)},${y0.toFixed(2)} ${c2x.toFixed(2)},${NODE.y.toFixed(2)} ${NODE.x.toFixed(2)},${NODE.y.toFixed(2)}`;
}

/** Every strand, flattened, with its row and a stagger index for the cascading draw-in. */
const STRANDS = GROUPS.flatMap((g, gi) => {
  const spread = 10;
  return Array.from({ length: g.strands }, (_, i) => {
    const y0 = g.y + (i - (g.strands - 1) / 2) * (spread / Math.max(1, g.strands - 1 || 1));
    return {
      group: gi,
      d: strandPath(START_X, y0),
      tickY: y0,
      color: g.colors[i % g.colors.length],
    };
  });
});

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function Pipeline() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const strandRefs = useRef<(SVGPathElement | null)[]>([]);
  const nodeRef = useRef<HTMLSpanElement>(null);
  const groupRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wordRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const perStrand = useMemo(() => 0.55 / Math.max(1, STRANDS.length - 1), []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    if (reducedMotion) {
      // Show the finished diagram outright rather than animating to it.
      strandRefs.current.forEach((p) => p?.style.removeProperty("stroke-dashoffset"));
      nodeRef.current?.style.setProperty("opacity", "1");
      nodeRef.current?.style.setProperty("transform", "scale(1)");
      groupRefs.current.forEach((g) => g?.style.setProperty("opacity", "1"));
      wordRef.current?.style.setProperty("opacity", "1");
      return;
    }

    let raf = 0;

    const update = () => {
      raf = 0;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight;
      // progress 0 when the section's top is 85% down the viewport, 1 once it has scrolled up
      // to 25% — a normal (unpinned) band the section passes through, not a sticky stage.
      const start = vh * 0.85;
      const end = vh * 0.25;
      const p = clamp((start - rect.top) / (start - end));
      const eased = ease(p);

      STRANDS.forEach((s, i) => {
        const el = strandRefs.current[i];
        if (!el) return;
        const local = clamp((eased - i * perStrand) / 0.45);
        el.style.strokeDashoffset = String(1 - local);
      });

      GROUPS.forEach((_, gi) => {
        const g = groupRefs.current[gi];
        if (g) g.style.opacity = clamp((eased - gi * 0.12) / 0.3).toFixed(3);
      });

      const word = wordRef.current;
      if (word) word.style.opacity = clamp((eased - 0.15) / 0.35).toFixed(3);

      const node = nodeRef.current;
      if (node) {
        const k = clamp((eased - 0.6) / 0.35);
        node.style.opacity = k.toFixed(3);
        node.style.transform = `scale(${(0.7 + 0.3 * k).toFixed(3)})`;
        section.classList.toggle("is-routed", eased > 0.93);
      }
    };

    const request = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    request();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
    };
  }, [reducedMotion, perStrand]);

  return (
    <section
      id="pipeline"
      ref={sectionRef}
      data-pip-section="flow"
      aria-labelledby="pipeline-title"
      className="border-t border-line py-24 md:py-32"
    >
      <div className="container-page">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">How it works</p>
          <h2 id="pipeline-title" className="display mt-4 text-[2.4rem] text-ink sm:text-5xl lg:text-[3.2rem]">
            Turn every lead into the <em>next right touch.</em>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-[18px] leading-relaxed text-ink-2">
            Bring your leads, channels and signals together, and Flightpath routes every touch for you.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-14">
          <div className="card overflow-hidden p-6 sm:p-10">
            <div ref={areaRef} className="pl-area" aria-hidden="true">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none">
                {STRANDS.map((s, i) => (
                  <path
                    key={i}
                    ref={(el) => {
                      strandRefs.current[i] = el;
                    }}
                    className="pl-strand"
                    d={s.d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="0.55"
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={1}
                  />
                ))}
              </svg>

              {STRANDS.map((s, i) => (
                <i
                  key={i}
                  className="pl-tick"
                  style={{
                    left: `${START_X - 2.2}%`,
                    top: `${(s.tickY / 60) * 100}%`,
                    background: s.color,
                  }}
                />
              ))}

              {GROUPS.map((g, gi) => (
                <div
                  key={g.label}
                  ref={(el) => {
                    groupRefs.current[gi] = el;
                  }}
                  className="pl-group"
                  style={{ left: `${START_X - 2.2}%`, top: `${(g.y / 60) * 100}%` }}
                >
                  <b>{g.label}</b>
                  <span>{g.caption}</span>
                </div>
              ))}

              <div ref={wordRef} className="pl-word" style={{ left: "44%", top: `${(NODE.y / 60) * 100}%` }}>
                <span className="serif">Orchestrate.</span>
                <small>Bring your leads, channels and signals into one routed campaign.</small>
              </div>

              <div className="pl-node" style={{ left: `${NODE.x}%`, top: `${(NODE.y / 60) * 100}%` }}>
                <span ref={nodeRef} className="pl-dot" />
                <b>Your campaign</b>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
