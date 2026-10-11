import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { DemoForm } from "@/components/demo/DemoForm";
import { DemoWorkflow } from "@/components/demo/DemoWorkflow";

export const metadata: Metadata = {
  title: "Book a demo — Flightpath",
  description:
    "See how Flightpath coordinates your outreach, responds to lead engagement, and helps your team understand what works.",
};

// Rendered per request so the setup note always reflects the server's current delivery config.
export const dynamic = "force-dynamic";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

const AGENDA = [
  "Your current outbound workflow and biggest bottlenecks.",
  "Which GTM motion fits your audience and sales team.",
  "How engagement-triggered orchestration and performance benchmarking work.",
  "What a practical rollout could look like for your team.",
];

export default function BookDemoPage() {
  // Server-only check; the secret itself never reaches the client.
  const deliveryConfigured = Boolean(process.env.DEMO_REQUEST_WEBHOOK_URL);

  return (
    <>
      <Navbar />
      <main id="main">
        <section id="top" data-pip-section="book-intro" aria-labelledby="book-demo-title" className="relative overflow-hidden">
          <div
            className="intro-fade dot-grid pointer-events-none absolute inset-x-0 top-0 h-[420px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
            style={d(0)}
          />
          <div className="container-page relative pt-14 pb-4 text-center md:pt-20">
            <p className="eyebrow intro" style={d(60)}>
              Let&rsquo;s talk GTM
            </p>
            <h1
              id="book-demo-title"
              className="intro mx-auto mt-5 max-w-3xl font-serif [&_em]:not-italic [&_em]:text-accent-ink text-[2.6rem] leading-[1.02] tracking-[-0.01em] text-ink sm:text-6xl md:text-[4.1rem]"
              style={d(140)}
            >
              Let&rsquo;s find the right GTM motion <em>for your team.</em>
            </h1>
            <p className="intro mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2/85" style={d(260)}>
              See how Flightpath coordinates your outreach, responds to lead engagement, and helps your team understand
              what works.
            </p>
            <DemoWorkflow />
          </div>
        </section>

        <section data-pip-section="book-form" aria-label="Book a demo" className="py-16 md:py-24">
          <div className="container-page grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
            <div className="intro lg:pt-8" style={d(520)}>
              <h2 className="font-serif text-[2rem] leading-tight text-ink sm:text-[2.4rem]">What we&rsquo;ll cover</h2>
              <ol className="mt-8 space-y-0 border-t border-line">
                {AGENDA.map((item, i) => (
                  <li key={item} className="flex gap-4 border-b border-line py-4.5">
                    <span className="mt-0.5 font-mono text-[11px] tracking-[0.08em] text-accent-ink">0{i + 1}</span>
                    <span className="text-[15.5px] leading-relaxed text-ink-2">{item}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-8 flex items-start gap-2.5 text-[14px] leading-relaxed text-muted">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                  <Check size={12} strokeWidth={2.4} aria-hidden="true" />
                </span>
                Built for lean sales teams. Designed around measurable outcomes.
              </p>
            </div>

            <div id="book-form-card" className="intro card px-5 py-7 sm:px-8 sm:py-9" style={d(620)}>
              <h2 className="font-serif text-[2rem] leading-tight text-ink">Book your demo</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2/85">
                Tell us a little about your team so we can make the conversation useful.
              </p>
              <div className="mt-6 border-t border-line pt-6">
                <DemoForm deliveryConfigured={deliveryConfigured} />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
