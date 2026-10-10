"use client";

import { useEffect, useRef, useState } from "react";
import { Check, GitBranch, Layers, X } from "lucide-react";
import { ChannelIcon, type Channel } from "./ChannelIcon";
import { SectionHeading } from "./SectionHeading";
import { useInView, usePrefersReducedMotion } from "@/lib/useInView";

type Branch = { condition: string; action: string; channel: Channel };
type Workflow = {
  id: string;
  name: string;
  summary: string;
  channels: Channel[];
  steps: number;
  first: { channel: Channel; label: string; status: string };
  second: { channel: Channel; label: string; status: string };
  signal: string;
  /** Engagement events as they arrive, and the score after each one. */
  events: [string, string, string];
  scores: [number, number, number, number];
  branches: [Branch, Branch, Branch];
  chosen: 0 | 1 | 2;
};

const THRESHOLD = 70;

const WORKFLOWS: Workflow[] = [
  {
    id: "outbound",
    name: "Net-new outbound",
    summary: "Warm up on LinkedIn, follow with a relevant email, escalate on intent.",
    channels: ["linkedin", "email", "call"],
    steps: 6,
    first: { channel: "linkedin", label: "Connection request", status: "Accepted" },
    second: { channel: "email", label: "Email · problem-led intro", status: "Opened ×2" },
    signal: "Clicked pricing page",
    events: ["Opened email · 2nd time", "Visited /pricing", "Clicked pricing link"],
    scores: [18, 41, 58, 78],
    branches: [
      { condition: "High intent", action: "Call task for owner", channel: "call" },
      { condition: "Opened, no click", action: "LinkedIn follow-up", channel: "linkedin" },
      { condition: "No engagement", action: "Pause & recycle in 30d", channel: "action" },
    ],
    chosen: 0,
  },
  {
    id: "inbound",
    name: "Inbound follow-up",
    summary: "Respond fast to form fills and route by fit and engagement.",
    channels: ["email", "linkedin", "meeting"],
    steps: 4,
    first: { channel: "email", label: "Personal reply to form fill", status: "Opened" },
    second: { channel: "linkedin", label: "Profile view + connect", status: "Accepted" },
    signal: "Replied: “Can we talk Thursday?”",
    events: ["Opened reply", "Accepted connection", "Replied: “Can we talk Thursday?”"],
    scores: [24, 39, 55, 92],
    branches: [
      { condition: "Positive reply", action: "Send booking link", channel: "meeting" },
      { condition: "Question", action: "Assign to owner inbox", channel: "email" },
      { condition: "Not a fit", action: "Move to nurture", channel: "action" },
    ],
    chosen: 0,
  },
  {
    id: "reengage",
    name: "Closed-lost re-engage",
    summary: "Re-open stalled deals when timing signals change.",
    channels: ["email", "linkedin", "call"],
    steps: 5,
    first: { channel: "email", label: "“What changed since Q2?”", status: "Delivered" },
    second: { channel: "linkedin", label: "Comment on recent post", status: "Seen" },
    signal: "No opens after 2 touches",
    events: ["No open after 3 days", "No open after 6 days", "No LinkedIn activity"],
    scores: [22, 15, 10, 6],
    branches: [
      { condition: "Engaged", action: "Call task for owner", channel: "call" },
      { condition: "Partial", action: "Try a new contact", channel: "linkedin" },
      { condition: "Silent", action: "Pause & recycle in 60d", channel: "action" },
    ],
    chosen: 2,
  },
];

const STEPS = [
  {
    k: "01",
    title: "Pick a proven workflow",
    body: "Start from the Workflow Library — outbound, inbound and re-engagement motions with channel order and guardrails already set.",
    tags: ["Outbound · Inbound · Re-engage", "Channel order preset"],
  },
  {
    k: "02",
    title: "Flightpath runs the first touches",
    body: "Each lead moves through LinkedIn and email in a coordinated order. Touches never collide, and nothing is sent twice from two tools.",
    tags: ["One sequence per lead", "No double sends"],
  },
  {
    k: "03",
    title: "It listens for engagement",
    body: "Accepts, opens, clicks and replies are read as signals in real time — across every channel the workflow uses.",
    tags: ["Opens · clicks · replies", "Engagement score"],
  },
  {
    k: "04",
    title: "The next action is routed, not scheduled",
    body: "Instead of “wait three days, send step 4”, the engine checks each branch and picks the one that matches what the lead actually did.",
    tags: ["Branch by behaviour", "No fixed timers"],
  },
];

