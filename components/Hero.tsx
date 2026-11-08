"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Phone } from "lucide-react";
import { DEMO_HREF } from "@/lib/site";
import { pipSay } from "@/lib/pip";
import { ChannelIcon } from "./ChannelIcon";
import { BlackHoleStar, Magnetic, TextReveal } from "./motion";
import { HeroChamber } from "./HeroChamber";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Must match the media query that switches on the sticky layout in globals.css. */
const DESKTOP_MQ = "(min-width: 1100px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)";
/** Scale of the cards while scattered around the headline. */
const S0 = 0.84;

function Num({ to, dec = 0, suffix = "" }: { to: number; dec?: number; suffix?: string }) {
  return (
    <span data-count={to} data-dec={dec} data-suf={suffix}>
      {to.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix}
    </span>
  );
}

function Spark({ path, color }: { path: string; color: string }) {
  return (
    <svg className="spark-draw mt-3 block h-[30px] w-full" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** `scatter`: where the card floats before assembly, as [x, y] fractions of the stage plus a tilt in degrees. */
type HeroCard = { label: string; scatter: [number, number, number]; value?: ReactNode; viz?: ReactNode; note: string };

const CARDS: HeroCard[] = [
  {
    label: "Audiences in motion",
    scatter: [0.11, 0.21, -4],
    value: <Num to={1284} />,
    viz: <Spark path="M0,24 L11,21 L22,22 L33,16 L44,15 L55,16 L66,10 L77,8 L88,9 L100,4" color="currentColor" />,
    note: "across 3 workflows",
  },
  {
    label: "Positive reply rate",
    scatter: [0.89, 0.19, 3.5],
    value: <Num to={6.4} dec={1} suffix="%" />,
    viz: (
      <div className="relative mt-4 h-1.5 rounded-full bg-white/10" aria-hidden="true">
        <span className="absolute inset-y-0 left-[40%] w-[30%] rounded-full bg-white/35" />
        <span className="absolute top-1/2 left-[64%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/60 bg-white" />
      </div>
    ),
    note: "inside the sample benchmark range",
  },
  {
    label: "Meetings booked",
    scatter: [0.09, 0.6, 3],
    value: <Num to={38} />,
    viz: <Spark path="M0,26 L12,24 L24,24 L36,18 L48,20 L60,13 L72,10 L84,12 L100,5" color="currentColor" />,
    note: "last 30 days",
  },
  {
    label: "Engagement score",
    scatter: [0.91, 0.58, -3],
    value: <Num to={76} />,
    viz: (
      <div className="relative mt-4 h-1.5 rounded-full bg-white/10" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 w-[76%] rounded-full bg-white/70" />
        <span className="absolute -top-1 left-[70%] h-3.5 w-px bg-white/50" />
      </div>
    ),
    note: "70+ routes the audience to a call",
  },
  {
    label: "Next action",
    scatter: [0.2, 0.87, -2],
    viz: (
      <span className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-mono text-[12px] text-white/80">
        <Phone size={13} aria-hidden="true" />
        Call task → owner
      </span>
    ),
    note: "chosen by engagement, not a timer",
  },
  {
    label: "Duplicate touches",
    scatter: [0.8, 0.87, 2.5],
    value: (
      <span className="flex items-baseline gap-3">
        <Num to={0} />
        <span className="flex items-center gap-1.5 opacity-60" aria-hidden="true">
          <ChannelIcon channel="linkedin" size={14} />
          <ChannelIcon channel="email" size={15} />
        </span>
      </span>
    ),
    note: "LinkedIn and email on one clock",
  },
];

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLParagraphElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);

  // Count-ups: the server renders final values (correct without JS); the client replays them once.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = Array.from(sectionRef.current!.querySelectorAll<HTMLElement>("[data-count]"));
    const t0 = performance.now() + 450;
    let raf = 0;
    const fmt = (v: number, dec: number, suf: string) =>
      v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
    const tick = (now: number) => {
      const t = clamp((now - t0) / 1400, 0, 1), k = 1 - Math.pow(1 - t, 4);
      els.forEach((el) => {
        el.textContent = fmt(Number(el.dataset.count) * k, Number(el.dataset.dec), el.dataset.suf || "");
      });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Scroll-driven second act (desktop only). The editorial stage — headline, call to action and the
  // object — lifts away, and the six cards glide out of the dark into their grid slots and merge
  // into one overview pane.
  useEffect(() => {
    const section = sectionRef.current!, stage = stickyRef.current!, copy = copyRef.current!;
    const orb = orbRef.current!;
    const chrome = [bgRef.current!, headRef.current!, footRef.current!];
    const cue = cueRef.current!;
    const cards = Array.from(section.querySelectorAll<HTMLElement>("[data-hcard]"));
    const mq = window.matchMedia(DESKTOP_MQ);
    let geo: { dx: number; dy: number; r: number }[] = [];
    let stickTop = 0, active = false, assembled = false, said = false, raf = 0;

    const clear = () => {
      cards.forEach((c) => { c.style.transform = ""; c.style.removeProperty("--float"); });
      copy.removeAttribute("style");
      orb.removeAttribute("style");
      section.style.removeProperty("--m");
      chrome.forEach((e) => e.removeAttribute("style"));
      cue.removeAttribute("style");
      section.classList.remove("is-ready", "is-assembling", "is-assembled");
    };
    const measure = () => {
      stickTop = parseFloat(getComputedStyle(stage).top) || 0;
      cards.forEach((c) => { c.style.transform = "none"; });
      const sr = stage.getBoundingClientRect();
      geo = cards.map((c, i) => {
        const r = c.getBoundingClientRect();
        const [fx, fy, rot] = CARDS[i].scatter;
        const hw = (r.width * S0) / 2 + 18, hh = (r.height * S0) / 2 + 14;
        const sx = clamp(fx * sr.width, hw, sr.width - hw), sy = clamp(fy * sr.height, hh, sr.height - hh);
        return { dx: sx - (r.left - sr.left + r.width / 2), dy: sy - (r.top - sr.top + r.height / 2), r: rot };
      });
    };
    const update = () => {
      raf = 0;
      if (!active) return;
      const span = section.offsetHeight - stage.offsetHeight;
      const p = clamp((stickTop - section.getBoundingClientRect().top) / span, 0, 1);
      cards.forEach((c, i) => {
        const g = geo[i], t = easeInOut(clamp((p - 0.03 - i * 0.03) / 0.56, 0, 1)), k = 1 - t;
        c.style.transform = `translate3d(${(g.dx * k).toFixed(1)}px,${(g.dy * k).toFixed(1)}px,0) rotate(${(g.r * k).toFixed(2)}deg) scale(${(S0 + (1 - S0) * t).toFixed(3)})`;
        c.style.setProperty("--float", k.toFixed(3));
        // The cards are not in the room for act one: they surface out of the dark,
        // one after another, as the headline is lifting away.
        c.style.opacity = clamp((p - 0.06 - i * 0.022) / 0.16, 0, 1).toFixed(3);
      });
      // Cards finish gliding home by p~0.74; then their outlines dissolve into the single card behind them.
      const m = easeInOut(clamp((p - 0.72) / 0.24, 0, 1));
      section.style.setProperty("--m", m.toFixed(3));
      const co = clamp((p - 0.04) / 0.26, 0, 1);
      copy.style.opacity = (1 - co).toFixed(3);
      copy.style.transform = `translateY(${(-70 * co).toFixed(1)}px)`;
      copy.style.visibility = co >= 1 ? "hidden" : "";
      // The object recedes rather than fading out flat: it is meant to read as having moved away.
      const oo = clamp((p - 0.02) / 0.34, 0, 1);
      orb.style.opacity = (1 - oo).toFixed(3);
      // The -50% keeps the centring the stylesheet gives it: this transform replaces that one.
      orb.style.transform = `translate3d(${(70 * oo).toFixed(1)}px, calc(-50% - ${(26 * oo).toFixed(1)}px), 0) scale(${(1 - 0.22 * oo).toFixed(3)})`;
      orb.style.visibility = oo >= 1 ? "hidden" : "";
      const fo = clamp((p - 0.26) / 0.34, 0, 1);
      chrome.forEach((e) => { e.style.opacity = fo.toFixed(3); });
      chrome[0].style.transform = `scale(${(0.96 + 0.04 * fo).toFixed(3)})`;
      cue.style.opacity = (1 - clamp(p / 0.06, 0, 1)).toFixed(3);
      const asm = p > 0.95;
      if (asm !== assembled) {
        assembled = asm;
        section.classList.toggle("is-assembled", asm);
        section.classList.toggle("is-assembling", !asm);
        if (asm && !said) {
          said = true;
          pipSay("Six cards, one overview. That's Flightpath on a single screen.", 4200);
        }
      }
    };
    const req = () => { if (!raf) raf = requestAnimationFrame(update); };
    const configure = () => {
      active = mq.matches;
      if (!active) { clear(); return; }
      assembled = false;
      section.classList.add("is-assembling");
      measure();
      update();
      section.classList.add("is-ready");
    };

    configure();
    const onResize = () => { if (active) { measure(); req(); } };
    window.addEventListener("scroll", req, { passive: true });
    window.addEventListener("resize", onResize);
    mq.addEventListener("change", configure);
    document.fonts?.ready.then(() => { if (active) { measure(); req(); } });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", req);
      window.removeEventListener("resize", onResize);
      mq.removeEventListener("change", configure);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="top"
      data-pip-section="hero"
      data-nav-dark
      aria-labelledby="hero-title"
      className="hero"
    >
      <div ref={stickyRef} className="hero-sticky">
        {/* The room the object hangs in. */}
        <HeroChamber />

        <div className="hero-wrap container-page relative pt-16 pb-20 md:pt-24">
          <div ref={orbRef} className="hero-orb">
            <BlackHoleStar />
            {/* The object is MoM-BH*-1, the JWST black-hole-star candidate: a black
                hole inside an envelope of hydrogen. The caption labels the picture,
                the way the reference does — it is not a claim about the product. */}
            <p className="hero-orb-caption">JWST / MoM-BH*-1 / z &asymp; 10.2</p>
          </div>

          <div className="hero-copy">
            <div ref={copyRef}>
              <p className="hero-eyebrow intro" style={d(0)}>
                <span className="hero-eyebrow-rule" aria-hidden="true" />
                Field study / 001 — GTM orchestration
              </p>

              <h1 id="hero-title" className="hero-title">
                <TextReveal text="Your GTM motion," as="span" className="hero-title-caps" immediate delay={220} step={70} />
                <TextReveal text="on autopilot." as="em" className="hero-title-script" immediate delay={520} step={90} />
              </h1>

              <p className="hero-lede intro" style={d(900)}>
                LinkedIn and email run as one workflow. Flightpath reads how every audience engages and
                routes the next step itself.
              </p>

              <div className="hero-actions intro" style={d(1040)}>
                <Magnetic strength={9}>
                  <Link href={DEMO_HREF} className="hero-cta">
                    Book a demo
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </Link>
                </Magnetic>
                <a href="#journey" className="hero-link">
                  See how it works
                </a>
              </div>

              <p className="hero-meta intro" style={d(1200)}>
                <span className="hero-meta-rule" aria-hidden="true" />
                LinkedIn + email / one clock / every workflow benchmarked
              </p>
            </div>
          </div>

          <div className="hero-frame" id="product">
            <div ref={bgRef} className="hero-frame-bg" aria-hidden="true" />
            <div className="hero-frame-in">
              <div ref={headRef} className="hero-frame-head flex items-center justify-between gap-3 px-1 pb-3.5">
                <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-white/70">Overview</span>
                <p className="hero-status font-mono text-[11px] uppercase tracking-[0.1em] text-white/45">
                  <span className="when-busy">Assembling…</span>
                  <span className="when-done items-center gap-2">
                    <span className="live-dot" aria-hidden="true" />
                    In sync
                  </span>
                </p>
              </div>
              <ul className="hero-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4" aria-label="Sample workflow metrics">
                {CARDS.map((c, i) => (
                  <li key={c.label} data-hcard className="hcard" style={{ "--i": i } as CSSProperties}>
                    <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/45">{c.label}</span>
                    {c.value && <div className="hcard-value">{c.value}</div>}
                    {c.viz}
                    <p className="mt-auto pt-3 text-[13px] text-white/45">{c.note}</p>
                  </li>
                ))}
              </ul>
              <p ref={footRef} className="hero-frame-foot mt-3 px-1 text-[12px] text-white/40">
                Illustrative sample data, not customer results.
              </p>
            </div>
          </div>
        </div>

        <div
          ref={cueRef}
          aria-hidden="true"
          className="hero-cue absolute bottom-5 left-1/2 -translate-x-1/2 flex-col items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40"
        >
          <span className="cue-mouse" />
          Scroll
        </div>
      </div>
    </section>
  );
}
