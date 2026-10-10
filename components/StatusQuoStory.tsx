"use client";

import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Database, FileSpreadsheet, Globe, ListChecks, Mail, Phone, StickyNote, TriangleAlert } from "lucide-react";
import { ChannelIcon } from "./ChannelIcon";

// Stage is laid out in 1000×600 design coordinates and scaled to fit.
const W = 1000;
const H = 600;

type Tile = {
  id: string;
  name: string;
  icon: LucideIcon | "linkedin";
  bad: string;
  good: string;
  chaos: [number, number, number]; // x, y, rotation
  order: [number, number];
  channel?: boolean;
};

const TILES: Tile[] = [
  { id: "crm", name: "CRM", icon: Database, bad: "Last updated 9 days ago", good: "Lead context shared", chaos: [520, 330, 7], order: [60, 70] },
  { id: "lists", name: "Prospect lists", icon: ListChecks, bad: "3 versions, no owner", good: "Enrolled in a workflow", chaos: [300, 110, -9], order: [60, 170] },
  { id: "sheet", name: "Lead spreadsheet", icon: FileSpreadsheet, bad: "leads_v7_FINAL(2).xlsx", good: "Imported · de-duplicated", chaos: [650, 190, 5], order: [60, 270] },
  { id: "forms", name: "Website form fills", icon: Globe, bad: "Sitting in an inbox", good: "Routed to inbound flow", chaos: [140, 300, -4], order: [60, 370] },
  { id: "notes", name: "Rep notes", icon: StickyNote, bad: "In someone’s doc", good: "Attached to the lead", chaos: [740, 420, -8], order: [60, 470] },
  { id: "li", name: "LinkedIn", icon: "linkedin", bad: "Request expired", good: "Step sent in order", chaos: [420, 220, 12], order: [760, 160], channel: true },
  { id: "mail", name: "Email sequencer", icon: Mail, bad: "Step 3 of 7… or 4?", good: "Waits for engagement", chaos: [250, 440, 6], order: [760, 270], channel: true },
  { id: "call", name: "Call list", icon: Phone, bad: "0 / 40 called", good: "Created on intent", chaos: [590, 70, -6], order: [760, 380], channel: true },
];

// Tangled connections between tools, with fixed curve offsets (deterministic for SSR).
const PAIRS: [string, string, [number, number, number, number]][] = [
  ["crm", "li", [140, -120, -180, 90]],
  ["sheet", "mail", [-200, 60, 160, -150]],
  ["lists", "call", [90, 170, -60, -190]],
  ["forms", "crm", [-150, -180, 210, 40]],
  ["notes", "li", [180, 120, -140, 160]],
  ["mail", "call", [-90, -160, 120, 190]],
  ["lists", "sheet", [210, 80, -200, -60]],
  ["forms", "mail", [60, -200, -110, 130]],
  ["notes", "sheet", [-170, 140, 90, -170]],
  ["li", "call", [130, 190, -210, -40]],
];

// "?" badges ride on tangled lines: [PAIRS index, position along the curve].
// Chosen so the three badges sit far apart and clear of tiles and the phase-2 alerts.
const QM_ANCHORS: [number, number][] = [
  [2, 0.55],
  [4, 0.5],
  [7, 0.55],
];

const HOT: string[][] = [
  ["lists", "sheet", "crm", "notes"],
  ["li", "mail", "call"],
  ["mail", "li", "crm"],
];

const TOASTS: { ph: number; text: string; x: number; y: number }[] = [
  { ph: 0, text: "12 tabs open — lost track of Priya’s thread", x: 30, y: 24 },
  { ph: 0, text: "Copy-pasting call notes into the CRM…", x: 560, y: 530 },
  { ph: 1, text: "Omar opened the email 3× — call, DM, or wait?", x: 520, y: 20 },
  { ph: 1, text: "Opened yesterday… nobody followed up", x: 30, y: 530 },
  { ph: 2, text: "He replied on LinkedIn… email step 4 still went out", x: 30, y: 24 },
  { ph: 2, text: "Two reps messaged the same lead", x: 560, y: 530 },
];