/** Number of beats each step's mini-animation plays through. */
const BEATS = [3, 3, 3, 4];
const BEAT_MS = 700;

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

/**
 * Plays beats 0…length for the given key while `running`. Restarts whenever the key changes,
 * and jumps straight to the end state for reduced motion.
 */
function useBeats(key: string, length: number, running: boolean, reduced: boolean) {
  const [state, setState] = useState({ key, beat: 0 });
  useEffect(() => {
    if (reduced || !running) return;
    let beat = 0;
    setState({ key, beat });
    const id = window.setInterval(() => {
      beat += 1;
      setState({ key, beat });
      if (beat >= length) window.clearInterval(id);
    }, BEAT_MS);
    return () => window.clearInterval(id);
  }, [key, length, running, reduced]);
  if (reduced) return length;
  return state.key === key ? state.beat : 0;
}

export function Orchestration() {
  const [wfIndex, setWfIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [userDriven, setUserDriven] = useState(false);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const isDesktop = useIsDesktop();
  const reduced = usePrefersReducedMotion();
  const { ref: visualRef, inView: visualInView } = useInView<HTMLDivElement>({ once: false, threshold: 0.4 });
  const beat = useBeats(`${wfIndex}-${step}`, BEATS[step], visualInView, reduced);

  // Desktop: scroll position drives the story. A thin band below mid-viewport picks the active step,
  // so React only re-renders when the step actually changes.
  useEffect(() => {
    if (!isDesktop) return;
    const els = stepRefs.current.filter(Boolean) as HTMLLIElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-58% 0px -32% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [isDesktop]);

  // Mobile/tablet: once a step's beats finish, hold briefly and advance — until the user takes over.
  useEffect(() => {
    if (isDesktop || userDriven || !visualInView) return;
    if (reduced) {
      setStep(STEPS.length - 1);
      return;
    }
    if (beat < BEATS[step]) return;
    const id = window.setTimeout(() => setStep((s) => (s + 1) % STEPS.length), 1800);
    return () => window.clearTimeout(id);
  }, [isDesktop, userDriven, reduced, visualInView, beat, step]);

  const choose = (i: number) => {
    setUserDriven(true);
    setStep(i);
  };

  const wf = WORKFLOWS[wfIndex];
  const progress = Math.min(1, beat / BEATS[step]);

  return (
    <section id="how-it-works" aria-labelledby="how-title" className="relative border-t border-line bg-surface/50 py-24 md:py-32">
      <div className="container-page">
        <SectionHeading
          id="how-title"
          eyebrow="Workflow Library + Orchestration Engine"
          title={
            <>
              Choose the motion. <em className="text-accent">Engagement</em> steers it.
            </>
          }
          lede="Flightpath pairs a library of ready-to-run GTM workflows with an engine that routes every lead’s next step from real signals — not arbitrary timers."
        />

        <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
          {/* Visual (sticky) */}
          <div ref={visualRef} className="self-start lg:sticky lg:top-[calc(var(--nav-h)+28px)]">
            <div className="card overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]">
                <WorkflowLibrary active={wfIndex} onSelect={setWfIndex} applying={step === 0 && beat < BEATS[0]} />
                <EngineCanvas wf={wf} step={step} beat={beat} progress={progress} />
              </div>
            </div>

            {/* Compact stepper for smaller screens */}
            <div className="mt-5 lg:hidden">
              <div role="tablist" aria-label="Orchestration steps" className="grid grid-cols-4 gap-1.5">
                {STEPS.map((s, i) => (
                  <button
                    key={s.k}
                    type="button"
                    role="tab"
                    aria-selected={i === step}
                    aria-controls="orchestration-step-panel"
                    onClick={() => choose(i)}
                    className="group pt-2 text-left"
                  >
                    <span className="block h-0.5 overflow-hidden rounded-full bg-line">
                      <span
                        className="block h-full origin-left bg-accent transition-transform duration-700"
                        style={{ transform: `scaleX(${i < step ? 1 : i === step ? progress : 0})` }}
                      />
                    </span>
                    <span className={`mt-2 block font-mono text-[11px] ${i === step ? "text-accent" : "text-muted"}`}>{s.k}</span>
                  </button>
                ))}
              </div>
              <div id="orchestration-step-panel" role="tabpanel" className="mt-3 min-h-[150px]">
                <p key={step} className="status-in font-serif text-[1.65rem] leading-tight text-ink">
                  {STEPS[step].title}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2/85">{STEPS[step].body}</p>
              </div>
            </div>
          </div>

          {/* Narrative steps */}
          <ol className="relative hidden lg:block lg:pt-6">
            {STEPS.map((s, i) => {
              const on = i === step;
              const past = i < step;
              return (
                <li
                  key={s.k}
                  data-step={i}
                  ref={(el) => {
                    stepRefs.current[i] = el;
                  }}
                  className="flex min-h-[62vh] items-start"
                >
                  <button
                    type="button"
                    onClick={() => choose(i)}
                    aria-current={on ? "step" : undefined}
                    className={`group relative w-full rounded-[12px] py-1 pl-5 text-left`}
                  >
                    {/* Rail fills as the step's animation plays */}
                    <span aria-hidden="true" className="absolute top-0 bottom-0 left-0 w-0.5 rounded-full bg-line">
                      <span
                        className="absolute inset-0 origin-top rounded-full bg-accent transition-transform duration-700"
                        style={{ transform: `scaleY(${past ? 1 : on ? Math.max(0.08, progress) : 0})`, opacity: past ? 0.35 : 1 }}
                      />
                    </span>
                    <span className={`font-mono text-[12px] transition-colors ${on ? "text-accent" : "text-muted"}`}>{s.k}</span>
                    <span
                      className={`mt-2 block font-serif text-[1.85rem] leading-[1.1] transition-colors duration-500 md:text-[2.1rem] ${
                        on ? "text-ink" : "text-ink/40"
                      }`}
                    >
                      {s.title}
                    </span>
                    <span
                      className={`mt-3 block max-w-md text-[15.5px] leading-relaxed transition-colors duration-500 ${
                        on ? "text-ink-2/85" : "text-ink-2/40"
                      }`}
                    >
                      {s.body}
                    </span>
                    <span className="mt-4 flex flex-wrap gap-1.5">
                      {s.tags.map((t, k) => (
                        <span
                          key={t}
                          className={`rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-all duration-500 ${
                            on ? "translate-y-0 border-line-strong bg-surface text-ink-2 opacity-100" : "translate-y-1 border-line text-muted opacity-50"
                          }`}
                          style={{ transitionDelay: on ? `${150 + k * 90}ms` : "0ms" }}
                        >
                          {t}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

function WorkflowLibrary({ active, onSelect, applying }: { active: number; onSelect: (i: number) => void; applying: boolean }) {
  return (
    <div className="border-b border-line bg-surface-2/70 p-3 md:border-r md:border-b-0 md:p-4">
      <p className="flex items-center gap-1.5 px-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
        <Layers size={12} aria-hidden="true" /> Workflow library
      </p>
      <div role="radiogroup" aria-label="Choose a workflow" className="mt-2.5 flex gap-2 overflow-x-auto pb-0.5 md:mt-3 md:flex-col">
        {WORKFLOWS.map((w, i) => {
          const selected = i === active;
          return (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(i)}
              className={`relative shrink-0 overflow-hidden rounded-[10px] border px-3 py-2.5 text-left transition-all duration-300 md:w-full ${
                selected ? "border-accent bg-surface shadow-card" : "border-transparent hover:border-line hover:bg-surface/70"
              }`}
            >
              <span className={`block text-[13px] font-medium ${selected ? "text-ink" : "text-ink-2/75"}`}>{w.name}</span>
              <span className="mt-1.5 flex items-center gap-1.5 text-muted">
                {w.channels.map((c) => (
                  <ChannelIcon key={c} channel={c} size={12} />
                ))}
                <span className="ml-1 font-mono text-[10.5px]">{w.steps} steps</span>
              </span>
              {/* "Applying" sweep while the template loads into the canvas */}
              {selected && applying && <span aria-hidden="true" className="orch-sweep" />}
            </button>
          );
        })}
      </div>
      <p className="mt-3 hidden px-1 text-[12px] leading-snug text-muted md:block">{WORKFLOWS[active].summary}</p>
    </div>
  );
}

type NodeState = "hidden" | "idle" | "sending" | "done";

function Node({ state, channel, title, status }: { state: NodeState; channel: Channel; title: string; status: string }) {
  const done = state === "done";
  const sending = state === "sending";
  return (
    <div
      className={`relative flex items-center gap-3 rounded-[10px] border bg-surface px-3 py-2.5 transition-all duration-500 ${
        state === "hidden" ? "translate-y-2 opacity-0" : ""
      } ${done ? "border-accent shadow-card" : sending ? "border-accent/50 ring-4 ring-accent/10" : "border-line"}`}
    >
      <span
        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-500 ${
          done ? "bg-accent text-white" : sending ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"
        }`}
      >
        <ChannelIcon channel={channel} size={14} />
        {sending && <span aria-hidden="true" className="orch-spin absolute -inset-1 rounded-full border-2 border-accent/20 border-t-accent" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{title}</span>
        <span
          key={state}
          className={`status-in mt-0.5 flex items-center gap-1 font-mono text-[10.5px] ${
            done ? "text-success" : sending ? "text-accent" : "text-muted"
          }`}
        >
          {done && <Check size={11} aria-hidden="true" />}
          {done ? status : sending ? "Sending…" : "Queued"}
        </span>
      </span>
    </div>
  );
}

/** Vertical connector; `travelling` sends a lead dot down it. */
function VLine({ on, travelling = false }: { on: boolean; travelling?: boolean }) {
  return (
    <span aria-hidden="true" className="relative mx-auto block h-6 w-px bg-line">
      <span className="absolute inset-0 origin-top bg-accent transition-transform duration-500" style={{ transform: `scaleY(${on ? 1 : 0})` }} />
      {travelling && <span className="orch-travel absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_0_3px_var(--accent-soft)]" />}
    </span>
  );
}

function EngineCanvas({ wf, step, beat, progress }: { wf: Workflow; step: number; beat: number; progress: number }) {
  // Derive every element's state from (step, beat). Later steps show earlier steps' end states.
  const built = (level: number) => step > 0 || beat >= level;
  const n1: NodeState = !built(1) ? "hidden" : step > 1 || (step === 1 && beat >= 1) ? "done" : step === 1 ? "sending" : "idle";
  const n2: NodeState = !built(1) ? "hidden" : step > 1 || (step === 1 && beat >= 3) ? "done" : step === 1 && beat >= 2 ? "sending" : "idle";
  const eventCount = step > 2 ? 3 : step === 2 ? Math.min(beat, 3) : 0;
  const score = wf.scores[eventCount];
  const crossed = score >= THRESHOLD;
  const listening = step >= 2;
  const evaluated = step === 3 ? Math.min(beat, 3) : 0;
  const routed = step === 3 && beat >= 4;
  const chosen = wf.branches[wf.chosen];
  const xs = [60, 180, 300]; // branch columns in a 360-wide viewBox

  const statusLine =
    step === 0
      ? `Applying “${wf.name}” template`
      : step === 1
        ? "Running first touches"
        : step === 2
          ? eventCount === 3
            ? crossed
              ? "Engagement threshold crossed"
              : "Below threshold — staying patient"
            : "Listening for engagement…"
          : routed
            ? `Routed → ${chosen.action}`
            : "Evaluating branches…";

  return (
    <div className="dot-grid relative p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
          <GitBranch size={12} aria-hidden="true" /> Orchestration engine
        </p>
        <span className="truncate rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[10.5px] text-ink-2">{wf.name}</span>
      </div>

      {/* Engine status + beat progress */}
      <div className="mt-3 rounded-[8px] border border-line bg-surface/80 px-3 py-2">
        <p key={statusLine} className="status-in flex items-center gap-2 truncate font-mono text-[11px] text-ink-2">
          <span className={`live-dot ${routed || (step === 2 && crossed) ? "text-success" : "text-accent"}`} aria-hidden="true" />
          {statusLine}
        </p>
        <span aria-hidden="true" className="mt-2 block h-[3px] overflow-hidden rounded-full bg-line">
          <span className="block h-full origin-left rounded-full bg-accent transition-transform duration-700" style={{ transform: `scaleX(${progress})` }} />
        </span>
      </div>

      <div className="mt-4" key={wf.id}>
        <Node state={n1} channel={wf.first.channel} title={wf.first.label} status={wf.first.status} />
        <VLine on={n1 === "done"} travelling={step === 1 && beat >= 1 && beat < 3} />
        <Node state={n2} channel={wf.second.channel} title={wf.second.label} status={wf.second.status} />
        <VLine on={listening} travelling={step === 2 && eventCount < 3} />

        {/* Signal listener */}
        <div
          className={`relative rounded-[10px] border px-3 py-2.5 transition-all duration-500 ${!built(2) ? "translate-y-2 opacity-0" : ""} ${
            listening ? (eventCount === 3 && crossed ? "border-success/50 bg-success-soft/40" : "border-accent/50 bg-accent-soft/40") : "border-dashed border-line-strong bg-surface"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted">
              {listening && eventCount < 3 && <span className="orch-ripple text-accent" aria-hidden="true" />}
              Engagement score
            </span>
            <span className={`font-mono text-[13px] tabular-nums transition-colors ${crossed && listening ? "text-success" : "text-ink"}`}>
              {listening ? score : "—"}
            </span>
          </div>
          <div className="relative mt-2 h-1.5 rounded-full bg-line">
            <div
              className={`absolute inset-0 origin-left rounded-full transition-[transform,background-color] duration-700 ${crossed ? "bg-success" : "bg-accent"}`}
              style={{ transform: `scaleX(${listening ? score / 100 : 0})` }}
            />
            <span aria-hidden="true" className="absolute -top-1 h-3.5 w-px bg-ink/50" style={{ left: `${THRESHOLD}%` }} />
          </div>
          <ul className="mt-2 grid h-[54px] content-start gap-0.5" aria-hidden="true">
            {wf.events.slice(0, eventCount).map((e, i) => (
              <li key={e} className="status-in flex items-center gap-1.5 truncate font-mono text-[10.5px] text-ink-2">
                <span className="text-muted">+{String(i + 1).padStart(2, "0")}</span>
                {e}
              </li>
            ))}
            {listening && eventCount === 0 && <li className="font-mono text-[10.5px] text-muted">Waiting for first signal…</li>}
          </ul>
        </div>

        {/* Branch connectors */}
        <svg aria-hidden="true" className={`block h-10 w-full transition-opacity duration-500 ${built(3) ? "opacity-100" : "opacity-0"}`} viewBox="0 0 360 40" preserveAspectRatio="none">
          {xs.map((x, i) => {
            const isChosen = routed && i === wf.chosen;
            const d = `M180 0 C180 22, ${x} 16, ${x} 40`;
            return (
              <g key={i}>
                <path d={d} pathLength={1} fill="none" strokeWidth={1.2} stroke="var(--line-strong)" />
                <path
                  d={d}
                  pathLength={1}
                  fill="none"
                  strokeWidth={2}
                  className="connector"
                  data-on={isChosen}
                  stroke="var(--success)"
                />
                {isChosen && <path d={d} pathLength={1} fill="none" strokeWidth={3.5} strokeLinecap="round" className="orch-flow" />}
              </g>
            );
          })}
        </svg>

        <div className="relative grid grid-cols-3 gap-2">
          {wf.branches.map((b, i) => {
            const isChosen = routed && i === wf.chosen;
            const checked = i < evaluated;
            const scanning = step === 3 && !routed && i === evaluated;
            const match = i === wf.chosen;
            return (
              <div
                key={b.condition}
                className={`relative min-h-[106px] rounded-[10px] border bg-surface p-2.5 transition-all duration-500 ${!built(3) ? "translate-y-2 opacity-0" : ""} ${
                  isChosen ? "-translate-y-0.5 border-success shadow-card" : scanning ? "border-accent ring-4 ring-accent/10" : "border-line"
                } ${routed && !isChosen ? "opacity-45" : ""}`}
                style={{ transitionDelay: step === 0 ? `${i * 90}ms` : "0ms" }}
              >
                <p className={`font-mono text-[10px] uppercase tracking-[0.08em] ${isChosen ? "text-success" : "text-muted"}`}>{b.condition}</p>
                <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-ink">
                  <ChannelIcon channel={b.channel} size={12} className="mt-0.5 shrink-0 text-muted" />
                  {b.action}
                </p>
                {checked && !routed && (
                  <span
                    className={`status-in absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full text-white ${match ? "bg-success" : "bg-muted"}`}
                    aria-hidden="true"
                  >
                    {match ? <Check size={11} /> : <X size={11} />}
                  </span>
                )}
                {isChosen && (
                  <p className="status-in mt-2 inline-flex items-center gap-1 rounded-full bg-success px-1.5 py-0.5 font-mono text-[9.5px] text-white">
                    <Check size={10} aria-hidden="true" /> Routed
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Confirmation chip */}
        <div className="mt-3 h-7">
          {routed && (
            <p className="orch-pop mx-auto flex w-fit items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 font-mono text-[10.5px] text-surface shadow-card">
              <Check size={11} className="text-[#7fd6b2]" aria-hidden="true" />
              {chosen.action} · logged to audit trail
            </p>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {routed ? `Signal "${wf.signal}" routed the lead to: ${chosen.action}.` : statusLine}
      </p>
    </div>
  );
}
