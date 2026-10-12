import Link from "next/link";
import { Avatar, Dot, Meter } from "@/components/app/ui";
import { CHANNEL } from "@/lib/app/channels";
import { DEMO_HREF } from "@/lib/site";
import { SENDING_TODAY } from "@/lib/app/workspace";

/**
 * The hero doubles as the product shot: the panel under the headline is built
 * from the same cards the workspace uses, so the page and the app read as one.
 */
export function SiteHero() {
  const preview = [
    { label: "Replies", value: "113", delta: "▲ 3.3%", tone: "up" },
    { label: "Meetings", value: "22", delta: "▲ 8.5%", tone: "up" },
    { label: "Reply rate", value: "5.6%", delta: "▼ 0.1pp", tone: "down" },
    { label: "Active leads", value: "1,284", delta: "", tone: "" },
  ];

  const queue = [
    { who: "Omar Haddad", at: "Brightline Logistics", score: 80, why: "Asked about pricing for 8 seats", act: "Reply" },
    { who: "Maya Reyes", at: "Example Co", score: 70, why: "Open to a chat · clicked pricing", act: "Call" },
    { who: "Rohan Desai", at: "Tiffin Labs", score: 58, why: "Asked for a deck", act: "Reply" },
  ];

  return (
    <section id="top" data-pip-section="hero" aria-labelledby="hero-title" className="wrap hero-s">
      <h1 id="hero-title">
        Your GTM motion, <em>on one clock.</em>
      </h1>

      <p className="lede">
        Flightpath runs LinkedIn and email as a single workflow, reads how every lead engages, and picks the next
        step for you — so nobody is double-touched and nobody is forgotten.
      </p>

      <div className="ctas">
        <Link className="btn pri" href={DEMO_HREF}>
          Book a demo
        </Link>
        <Link className="btn line" href="/#how-it-works">
          See how it works
        </Link>
      </div>

      <div className="preview card" aria-label="Product preview">
        <div className="stats">
          {preview.map((s) => (
            <div className="card stat" key={s.label}>
              <span className="eyebrow">{s.label}</span>
              <span className="v">
                {s.value}
                {s.delta && <span className={"delta " + s.tone}>{s.delta}</span>}
              </span>
            </div>
          ))}
        </div>

        <div className="pv-grid">
          <section className="card">
            <div className="card-h">
              <h3>To do</h3>
              <span className="eyebrow">Ranked by engagement</span>
            </div>
            <ul className="todo" style={{ marginTop: 10 }}>
              {queue.map((row) => (
                <li key={row.who}>
                  <Avatar name={row.who} />
                  <div>
                    <div className="t1">
                      <b>{row.who}</b>
                      <span>{row.at}</span>
                    </div>
                    <div className="t2">
                      <span className={"score " + (row.score >= 70 ? "hot" : "warm")}>{row.score}</span>
                      {row.why}
                    </div>
                  </div>
                  <div className="acts">
                    <span className="btn sm pri">{row.act}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="card-h">
              <h3>Sending today</h3>
            </div>
            <div className="card-b cap">
              {SENDING_TODAY.map((row) => (
                <div key={row.k}>
                  <div className="t">
                    <span>
                      <Dot k={row.k} />
                      {CHANNEL[row.k].name}
                    </span>
                    <span className="num muted">
                      {row.used} / {row.cap}
                    </span>
                  </div>
                  <Meter value={row.used} max={row.cap} color={CHANNEL[row.k].hex} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12.5 }}>
        Screens and figures above are illustrative demo data.
      </p>
    </section>
  );
}
