"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Info } from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";
import { useInView } from "@/lib/useInView";

// All figures below are illustrative demo data for the mockup — not customer results.
const KPIS = [
  { label: "Leads in motion", to: 1284, decimals: 0, suffix: "", note: "across 3 workflows", spark: [8, 10, 9, 13, 14, 13, 17, 19, 18, 22], live: true },
  { label: "Positive reply rate", to: 6.4, decimals: 1, suffix: "%", note: "benchmark range 4–7%", spark: [4.1, 4.6, 4.4, 5.2, 5.0, 5.6, 5.9, 6.1, 6.0, 6.4] },
  { label: "Meetings booked", to: 38, decimals: 0, suffix: "", note: "last 30 days", spark: [2, 3, 3, 5, 4, 6, 7, 6, 8, 9] },
  { label: "Touches to meeting", to: 4.2, decimals: 1, suffix: "", note: "median", spark: [6.1, 5.8, 5.9, 5.3, 5.1, 4.9, 4.8, 4.5, 4.4, 4.2] },
];

const FUNNEL = [
  { stage: "Enrolled", n: 1284 },
  { stage: "Engaged", n: 612 },
  { stage: "Replied", n: 142 },
  { stage: "Meeting", n: 38 },
  { stage: "Opportunity", n: 21 },
];
const DROP_INDEX = 2; // Engaged → Replied is the steepest drop

const WORKFLOWS = [
  { name: "Net-new outbound", rate: 5.8, low: 4.0, high: 7.0 },
  { name: "Inbound follow-up", rate: 21.5, low: 15.0, high: 25.0 },
  { name: "Closed-lost re-engage", rate: 2.1, low: 3.0, high: 6.0 },
];
const AXIS = 30; // benchmark axis 0–30%

// Timeline (ms after the dashboard enters view)
const T_KPI = 250;
const T_FUNNEL = 650;
const T_BENCH = 1100;
const T_DONE = 2600;

const dl = (ms: number) => ({ "--reveal-delay": `${ms}ms` }) as CSSProperties;
const fmt = (v: number, decimals: number, suffix: string) =>
  v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;

/** Counts up to `to` once `start` is true, writing straight to the DOM (no per-frame React renders). */
function CountUp({
  to,
  decimals = 0,
  suffix = "",
  start,
  delay = 0,
  duration = 1300,
  live = false,
  className = "",
}: {
  to: number;
  decimals?: number;
  suffix?: string;
  start: boolean;
  delay?: number;
  duration?: number;
  /** After counting, keep ticking up gently while true. */
  live?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const value = useRef(to);
  const counted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!start) {
      el.textContent = fmt(0, decimals, suffix);
      return;
    }
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0) / duration));
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = fmt(to * eased, decimals, suffix);
      if (t < 1) raf = requestAnimationFrame(tick);
      else counted.current = true;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, to, decimals, suffix, delay, duration]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !live) return;
    const id = window.setInterval(() => {
      if (!counted.current) return;
      value.current += 1 + Math.floor(Math.random() * 3);
      el.textContent = fmt(value.current, decimals, suffix);
      el.classList.remove("dash-tick");
      void el.offsetWidth; // restart the flash animation
      el.classList.add("dash-tick");
    }, 3200);
    return () => window.clearInterval(id);
  }, [live, decimals, suffix]);

  return (
    <span ref={ref} className={className}>
      {fmt(to, decimals, suffix)}
    </span>
  );
}

