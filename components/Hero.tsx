import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DEMO_HREF } from "@/lib/site";
import { HeroJourney } from "./HeroJourney";

// Page-load intro is pure CSS (see `.intro*` in globals.css) so it starts on first paint,
// before hydration, and leaves content visible when JS is off.
const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

function Words({ text, start, step = 70 }: { text: string; start: number; step?: number }) {
  return (
    <>
      {text.split(" ").map((w, i, arr) => (
        <span key={i}>
          <span className="intro-word" style={d(start + i * step)}>
            {w}
          </span>
          {i < arr.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden">
      <div
        className="intro-fade dot-grid pointer-events-none absolute inset-x-0 top-0 h-[560px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        style={d(0)}
      />
      <div className="container-page relative grid items-center gap-14 pt-14 pb-24 md:pt-20 lg:grid-cols-[1.02fr_1fr] lg:gap-10 lg:pt-24 lg:pb-32">
        <div className="max-w-xl">
          <p
            className="intro inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted"
            style={d(60)}
          >
            <span className="live-dot text-success" aria-hidden="true" />
            GTM workflow orchestration
          </p>
          <h1
            id="hero-title"
            className="mt-6 font-serif text-[3.2rem] leading-[0.98] tracking-[-0.015em] text-ink sm:text-[4.2rem] lg:text-[5rem]"
          >
            <Words text="Your GTM motion," start={160} />
            <br />
            <em className="relative inline-block text-accent">
              <Words text="on autopilot." start={400} step={90} />
              {/* Flight-path swoosh that draws under the accent phrase and lands on a dot */}
              <svg
                aria-hidden="true"
                className="intro-swoosh pointer-events-none absolute -bottom-[0.16em] left-0 h-[0.3em] w-full overflow-visible"
                viewBox="0 0 300 24"
                preserveAspectRatio="none"
                style={d(820)}
              >
                <path
                  d="M2 18 C 60 8, 110 4, 160 12 S 250 24, 296 6"
                  pathLength={1}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  opacity="0.55"
                />
              </svg>
              <span aria-hidden="true" className="intro-dot absolute right-0 bottom-0 h-[0.16em] w-[0.16em] rounded-full bg-accent" style={d(1750)} />
            </em>
          </h1>
          <p className="intro mt-7 max-w-[34rem] text-[17px] leading-relaxed text-ink-2/85 sm:text-lg" style={d(700)}>
            Flightpath runs LinkedIn, email and follow-up as one coordinated workflow. Every next step is triggered by
            how a lead actually engages — and every workflow is measured against a benchmark, so you know what&rsquo;s
            working.
          </p>
          <div className="intro mt-9 flex flex-col gap-3 sm:flex-row" style={d(820)}>
            <Link href={DEMO_HREF} className="btn btn-primary">
              Book a demo
              <ArrowRight size={16} className="btn-arrow" aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className="btn btn-secondary">
              See how it works
            </a>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6">
            {[
              ["Coordinated", "channels in one flow"],
              ["Engagement", "decides the next step"],
              ["Benchmarked", "workflow performance"],
            ].map(([t, desc], i) => (
              <div key={t} className="intro" style={d(940 + i * 90)}>
                <dt className="text-sm font-medium text-ink">{t}</dt>
                <dd className="mt-1 text-[13px] leading-snug text-muted">{desc}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="intro-card relative" style={d(380)}>
          <HeroJourney />
        </div>
      </div>
    </section>
  );
}
