import type { CSSProperties, ReactNode } from "react";
import { Activity } from "lucide-react";
import { ChannelIcon } from "../ChannelIcon";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

const STEPS: { label: string; icon: ReactNode; tone?: "signal" | "action" }[] = [
  { label: "LinkedIn", icon: <ChannelIcon channel="linkedin" size={15} /> },
  { label: "Email", icon: <ChannelIcon channel="email" size={16} /> },
  { label: "Engagement signal", icon: <Activity size={16} strokeWidth={1.8} aria-hidden="true" />, tone: "signal" },
  { label: "Next action", icon: <ChannelIcon channel="action" size={16} />, tone: "action" },
];

/** Small decorative flow: LinkedIn → Email → Engagement signal → Next action. */
export function DemoWorkflow() {
  return (
    <figure data-pip="book-flow" className="card intro-card relative mx-auto mt-12 max-w-2xl px-4 py-5 sm:px-8 sm:py-6" style={d(420)}>
      <figcaption className="sr-only">
        Example workflow: a LinkedIn touch, then an email, then an engagement signal decides the next action.
      </figcaption>
      <ol className="grid grid-cols-[repeat(4,minmax(0,1fr))] items-start" aria-hidden="true">
        {STEPS.map((s, i) => (
          <li key={s.label} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span className="absolute top-[19px] right-1/2 left-[-50%] mx-6 h-px bg-line-strong">
                <span className="bd-line absolute inset-0 bg-accent/85" style={d(700 + i * 260)} />
              </span>
            )}
            <span
              className={`bd-node relative flex h-10 w-10 items-center justify-center rounded-full border bg-surface ${
                s.tone === "action"
                  ? "border-accent/40 text-accent-ink"
                  : s.tone === "signal"
                    ? "border-success/35 text-success"
                    : "border-line-strong text-ink-2"
              }`}
              style={d(560 + i * 260)}
            >
              {s.icon}
              {s.tone === "action" && <span className="bd-ring absolute inset-0 rounded-full" style={d(1700)} />}
            </span>
            <span className="intro mt-2.5 text-[12px] leading-tight text-ink-2 sm:text-[13px]" style={d(620 + i * 260)}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