const CAPS = [
  { k: "01 · Tool fatigue", title: "Your reps are drowning in tabs.", body: "Lists, a sequencer, LinkedIn, a call list and the CRM — every lead lives in five places at once.", good: false },
  { k: "02 · The “if/then” problem", title: "Did they open it? Call, DM, or wait?", body: "Checking whether a prospect engaged before choosing the next channel is manual — and it doesn’t scale.", good: false },
  { k: "03 · Every tool, its own clock", title: "Touches collide. Or go silent.", body: "Timers fire regardless of what the lead just did, so replies get ignored and follow-ups get missed.", good: false },
  { k: "04 · The shift", title: "Now, untangle it.", body: "Flightpath pulls your lead sources into one workflow per lead — and every channel into one sequence.", good: true },
  { k: "05 · The new way", title: "One workflow. One clock. Every channel.", body: "Sources in, coordinated touches out. The next step follows engagement, not guesswork.", good: true },
];

const BOUNDS = [0, 0.18, 0.36, 0.54, 0.8, 1];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function bezierPoint([p0, p1, p2, p3]: number[][], t: number) {
  const s = 1 - t;
  const f = (k: number) => s * s * s * p0[k] + 3 * s * s * t * p1[k] + 3 * s * t * t * p2[k] + t * t * t * p3[k];
  return [f(0), f(1)];
}

function orderPath(t: Tile) {
  const y = t.order[1] + 30;
  return t.channel ? `M600,300 C680,300 670,${y} 760,${y}` : `M240,${y} C330,${y} 320,300 400,300`;
}

