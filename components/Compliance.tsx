import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Gauge, ScrollText, ShieldCheck, UserX, Check } from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";

function Capability({ icon: Icon, title, body, children, delay }: { icon: LucideIcon; title: string; body: string; children: ReactNode; delay: number }) {
  return (
    <Reveal delay={delay} className="card flex flex-col p-6">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink">
        <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-[17px] font-medium text-ink">{title}</h3>
      <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2/80">{body}</p>
      <div className="mt-6 flex-1 rounded-[10px] border border-line bg-surface-2 p-3.5" aria-hidden="true">
        {children}
      </div>
    </Reveal>
  );
}

const AUDIT = [
  ["14:05:12", "routing", "lead#4821 → call task (score 76)"],
  ["14:03:40", "consent", "lead#4821 basis verified"],
  ["13:58:02", "limit", "linkedin.daily 38/80"],
  ["13:51:27", "opt-out", "lead#3307 suppressed · all workflows"],
];

export function Compliance() {
  return (
    <section aria-labelledby="control-title" className="border-t border-line bg-surface/50 py-24 md:py-32">
      <div className="container-page">
        <SectionHeading
          id="control-title"
          eyebrow="Compliance & control"
          title={
            <>
              Automation with <em className="text-accent">guardrails</em> built in.
            </>
          }
          lede="Orchestration only works if you can trust it. These controls are part of the engine, not settings you have to remember."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Capability
            icon={ShieldCheck}
            delay={0}
            title="Consent checks"
            body="Every lead is checked against your consent rules before the first touch — and again before each new channel."
          >
            <ul className="space-y-2 font-mono text-[11px]">
              {["Contact source recorded", "Region rules applied", "Channel permitted"].map((t) => (
                <li key={t} className="flex items-center gap-2 text-ink-2">
                  <Check size={12} className="text-success" /> {t}
                </li>
              ))}
            </ul>
          </Capability>

          <Capability
            icon={UserX}
            delay={90}
            title="Opt-out handling"
            body="An unsubscribe or “not interested” in any channel stops every workflow for that person, everywhere."
          >
            <div className="font-mono text-[11px] text-ink-2">
              <p className="text-muted">reply received</p>
              <p className="mt-1 rounded-md bg-surface px-2 py-1.5 text-ink">“Please remove me.”</p>
              <p className="mt-2 flex items-center gap-1.5 text-success">
                <Check size={12} /> Suppressed in 3 workflows
              </p>
            </div>
          </Capability>

          <Capability
            icon={Gauge}
            delay={180}
            title="Account-level limits"
            body="Daily caps per sender and per channel keep volume steady and protect your accounts and domains."
          >
            <div className="space-y-3 font-mono text-[11px] text-ink-2">
              {[
                { k: "LinkedIn actions", v: 38, max: 80 },
                { k: "Emails / mailbox", v: 112, max: 150 },
              ].map((m, i) => (
                <div key={m.k}>
                  <div className="flex justify-between">
                    <span>{m.k}</span>
                    <span className="tabular-nums text-muted">
                      {m.v}/{m.max}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      className="grow-x h-full rounded-full bg-ink"
                      style={{ width: `${(m.v / m.max) * 100}%`, "--reveal-delay": `${400 + i * 150}ms` } as CSSProperties}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Capability>

          <Capability
            icon={ScrollText}
            delay={270}
            title="Audit trail"
            body="Every send, signal and routing decision is logged with the reason, so anyone can see why a lead got a touch."
          >
            <ul className="space-y-1.5 font-mono text-[10.5px] leading-snug">
              {AUDIT.map(([t, kind, msg]) => (
                <li key={t} className="grid grid-cols-[52px_1fr] gap-2">
                  <span className="text-muted">{t}</span>
                  <span className="text-ink-2">
                    <span className="text-accent">{kind}</span> {msg}
                  </span>
                </li>
              ))}
            </ul>
          </Capability>
        </div>

        <p className="mt-8 max-w-2xl text-[12.5px] leading-relaxed text-muted">
          Flightpath helps you apply your own outreach and data policies consistently. It doesn&rsquo;t replace legal advice — your team
          stays responsible for the rules you configure.
        </p>
      </div>
    </section>
  );
}
