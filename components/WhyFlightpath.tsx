"use client";

import type { CSSProperties } from "react";
import { Reveal } from "./Reveal";
import { LINKS, TOOLS, UntangleFlow, bow } from "./UntangleFlow";

const PAINS = [
  { k: "01 · Tool fatigue", t: "Every audience lives in five places at once." },
  { k: "02 · The if/then problem", t: "Checking engagement by hand before every touch doesn't scale." },
  { k: "03 · Clashing clocks", t: "Timers fire no matter what the audience just did." },
];

export function WhyFlightpath() {
  return (
    <section id="why" data-pip-section="why" aria-labelledby="why-title" className="border-t border-line py-24 md:py-32">
      <div className="container-page">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Why Flightpath</p>
          <h2 id="why-title" className="display mt-4 text-[2.4rem] text-ink sm:text-5xl lg:text-[3.2rem]">
            Outbound is fragmented, manual and <em>broken.</em>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-[18px] leading-relaxed text-ink-2">
            Five tools, five clocks. Flightpath turns them into one workflow that listens before it acts.
          </p>
        </Reveal>

        <Reveal delay={100} className="mt-14">
          <div className="card grid grid-cols-1 overflow-hidden md:grid-cols-2">
            <div data-why="today" className="border-b border-line p-6 sm:p-8 md:border-r md:border-b-0">
              <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-warn">Today · five tools, five clocks</p>
              <div className="why-area why-tangle mt-5" aria-hidden="true">
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {LINKS.map(([a, b], k) => {
                    const A = TOOLS[a].tangled, B = TOOLS[b].tangled, [ox, oy] = bow(k);
                    return (
                      <path
                        key={k}
                        className="why-ants"
                        d={`M${A.x},${A.y} Q${(A.x + B.x) / 2 + ox},${(A.y + B.y) / 2 + oy} ${B.x},${B.y}`}
                        fill="none"
                        stroke="var(--line-strong)"
                        strokeWidth="1.2"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </svg>
                {TOOLS.map((t) => (
                  <span
                    key={t.label}
                    className="why-chip rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap text-ink-2 shadow-[0_6px_16px_-12px_var(--shadow)]"
                    style={{ "--x": `${t.tangled.x}%`, "--y": `${t.tangled.y}%`, "--r": `${t.tangled.r}deg`, "--dur": `${t.dur}s` } as CSSProperties}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
              <ul className="mt-5 space-y-2 text-[14px] text-ink-2">
                <li className="border-l-2 border-line-strong pl-3">Example: an audience replies on LinkedIn, but email step 4 still goes out.</li>
                <li className="border-l-2 border-line-strong pl-3">Example: two reps message the same audience.</li>
              </ul>
            </div>

            <div data-why="flightpath" className="p-6 sm:p-8">
              <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-success">With Flightpath · one workflow, one clock</p>
              <div className="mt-5">
                <UntangleFlow />
              </div>
              <ul className="mt-3 space-y-2 text-[14px] text-ink-2">
                <li className="border-l-2 border-accent pl-3">Same five tools, now on one workflow and one clock.</li>
                <li className="border-l-2 border-accent pl-3">The next step follows engagement, not guesswork.</li>
              </ul>
            </div>
          </div>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
          {PAINS.map((p, i) => (
            <Reveal key={p.k} delay={i * 90} className="border-t-2 border-line-strong pt-4">
              <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-accent-ink">{p.k}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{p.t}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
