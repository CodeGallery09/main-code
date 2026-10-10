import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DEMO_HREF } from "@/lib/site";
import { Reveal } from "./Reveal";

export function ClosingCta() {
  return (
    <section id="demo" aria-labelledby="demo-title" className="py-24 md:py-32">
      <div className="container-page">
        <Reveal className="relative overflow-hidden rounded-[20px] bg-ink px-6 py-16 text-center sm:px-12 md:py-24">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
          />
          <div className="relative">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/55">Ready when you are</p>
            <h2 id="demo-title" className="mx-auto mt-5 max-w-3xl font-serif text-[2.6rem] leading-[1.02] text-surface sm:text-6xl md:text-[4.2rem]">
              Put your GTM motion <em className="text-[#a5a1f5]">on autopilot.</em>
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-[16.5px] leading-relaxed text-white/70">
              See a workflow from the library run end to end on your use case — and how the engine decides each lead&rsquo;s next step.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={DEMO_HREF}
                className="btn bg-surface text-ink hover:bg-white focus-visible:outline-[#a5a1f5]"
              >
                Book a demo
                <ArrowRight size={16} className="btn-arrow" aria-hidden="true" />
              </Link>
              <a href="#how-it-works" className="btn border border-white/20 text-white hover:border-white/50 hover:bg-white/5">
                Revisit how it works
              </a>
            </div>
            <p className="mt-6 font-mono text-[11px] text-white/45">30-minute walkthrough · no commitment</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