function Sparkline({ data, delay }: { data: number[]; delay: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * 100, 22 - ((v - min) / (max - min || 1)) * 18]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    // Drawn in with a left-to-right clip wipe (dash tricks break on non-scaling strokes).
    <svg aria-hidden="true" viewBox="0 0 100 24" preserveAspectRatio="none" className="dash-spark mt-3 block h-6 w-full" style={dl(delay)}>
      <path d={`${line} L100,24 L0,24 Z`} className="dash-area" fill="var(--accent)" style={dl(delay + 500)} />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function OutcomeDashboard() {
  const { ref, inView } = useInView<HTMLDivElement>({ once: false, threshold: 0.25 });
  const [seen, setSeen] = useState(false);
  const [synced, setSynced] = useState(false);

  // Latch the first time the dashboard is seen; the load sequence plays once.
  useEffect(() => {
    if (inView) setSeen(true);
  }, [inView]);

  useEffect(() => {
    if (!seen) return;
    const id = window.setTimeout(() => setSynced(true), T_DONE);
    return () => window.clearTimeout(id);
  }, [seen]);

  const max = FUNNEL[0].n;

  return (
    <section id="product" aria-labelledby="outcomes-title" className="py-24 md:py-32">
      <div className="container-page">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <SectionHeading
            id="outcomes-title"
            eyebrow="Outcome dashboard"
            title={
              <>
                Know which motion <em className="text-accent">earns</em> the meeting.
              </>
            }
            lede="See every workflow’s performance, where leads stall between stages, and how each motion compares with a benchmark range — so you tune what matters."
          />
          <Reveal delay={200}>
            <p className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1.5 font-mono text-[11px] text-ink-2">
              <Info size={13} aria-hidden="true" />
              Illustrative demo data — not customer results
            </p>
          </Reveal>
        </div>

        <div ref={ref} className={`dash reveal card relative mt-12 overflow-hidden shadow-float ${seen ? "is-visible" : ""}`} style={dl(100)}>
          {seen && !synced && <span aria-hidden="true" className="dash-sweep" />}

          {/* App chrome */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
                <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              </span>
              <span className="text-[13px] font-medium text-ink">Outcomes</span>
              <span className="hidden font-mono text-[11px] text-muted sm:inline">/ All workflows · Last 30 days</span>
            </div>
            <div className="flex items-center gap-2">
              <span key={String(synced)} className="status-in hidden items-center gap-1.5 font-mono text-[10.5px] text-muted sm:inline-flex">
                {synced ? (
                  <>
                    <span className="live-dot text-success" aria-hidden="true" /> Updated just now
                  </>
                ) : (
                  <>
                    <span className="orch-spin h-2.5 w-2.5 rounded-full border-[1.5px] border-accent/25 border-t-accent" aria-hidden="true" /> Syncing demo data…
                  </>
                )}
              </span>
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-mono text-[10.5px] text-accent-ink">DEMO DATA</span>
            </div>
          </div>

          {/* KPIs */}
          <dl className="grid grid-cols-2 border-b border-line lg:grid-cols-4">
            {KPIS.map((k, i) => (
              <div
                key={k.label}
                className={`dash-in px-5 py-5 ${i % 2 === 1 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line lg:border-t-0" : ""} ${
                  i === 2 ? "lg:border-l" : ""
                }`}
                style={dl(T_KPI + i * 110)}
              >
                <dt className="flex items-center justify-between text-[12.5px] text-muted">
                  {k.label}
                  {k.live && synced && (
                    <span className="status-in inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-success">
                      <span className="live-dot !h-1.5 !w-1.5" aria-hidden="true" /> Live
                    </span>
                  )}
                </dt>
                <dd className="mt-1.5 font-serif text-[2.1rem] leading-none tracking-tight text-ink tabular-nums">
                  <CountUp to={k.to} decimals={k.decimals} suffix={k.suffix} start={seen} delay={T_KPI + i * 110} live={k.live && inView} />
                </dd>
                <dd className="mt-2 font-mono text-[10.5px] text-muted">{k.note}</dd>
                <dd>
                  <Sparkline data={k.spark} delay={T_KPI + 300 + i * 110} />
                </dd>
              </div>
            ))}
          </dl>

          <div className="grid lg:grid-cols-[1fr_1.15fr]">
            {/* Funnel */}
            <div className="border-b border-line p-5 sm:p-6 lg:border-r lg:border-b-0">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[14px] font-medium text-ink">Conversion by stage</h3>
                <span className="font-mono text-[10.5px] text-muted">leads · stage conv.</span>
              </div>
              <ul className="mt-5 space-y-2">
                {FUNNEL.map((f, i) => {
                  const pct = (f.n / max) * 100;
                  const conv = i === 0 ? null : Math.round((f.n / FUNNEL[i - 1].n) * 100);
                  const at = T_FUNNEL + i * 160;
                  return (
                    <li
                      key={f.stage}
                      className={`grid grid-cols-[88px_1fr_74px] items-center gap-3 rounded-[8px] px-1.5 py-1 ${i === DROP_INDEX ? "dash-flag" : ""}`}
                      style={i === DROP_INDEX ? dl(T_FUNNEL + 5 * 160 + 500) : undefined}
                    >
                      <span className="text-[13px] text-ink-2">{f.stage}</span>
                      <span className="relative h-6 overflow-hidden rounded-[5px] bg-surface-2">
                        <span
                          className="grow-x absolute inset-y-0 left-0 rounded-[5px] bg-accent"
                          style={{ width: `${Math.max(pct, 2.5)}%`, opacity: 1 - i * 0.13, ...dl(at) }}
                        />
                      </span>
                      <span className="text-right font-mono text-[11.5px] tabular-nums text-ink">
                        <CountUp to={f.n} start={seen} delay={at} duration={1000} />
                        <span className="dash-pop ml-1.5 inline-block text-muted" style={dl(at + 700)}>
                          {conv === null ? "—" : `${conv}%`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="dash-in mt-4 text-[12.5px] leading-snug text-muted" style={dl(T_FUNNEL + 5 * 160 + 600)}>
                Biggest drop-off: <span className="text-ink">Engaged → Replied</span>. Suggestion: test a shorter step-2 email.
              </p>
            </div>

            {/* Benchmarks */}
            <div className="p-5 sm:p-6">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[14px] font-medium text-ink">Reply rate vs. benchmark range</h3>
                <span className="flex items-center gap-3 font-mono text-[10.5px] text-muted">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-3 rounded-[2px] bg-success/20 ring-1 ring-success/40" aria-hidden="true" /> range
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-ink" aria-hidden="true" /> yours
                  </span>
                </span>
              </div>
              <ul className="mt-5 space-y-5">
                {WORKFLOWS.map((w, i) => {
                  const below = w.rate < w.low;
                  const at = T_BENCH + i * 180;
                  return (
                    <li key={w.name}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[13px] text-ink">{w.name}</span>
                        <span className="flex items-baseline gap-2">
                          <span className="font-mono text-[12px] tabular-nums text-ink">
                            <CountUp to={w.rate} decimals={1} suffix="%" start={seen} delay={at + 200} duration={1100} />
                          </span>
                          <span
                            className={`dash-pop rounded-full px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em] ${
                              below ? "bg-[#f6e7d3] text-warn" : "bg-success-soft text-success"
                            } ${below ? "dash-ping" : ""}`}
                            style={dl(at + 1250)}
                          >
                            {below ? "Below range" : "Within range"}
                          </span>
                        </span>
                      </div>
                      <div className="relative mt-2 h-3 rounded-full bg-surface-2">
                        <span
                          className="dash-band absolute inset-y-0 rounded-full bg-success/15 ring-1 ring-success/35"
                          style={{ left: `${(w.low / AXIS) * 100}%`, width: `${((w.high - w.low) / AXIS) * 100}%`, ...dl(at) }}
                        />
                        <span
                          className="grow-x absolute inset-y-[5px] left-0 rounded-full bg-ink/15"
                          style={{ width: `${(w.rate / AXIS) * 100}%`, ...dl(at + 200) }}
                        />
                        {/* Full-width track so translateX(%) maps onto the axis */}
                        <span
                          className="dash-marker absolute inset-0"
                          style={{ "--to": `${(w.rate / AXIS) * 100}%`, ...dl(at + 200) } as CSSProperties}
                        >
                          <span
                            className={`absolute top-1/2 left-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface shadow-card ${
                              below ? "bg-warn" : "bg-ink"
                            }`}
                          />
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 flex justify-between font-mono text-[10px] text-muted" aria-hidden="true">
                <span>0%</span>
                <span>10%</span>
                <span>20%</span>
                <span>30%</span>
              </div>
              <p
                className="dash-in mt-5 rounded-[10px] border border-line bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-snug text-ink-2"
                style={dl(T_BENCH + 2 * 180 + 1400)}
              >
                <span className="font-medium text-ink">Closed-lost re-engage</span> is below its range. Flightpath flags it so you can
                adjust targeting or swap in a different library workflow.
              </p>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-[12px] text-muted">
          Dashboard shown with fictional sample data for illustration. Benchmark ranges are placeholders, not published industry figures.
        </p>
      </div>
    </section>
  );
}
