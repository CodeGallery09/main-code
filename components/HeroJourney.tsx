"use client";

import { useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import { ChannelIcon, type Channel } from "./ChannelIcon";
import { useInView, usePrefersReducedMotion } from "@/lib/useInView";

const FINAL = 4;
const STEP_MS = 2200;

const SCORE = [18, 34, 52, 76, 76];
const THRESHOLD = 70;

const LOG: { t: string; text: string }[] = [
  { t: "09:12", text: "LinkedIn connection request sent" },
  { t: "11:47", text: "Accepted → email step queued" },
  { t: "14:03", text: "Email opened (2nd time)" },
  { t: "14:05", text: "Clicked /pricing → threshold crossed" },
  { t: "14:05", text: "Call task created for owner" },
];

type Row = { channel: Channel; title: string; detail: string; activeAt: number; doneAt: number; doneLabel: string };

const ROWS: Row[] = [
  { channel: "linkedin", title: "LinkedIn", detail: "Connection request", activeAt: 0, doneAt: 1, doneLabel: "Accepted" },
  { channel: "email", title: "Email · step 2", detail: "“Quick question on rep handoffs”", activeAt: 1, doneAt: 3, doneLabel: "Opened ×2 · Clicked" },
  { channel: "call", title: "Next action", detail: "Chosen by engagement, not a timer", activeAt: 3, doneAt: 4, doneLabel: "Call task → owner" },
];

export function HeroJourney() {
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>({ once: false, threshold: 0.2 });
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (reduced || !inView) return;
    const id = window.setInterval(() => {
      // FINAL + 1 holds the routed state for one extra beat before looping.
      setPhase((p) => (p >= FINAL + 1 ? 0 : p + 1));
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [reduced, inView]);

  const p = reduced ? FINAL : Math.min(phase, FINAL);
  const score = SCORE[p];
  const routed = p >= FINAL;

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[540px] lg:mr-0 lg:ml-auto">
      <div
        className="card relative overflow-hidden shadow-float"
        role="img"
        aria-label="Product preview: a lead moves from a LinkedIn connection to an email that is opened and clicked, which triggers a call task."
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Lead journey</span>
            <span className="hidden rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted min-[400px]:inline">
              Outbound · ICP-A
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-success">
            <span className="live-dot" aria-hidden="true" />
            Live
          </span>
        </div>

        <div className="flex items-center gap-3 px-5 pt-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-medium text-accent-ink">
            MR
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-ink">Maya Reyes</p>
            <p className="truncate text-[13px] text-muted">Head of RevOps · Example Co. (sample lead)</p>
          </div>
        </div>

        <ol className="intro-rows relative px-5 pt-5 pb-2">
          {ROWS.map((r, i) => {
            const done = p >= r.doneAt;
            const active = !done && p >= r.activeAt;
            const last = i === ROWS.length - 1;
            return (
              <li key={r.title} className="relative flex gap-3.5 pb-5 last:pb-3">
                {!last && (
                  <span aria-hidden="true" className="absolute top-9 bottom-0 left-[17px] w-px bg-line">
                    <span
                      className="block h-full w-full origin-top bg-accent transition-transform duration-700"
                      style={{ transform: `scaleY(${done ? 1 : 0})` }}
                    />
                  </span>
                )}
                <span
                  className={`relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors duration-500 ${
                    done
                      ? last
                        ? "border-success bg-success text-white"
                        : "border-accent bg-accent text-white"
                      : active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-surface text-muted"
                  }`}
                >
                  <ChannelIcon channel={r.channel} size={15} />
                </span>
                <div
                  className={`flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-1.5 rounded-[10px] border px-3.5 py-2.5 transition-colors duration-500 ${
                    last && routed
                      ? "border-success/40 bg-success-soft/60"
                      : active
                        ? "border-accent/40 bg-accent-soft/40"
                        : "border-line bg-surface"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">{r.title}</p>
                    <p className="text-[12.5px] text-muted">{r.detail}</p>
                  </div>
                  <span
                    key={`${done}-${active}`}
                    className={`status-in mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10.5px] ${
                      done
                        ? last
                          ? "bg-success text-white"
                          : "bg-success-soft text-success"
                        : active
                          ? "bg-accent-soft text-accent-ink"
                          : "bg-surface-2 text-muted"
                    }`}
                  >
                    {done ? (
                      <Check size={11} aria-hidden="true" />
                    ) : active ? (
                      <span className="live-dot !h-1.5 !w-1.5" aria-hidden="true" />
                    ) : (
                      <Clock size={11} aria-hidden="true" />
                    )}
                    {done ? r.doneLabel : active ? "Watching" : "Queued"}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mx-5 mb-5 rounded-[10px] border border-line bg-surface-2 px-4 py-3.5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">Engagement score</span>
            <span className="font-mono text-[13px] tabular-nums text-ink">{score}</span>
          </div>
          <div className="relative mt-2.5 h-1.5 rounded-full bg-line">
            <div
              className={`absolute inset-0 origin-left rounded-full transition-[transform,background-color] duration-700 ${
                score >= THRESHOLD ? "bg-success" : "bg-accent"
              }`}
              style={{ transform: `scaleX(${score / 100})` }}
            />
            <span aria-hidden="true" className="absolute -top-1 h-3.5 w-px bg-ink/50" style={{ left: `${THRESHOLD}%` }} />
          </div>
          <p className="mt-2 text-[11.5px] text-muted">Route to a call when score ≥ {THRESHOLD}</p>
        </div>
      </div>

      <div aria-hidden="true" className="intro-float absolute -bottom-20 -left-4 hidden w-[272px] sm:block lg:-left-16">
        <div className="float-slow card px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Event stream</p>
          <ul className="mt-2 space-y-1.5">
            {LOG.slice(Math.max(0, p - 2), p + 1).map((e) => (
              <li key={e.text} className="status-in flex gap-2 font-mono text-[11px] leading-snug">
                <span className="text-muted">{e.t}</span>
                <span className="text-ink-2">{e.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
