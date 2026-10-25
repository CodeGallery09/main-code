"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, Gauge, Mail, MessageSquare, Pause, Phone, RotateCcw, Zap } from "lucide-react";
import { ChannelIcon } from "./ChannelIcon";
import { Reveal } from "./Reveal";
import { useInView, usePrefersReducedMotion } from "@/lib/useInView";
import { pipSay, setPipBusy } from "@/lib/pip";

type Tone = "on" | "good" | "skip";
type StepStatus = { text: string; tone: Tone };
type Scenario = {
  label: string;
  sub: string;
  score: number;
  signals: string[];
  /** Status of the connect, message and email steps. */
  steps: [StepStatus, StepStatus, StepStatus];
  outcome: 0 | 1 | 2;
  say: [string, string];
};

const SCENARIOS: Scenario[] = [
  {
    label: "Replies on LinkedIn",
    sub: "Hot",
    score: 82,
    signals: ["Accepted", "Replied on LinkedIn"],
    steps: [
      { text: "Accepted · day 2", tone: "good" },
      { text: "Replied · day 3", tone: "good" },
      { text: "Skipped · she replied", tone: "skip" },
    ],
    outcome: 0,
    say: ["She replied on LinkedIn, so the email step is skipped. No double sends.", "Score 82. Over 70, so her owner gets a call task."],
  },
  {
    label: "Opens the email",
    sub: "Warm",
    score: 58,
    signals: ["Accepted", "Opened 3×", "Clicked"],
    steps: [
      { text: "Accepted · day 2", tone: "good" },
      { text: "No reply yet", tone: "on" },
      { text: "Opened 3× · clicked", tone: "good" },
    ],
    outcome: 1,
    say: ["She opened the email three times and clicked. That's a signal.", "Score 58. Warm, not hot, so a value email goes next."],
  },
  {
    label: "Goes quiet",
    sub: "Cold",
    score: 12,
    signals: ["No accept", "No opens"],
    steps: [
      { text: "Pending", tone: "on" },
      { text: "Skipped · not connected", tone: "skip" },
      { text: "Sent · no opens", tone: "on" },
    ],
    outcome: 2,
    say: ["No accept, no opens. Flightpath stops pushing.", "Score 12. She's paused and re-engaged later, not spammed."],
  },
];

const OUTCOMES = [
  { icon: <Phone size={14} aria-hidden="true" />, label: "Call task → owner", rule: "70+" },
  { icon: <Mail size={14} aria-hidden="true" />, label: "Value email", rule: "30–69" },
  { icon: <Pause size={14} aria-hidden="true" />, label: "Pause 60 days", rule: "under 30" },
];

const ROWS: { icon: ReactNode; title: string; meta: string }[] = [
  { icon: <Zap size={15} aria-hidden="true" />, title: "Enters Net-new outbound", meta: "Day 1 · from an audience list" },
  { icon: <ChannelIcon channel="linkedin" size={14} />, title: "LinkedIn connection request", meta: "Day 1" },
  { icon: <MessageSquare size={15} aria-hidden="true" />, title: "LinkedIn message", meta: "Day 2 · once she accepts" },
  { icon: <Mail size={15} aria-hidden="true" />, title: "Follow-up email", meta: "Day 4 · only if there's no reply" },
  { icon: <Gauge size={15} aria-hidden="true" />, title: "Engagement score", meta: "Every signal, every channel" },
  { icon: <Check size={15} aria-hidden="true" />, title: "Next action", meta: "Routed by the score" },
];
const LAST_BEAT = ROWS.length; // one extra beat for the benchmark line

const PILL: Record<Tone, string> = {
  on: "bg-accent-soft text-accent-ink",
  good: "bg-success-soft text-success",
  skip: "bg-surface-2 text-muted line-through decoration-muted/60",
};

