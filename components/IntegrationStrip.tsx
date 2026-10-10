import { ChannelIcon, type Channel } from "./ChannelIcon";
import { Reveal } from "./Reveal";

type Item = { label: string; channel: Channel; status: "core" | "planned" };

const ITEMS: Item[] = [
  { label: "LinkedIn", channel: "linkedin", status: "core" },
  { label: "Email", channel: "email", status: "core" },
  { label: "CRM sync", channel: "crm", status: "planned" },
  { label: "Calendar", channel: "meeting", status: "planned" },
  { label: "Phone tasks", channel: "call", status: "planned" },
  { label: "SMS", channel: "sms", status: "planned" },
];

export function IntegrationStrip() {
  return (
    <section aria-labelledby="channels-title" className="border-y border-line bg-surface/60">
      <Reveal className="container-page flex flex-col gap-6 py-8 lg:flex-row lg:items-center lg:gap-10">
        <div className="shrink-0 lg:w-56">
          <h2 id="channels-title" className="eyebrow">
            Channels Flightpath coordinates
          </h2>
          <p className="mt-1.5 text-[12.5px] text-muted">Availability varies — we&rsquo;ll confirm coverage on your demo.</p>
        </div>
        <ul className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          {ITEMS.map((it) => (
            <li key={it.label} className="flex items-center gap-2.5">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                  it.status === "core" ? "border-line-strong bg-surface text-ink" : "border-dashed border-line-strong text-muted"
                }`}
              >
                <ChannelIcon channel={it.channel} size={15} />
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${it.status === "core" ? "text-ink" : "text-ink-2/80"}`}>{it.label}</span>
                <span className={`block font-mono text-[10px] uppercase tracking-[0.1em] ${it.status === "core" ? "text-success" : "text-muted"}`}>
                  {it.status === "core" ? "Core channel" : "Planned"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
