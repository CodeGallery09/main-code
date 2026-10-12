import Link from "next/link";
import { Dot } from "@/components/app/ui";
import { CHANNEL } from "@/lib/app/channels";
import { DEMO_HREF } from "@/lib/site";

/** How a lead moves through a workflow, start to finish. */
const STEPS = [
  {
    title: "Build the list",
    body: "Import a CSV, a form, or a CRM export. Flightpath dedupes it and holds consent against every contact.",
    meta: "Audience",
  },
  {
    title: "Run one workflow, not five tools",
    body: "LinkedIn and email share a single schedule and a single daily cap, so a lead never gets two openers in one morning.",
    meta: "Sequence",
  },
  {
    title: "Read the engagement",
    body: "Accepted, opened, clicked, replied, visited pricing — each signal moves the lead's score, and the score picks what happens next.",
    meta: "Scoring",
  },
  {
    title: "Route the next step",
    body: "A warm lead becomes a call task for its owner. A quiet one waits. A reply pauses the campaign on the spot.",
    meta: "Routing",
  },
  {
    title: "Answer in one inbox",
    body: "Every reply lands in one thread view with the lead's context beside it and a draft ready to edit.",
    meta: "Inbox",
  },
];

const REASONS = [
  {
    n: "01",
    title: "One clock across channels",
    body: "Sequencing tools treat each channel as its own campaign. Flightpath gives the lead one timeline, so the follow-up knows what already happened.",
  },
  {
    n: "02",
    title: "Engagement decides, not a timer",
    body: "The next step is chosen from what the lead actually did. Nobody gets a “just bumping this” email the day after they booked a meeting.",
  },
  {
    n: "03",
    title: "Benchmarked, not guessed",
    body: "Every workflow reports against a healthy band per channel, so you can see whether a reply rate is a problem or a normal Tuesday.",
  },
];

export function SiteJourney() {
  return (
    <section id="journey" data-pip-section="journey" aria-labelledby="journey-title" className="sect">
      <div className="wrap">
        <div className="sect-h">
          <span className="eyebrow">Customer journey</span>
          <h2>
            Five steps from a cold list to <em>a booked call.</em>
          </h2>
          <p>
            The same five steps run behind every workflow in the library. You pick the audience and the copy;
            Flightpath handles the order, the pacing and the hand-off.
          </p>
        </div>

        <ol className="steps-s">
          {STEPS.map((step, i) => (
            <li className="card step-s" key={step.title}>
              <span className="ix">{i + 1}</span>
              <span>
                <b>{step.title}</b>
                <small>{step.body}</small>
              </span>
              <span className="eyebrow">{step.meta}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function SiteWhy() {
  return (
    <section id="why" data-pip-section="why" aria-labelledby="why-title" className="sect">
      <div className="wrap">
        <div className="sect-h">
          <span className="eyebrow">Why Flightpath</span>
          <h2>
            Built for teams running outbound <em>without an ops hire.</em>
          </h2>
        </div>

        <div className="trio">
          {REASONS.map((r) => (
            <article className="card feat" key={r.n}>
              <span className="n">{r.n}</span>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Channel availability. Anything past LinkedIn and email is on the roadmap. */
const CHANNEL_STATUS = [
  { k: "li" as const, note: "Invites, messages and profile signals", tag: "Available", tone: "pos" },
  { k: "mail" as const, note: "Sending domains, warm-up and reply detection", tag: "Available", tone: "pos" },
  { k: "wa" as const, note: "Business API templates", tag: "Planned", tone: "" },
  { k: "call" as const, note: "Call tasks routed to the lead owner", tag: "Planned", tone: "" },
  { k: "sms" as const, note: "Reminders and short follow-ups", tag: "Planned", tone: "" },
];

export function SiteWorkflows() {
  return (
    <section id="how-it-works" data-pip-section="how" aria-labelledby="how-title" className="sect">
      <div className="wrap">
        <div className="sect-h">
          <span className="eyebrow">How it works</span>
          <h2>
            Start from a workflow, <em>not a blank canvas.</em>
          </h2>
          <p>
            Each template arrives with its audience shape, its copy blocks and its routing rules already set. Change
            what you need and publish; the version history keeps the old one running until you switch.
          </p>
        </div>

        <div className="duo">
          <article className="card feat">
            <h3>Cold outbound</h3>
            <p>
              LinkedIn invite first, email as the backup, and a call task the moment the lead engages twice. Best for
              net-new lists where you have a name and a company.
            </p>
          </article>
          <article className="card feat">
            <h3>Inbound follow-up</h3>
            <p>
              Demo requests answered within the hour, then a short nudge sequence that stops the instant the meeting is
              booked.
            </p>
          </article>
        </div>

        <div className="card chlist" style={{ marginTop: 16 }}>
          {CHANNEL_STATUS.map((row) => (
            <div className="chrow" key={row.k}>
              <Dot k={row.k} off={row.tag === "Planned"} />
              <div style={{ minWidth: 0 }}>
                <b>{CHANNEL[row.k].name}</b>
                <small>{row.note}</small>
              </div>
              <span className="lim row" style={{ gap: 10 }}>
                <span className={"tag " + row.tone}>{row.tag}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="wrap sitefoot">
      <span>© {new Date().getFullYear()} Flightpath</span>
      <span className="sp" />
      <Link href="/#top">Back to top</Link>
      <Link href={DEMO_HREF}>Book a demo</Link>
    </footer>
  );
}