export function Journey() {
  const [scenario, setScenario] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [beat, setBeat] = useState(-1);
  const [tokenY, setTokenY] = useState<number | null>(null);
  const [rail, setRail] = useState({ top: 0, height: 0 });
  const reduced = usePrefersReducedMotion();
  const { ref: cardRef, inView } = useInView<HTMLDivElement>({ threshold: 0.35 });
  const listRef = useRef<HTMLOListElement>(null);
  const dotRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const sc = SCENARIOS[scenario];

  // Beat sequencer: plays once the card is in view, and again on every scenario change or replay.
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setBeat(LAST_BEAT);
      return;
    }
    setBeat(-1);
    setPipBusy(true);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 350;
    for (let b = 0; b <= LAST_BEAT; b++) {
      const at = t;
      timers.push(
        setTimeout(() => {
          setBeat(b);
          if (b === 3) pipSay(SCENARIOS[scenario].say[0], 4200);
          if (b === 5) pipSay(SCENARIOS[scenario].say[1], 4600);
          if (b === LAST_BEAT) setPipBusy(false);
        }, at),
      );
      t += b === 4 ? 1300 : b === 3 ? 1100 : 820;
    }
    return () => {
      timers.forEach(clearTimeout);
      setPipBusy(false);
    };
  }, [inView, reduced, scenario, runKey]);

  // The halo and rail fill follow the current step.
  useLayoutEffect(() => {
    const place = () => {
      const dots = dotRefs.current, list = listRef.current;
      const first = dots[0], last = dots[ROWS.length - 1];
      if (!first || !last || !list) return;
      const top = list.getBoundingClientRect().top;
      const c = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return r.top - top + r.height / 2; };
      setRail({ top: c(first), height: c(last) - c(first) });
      const cur = dots[Math.min(Math.max(beat, 0), ROWS.length - 1)];
      setTokenY(cur ? c(cur) : null);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [beat, scenario]);

  // Score count-up when the score step is reached.
  useEffect(() => {
    const el = scoreRef.current;
    if (!el) return;
    if (beat < 4) {
      el.textContent = "–";
      return;
    }
    if (reduced) {
      el.textContent = String(sc.score);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / 1000);
      el.textContent = String(Math.round(sc.score * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [beat >= 4, sc.score, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (i: number) => {
    if (i === scenario) setRunKey((k) => k + 1);
    else setScenario(i);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const next = (scenario + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : SCENARIOS.length - 1)) % SCENARIOS.length;
    setScenario(next);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[next])?.focus();
  };

  const reached = (i: number) => beat >= i;
  const fill = rail.height && tokenY != null && beat >= 0 ? (tokenY - rail.top) / rail.height : 0;

  return (
    <section id="journey" data-pip-section="journey" aria-labelledby="journey-title" className="border-t border-line py-24 md:py-32">
      <div className="container-page grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <Reveal>
          <p className="eyebrow">The customer journey</p>
          <h2 id="journey-title" className="display mt-4 text-[2.4rem] text-ink sm:text-5xl lg:text-[3.2rem]">
            An audience&rsquo;s whole journey, <em>on one clock.</em>
          </h2>
          <p className="mt-5 max-w-md text-[18px] leading-relaxed text-ink-2">
            Pick how Maya responds. Flightpath reads every signal, skips what&rsquo;s no longer needed and routes her next
            step.
          </p>

          <p className="mt-9 font-mono text-[11px] uppercase tracking-[0.12em] text-muted" id="journey-pick">
            How does Maya respond?
          </p>
          <div role="radiogroup" aria-labelledby="journey-pick" onKeyDown={onKey} className="jr-pick mt-3 grid gap-2.5 sm:max-w-md">
            {SCENARIOS.map((s, i) => {
              const on = i === scenario;
              return (
                <button
                  key={s.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => choose(i)}
                  className={`glass-row flex items-center justify-between gap-3 rounded-[16px] border px-4 py-3 text-left transition-colors duration-200 ${
                    on ? "border-accent bg-surface shadow-card" : "border-line bg-surface/50 hover:border-line-strong hover:bg-surface"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${on ? "border-accent" : "border-line-strong"}`}
                    >
                      {on && <span className="jr-radio-dot h-2 w-2 rounded-full bg-accent" />}
                    </span>
                    <span className="text-[15px] font-medium text-ink">{s.label}</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted">{s.sub} · score {s.score}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-6 max-w-md text-[12.5px] text-muted">
            Sample audience: Maya Reyes, Head of RevOps at Example Co. Illustrative data and example routing rules.
          </p>
        </Reveal>

        <div ref={cardRef} id="journey-card" className={`jr-card card relative overflow-hidden ${inView ? "is-in" : ""}`}>
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span
                data-live={beat >= 0 && beat < LAST_BEAT}
                className="jr-avatar flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-surface"
                aria-hidden="true"
              >
                MR
              </span>
              <div>
                <p className="text-[14.5px] font-semibold text-ink">Maya Reyes</p>
                <p className="text-[12.5px] text-muted">Head of RevOps · Example Co.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="tag-sample hidden sm:inline">Sample</span>
              <button
                type="button"
                onClick={() => setRunKey((k) => k + 1)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[12.5px] text-ink-2 transition-colors hover:border-ink hover:text-ink"
              >
                <RotateCcw size={13} aria-hidden="true" />
                Replay
              </button>
            </div>
          </div>

          <ol ref={listRef} className="relative px-5 py-5 sm:px-6" aria-label={`Maya's journey when she ${sc.label.toLowerCase()}`}>
            {/* rail + progress fill + moving halo */}
            <span aria-hidden="true" className="absolute left-[38px] w-px bg-line sm:left-[42px]" style={{ top: rail.top, height: rail.height }} />
            <span
              aria-hidden="true"
              className="jr-rail-fill absolute left-[38px] w-px bg-accent sm:left-[42px]"
              style={{ top: rail.top, height: rail.height, transform: `scaleY(${fill})` }}
            />
            {tokenY != null && beat >= 0 && (
              <span
                aria-hidden="true"
                className="jr-token pointer-events-none absolute top-0 left-[18px] h-[42px] w-[42px] rounded-full border-2 border-accent shadow-[0_0_0_6px_rgb(10_10_10/0.14)] sm:left-[22px]"
                style={{ transform: `translateY(${tokenY - 21}px)` }}
              />
            )}

            {ROWS.map((row, i) => {
              const status = i === 0 ? ({ text: "Started", tone: "on" } as StepStatus) : i <= 3 ? sc.steps[i - 1] : null;
              const tone = status?.tone ?? "on";
              return (
                <li
                  key={row.title}
                  className={`jr-row relative grid grid-cols-[40px_minmax(0,1fr)] items-start gap-x-4 py-2.5 sm:grid-cols-[40px_minmax(0,1fr)_auto] ${
                    reached(i) ? "is-on" : ""
                  } ${tone === "skip" ? "is-skip" : tone === "good" ? "is-good" : ""}`}
                >
                  <span
                    ref={(el) => {
                      dotRefs.current[i] = el;
                    }}
                    className="jr-dot relative z-[1] flex h-9 w-9 items-center justify-center justify-self-center rounded-full border border-line-strong bg-surface text-muted"
                  >
                    {row.icon}
                  </span>
                  <div className="jr-body min-w-0 pt-1">
                    <p className={`text-[14.5px] font-medium text-ink ${reached(i) && tone === "skip" ? "text-muted line-through decoration-line-strong" : ""}`}>
                      {row.title}
                    </p>
                    <p className="text-[12.5px] text-muted">{row.meta}</p>

                    {i === 4 && (
                      <div className="mt-3 max-w-sm">
                        <div className="relative h-2 rounded-full bg-surface-2">
                          <span
                            className={`jr-gauge-fill absolute inset-y-0 left-0 w-full rounded-full bg-accent ${reached(4) ? "is-on" : ""}`}
                            style={{ transform: `scaleX(${reached(4) ? sc.score / 100 : 0})` }}
                          />
                          {[30, 70].map((m) => (
                            <span key={m} className="absolute -top-1 h-4 w-px bg-ink/40" style={{ left: `${m}%` }} aria-hidden="true" />
                          ))}
                        </div>
                        <div className="relative mt-1 h-4 font-mono text-[10px] text-muted" aria-hidden="true">
                          <span className="absolute -translate-x-1/2" style={{ left: "30%" }}>30</span>
                          <span className="absolute -translate-x-1/2" style={{ left: "70%" }}>70</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {sc.signals.map((s) => (
                            <span key={s} className="jr-status rounded-full border border-line px-2 py-0.5 font-mono text-[10.5px] text-ink-2">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {i === 5 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {OUTCOMES.map((o, k) => {
                          const chosen = reached(5) && k === sc.outcome;
                          const dim = reached(5) && k !== sc.outcome;
                          return (
                            <span
                              key={o.label}
                              className={`jr-out ${chosen ? "is-chosen" : ""} inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] ${
                                chosen
                                  ? "scale-[1.03] border-accent bg-accent-soft font-medium text-accent-ink"
                                  : dim
                                    ? "border-line text-muted opacity-50"
                                    : "border-line-strong text-ink-2"
                              }`}
                            >
                              {o.icon}
                              {o.label}
                              <span className="font-mono text-[10px] opacity-70">{o.rule}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {status && (
                    <span className={`jr-status col-start-2 mt-2 w-fit rounded-full px-2.5 py-1 font-mono text-[11px] sm:col-start-auto sm:mt-1 ${PILL[status.tone]}`}>
                      {status.text}
                    </span>
                  )}
                  {i === 4 && (
                    <span className="jr-status col-start-2 mt-2 w-fit font-serif text-[2rem] leading-none text-ink sm:col-start-auto sm:mt-0">
                      <span ref={scoreRef}>–</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <div
            className={`flex items-center gap-2 border-t border-line bg-surface-2/60 px-5 py-3 text-[12.5px] text-ink-2 transition-opacity duration-500 sm:px-6 ${
              beat >= LAST_BEAT ? "opacity-100" : "opacity-40"
            }`}
          >
            <Check size={14} className={`jr-check text-success ${beat >= LAST_BEAT ? "is-on" : ""}`} aria-hidden="true" />
            Logged and benchmarked against the workflow&rsquo;s range.
          </div>
          <p className="sr-only" aria-live="polite">
            {beat >= 5 ? `Maya's next action: ${OUTCOMES[sc.outcome].label}, engagement score ${sc.score}.` : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