export function StatusQuoStory() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const q = <T extends Element>(s: string) => Array.from(root.querySelectorAll<T>(s));
    const one = <T extends Element>(s: string) => root.querySelector<T>(s)!;

    const fit = one<HTMLDivElement>(".sq-fit");
    const stage = one<HTMLDivElement>(".sq-stage");
    const tiles = q<HTMLDivElement>(".sq-tile");
    const chaos = q<SVGPathElement>(".sq-cl");
    const orderLines = q<SVGPathElement>(".sq-ol");
    const qms = q<HTMLSpanElement>(".sq-qm");
    const toasts = q<HTMLDivElement>(".sq-toast");
    const caps = q<HTMLDivElement>(".sq-cap");
    const ticks = q<HTMLElement>(".sq-ticks b");
    const core = one<HTMLDivElement>(".sq-core");
    const labels = q<HTMLSpanElement>(".sq-label");
    const [hTabs, hTools, hCtx, hDup] = q<HTMLSpanElement>(".sq-hp");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const byId = Object.fromEntries(TILES.map((t, i) => [t.id, i]));

    const sizeStage = () => {
      const desktop = window.innerWidth >= 1024;
      const navH = 64;
      const maxH = desktop ? window.innerHeight - navH - 170 : window.innerHeight * 0.4;
      const s = Math.min(fit.clientWidth / W, maxH / H);
      stage.style.transform = `scale(${s})`;
      stage.style.left = `${(fit.clientWidth - W * s) / 2}px`;
      fit.style.height = `${H * s}px`;
    };
    const ro = new ResizeObserver(sizeStage);
    ro.observe(fit);
    window.addEventListener("resize", sizeStage);

    let lastPhase = -1;
    const tick = (now: number) => {
      const r = root.getBoundingClientRect();
      const p = clamp(-r.top / (r.height - window.innerHeight));
      const phase = p < 0.18 ? 0 : p < 0.36 ? 1 : p < 0.54 ? 2 : p < 0.8 ? 3 : 4;
      const u = ease(clamp((p - 0.54) / 0.26));
      const t = now / 1000;
      const jit = reduce.matches ? 0 : 1 - u;

      const pos: [number, number][] = [];
      TILES.forEach((T, k) => {
        const jx = Math.sin(t * 2.3 + k * 1.7) * 5 * jit;
        const jy = Math.cos(t * 1.9 + k * 1.3) * 5 * jit;
        const x = lerp(T.chaos[0], T.order[0], u) + jx;
        const y = lerp(T.chaos[1], T.order[1], u) + jy;
        const rot = lerp(T.chaos[2], 0, u) + Math.sin(t * 1.6 + k) * 1.4 * jit;
        tiles[k].style.transform = `translate(${x}px,${y}px) rotate(${rot}deg)`;
        tiles[k].style.zIndex = String(u > 0.5 ? 2 : 2 + ((k * 3) % 5));
        pos[k] = [x + 90, y + 30];
      });

      const curves: number[][][] = [];
      PAIRS.forEach(([a, b, c], i) => {
        const [ax, ay] = pos[byId[a]];
        const [bx, by] = pos[byId[b]];
        chaos[i].setAttribute("d", `M${ax},${ay} C${ax + c[0]},${ay + c[1]} ${bx + c[2]},${by + c[3]} ${bx},${by}`);
        chaos[i].style.opacity = String(clamp(1 - u * 1.8) * 0.75);
        curves[i] = [[ax, ay], [ax + c[0], ay + c[1]], [bx + c[2], by + c[3]], [bx, by]];
      });
      QM_ANCHORS.forEach(([ci, t], k) => {
        const [x, y] = bezierPoint(curves[ci], t);
        qms[k].style.left = `${x}px`;
        qms[k].style.top = `${y}px`;
      });

      const v = clamp((u - 0.62) / 0.38);
      orderLines.forEach((l) => (l.style.strokeDashoffset = String(1 - v)));
      const cv = clamp((u - 0.25) / 0.5);
      core.style.opacity = String(cv);
      core.style.transform = `scale(${0.6 + 0.4 * cv})`;
      labels.forEach((l) => (l.style.opacity = String(clamp((u - 0.7) / 0.3))));
      stage.classList.toggle("is-ordered", u > 0.6);
      stage.classList.toggle("is-flowing", phase === 4);
      fit.classList.toggle("is-calm", u > 0.5);

      const tabs = p < 0.54 ? Math.round(lerp(5, 12, clamp(p / 0.54))) : Math.max(1, Math.round(lerp(12, 1, u)));
      hTabs.lastElementChild!.textContent = String(tabs);
      hTools.lastElementChild!.textContent = u > 0.6 ? "1" : "8";
      hCtx.lastElementChild!.textContent = `${Math.round(u * 100)}%`;
      [hTabs, hTools, hCtx].forEach((h) => h.classList.toggle("is-good", u > 0.6));
      hDup.lastElementChild!.textContent = String(Math.round(clamp((p - 0.36) / 0.18) * 7));
      hDup.classList.toggle("is-shown", phase === 2);

      ticks.forEach((b, k) => (b.style.transform = `scaleX(${clamp((p - BOUNDS[k]) / (BOUNDS[k + 1] - BOUNDS[k]))})`));
      if (phase !== lastPhase) {
        lastPhase = phase;
        stage.dataset.phase = String(phase);
        caps.forEach((c, k) => c.classList.toggle("is-on", k === phase));
        toasts.forEach((el) => el.classList.toggle("is-on", Number(el.dataset.ph) === phase));
        tiles.forEach((el, k) => el.classList.toggle("is-hot", phase < 3 && HOT[phase].includes(TILES[k].id)));
      }
    };

    // Single rAF loop, only while the story is on screen.
    let raf = 0;
    let visible = false;
    const loop = (now: number) => {
      tick(now);
      if (visible) raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(loop);
    });
    io.observe(root);
    sizeStage();
    tick(0);

    return () => {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", sizeStage);
    };
  }, []);

  return (
    <div ref={rootRef} className="sq-story" aria-label="From fragmented tools to one coordinated workflow" role="region">
      <div className="sq-sticky">
        <div className="container-page sq-grid">
          <div>
            <div className="sq-ticks" aria-hidden="true">
              {CAPS.map((c) => (
                <i key={c.k}>
                  <b />
                </i>
              ))}
            </div>
            <div className="sq-caps">
              {CAPS.map((c, i) => (
                <div key={c.k} className={`sq-cap ${c.good ? "is-good" : ""} ${i === 0 ? "is-on" : ""}`}>
                  <p className="sq-cap-k">{c.k}</p>
                  <h3 className="font-serif text-[2rem] leading-[1.08] text-ink lg:text-[2.5rem]">{c.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-ink-2/85 lg:text-[16.5px]">{c.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="sq-card" aria-hidden="true">
            <div className="sq-hud">
              <span className="sq-hp">
                Tabs open <b>5</b>
              </span>
              <span className="sq-hp">
                Tools to juggle <b>8</b>
              </span>
              <span className="sq-hp">
                Shared context <b>0%</b>
              </span>
              <span className="sq-hp sq-hp-dup">
                Duplicate touches <b>0</b>
              </span>
            </div>
            <div className="sq-fit">
              <div className="sq-stage" data-phase="0">
                <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
                  <g>
                    {PAIRS.map(([a, b]) => (
                      <path key={`${a}-${b}`} className="sq-cl" />
                    ))}
                  </g>
                  <g>
                    {TILES.map((t) => (
                      <path key={`ol-${t.id}`} className="sq-ol" d={orderPath(t)} pathLength={1} />
                    ))}
                    {TILES.map((t, i) => (
                      <path
                        key={`of-${t.id}`}
                        className="sq-of"
                        d={orderPath(t)}
                        pathLength={1}
                        style={{ animationDelay: `${-(i * 0.37) % 2.2}s` }}
                      />
                    ))}
                  </g>
                </svg>

                <span className="sq-label" style={{ left: 62, top: 40 }}>
                  LEAD SOURCES
                </span>
                <span className="sq-label" style={{ left: 762, top: 130 }}>
                  CHANNELS
                </span>

                <div className="sq-core">
                  <span className="sq-ring" />
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                    <path d="M5 16.5c3.5 0 4.5-9 8-9 2.2 0 2.6 3 6 3" stroke="#F3EDE3" strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx="19" cy="10.5" r="1.9" fill="#8B7CF6" />
                  </svg>
                  <b>Flightpath</b>
                  <small>ONE WORKFLOW · PER LEAD</small>
                </div>

                {TILES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <div
                      key={t.id}
                      className="sq-tile"
                      style={{ transform: `translate(${t.chaos[0]}px,${t.chaos[1]}px) rotate(${t.chaos[2]}deg)` }}
                    >
                      <span className={`sq-ic ${t.channel ? "is-channel" : ""}`}>
                        {Icon === "linkedin" ? <ChannelIcon channel="linkedin" size={15} /> : <Icon size={16} strokeWidth={1.8} />}
                      </span>
                      <span className="min-w-0">
                        <b>{t.name}</b>
                        <small>
                          <i className="sq-sd" />
                          <span className="sq-bad">{t.bad}</span>
                          <span className="sq-good">{t.good}</span>
                        </small>
                      </span>
                    </div>
                  );
                })}

                {TOASTS.map((t) => (
                  <div key={t.text} className="sq-toast" data-ph={t.ph} style={{ left: t.x, top: t.y }}>
                    <TriangleAlert size={16} className="shrink-0 text-[#F59E6B]" />
                    {t.text}
                  </div>
                ))}
                <span className="sq-qm">?</span>
                <span className="sq-qm">?</span>
                <span className="sq-qm">?</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
