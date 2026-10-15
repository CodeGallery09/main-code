"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { TopBar } from "./AppShell";
import { BackIcon } from "./icons";
import { Avatar, Dot, Segmented } from "./ui";
import { CHANNEL, OWNERS, type ChannelKey } from "@/lib/app/channels";
import { CAMPAIGNS } from "@/lib/app/campaigns";
import { INTENT_TONE, THREADS } from "@/lib/app/inbox";
import { leadById, scoreBand, SIGNAL_LABEL, SIGNAL_SCORE, STAGE_COLOR } from "@/lib/app/leads";

/** Which campaign a lead sits in, used for the context rail. */
const CAMPAIGN_FOR_LEAD: Record<number, string> = {
  15: "Inbound follow-up",
  2: "Net-new outbound",
  1: "Net-new outbound",
  8: "Net-new outbound",
  13: "Inbound follow-up",
  5: "Q4 webinar invite",
  7: "Closed-lost re-engage",
};

/** Last thing said in a thread, for the list preview. */
function preview(messages: { t: string }[]) {
  return messages[messages.length - 1]?.t ?? "";
}

export function InboxScreen() {
  const [filter, setFilter] = useState<"needs" | "all">("needs");
  const [selected, setSelected] = useState(THREADS[0].id);
  const [read, setRead] = useState<number[]>([]);
  const [handled, setHandled] = useState<number[]>([]);

  const shown = THREADS.filter((t) => (filter === "needs" ? t.needs && !handled.includes(t.id) : true));
  const thread = useMemo(
    () => THREADS.find((t) => t.id === selected) ?? shown[0] ?? THREADS[0],
    [selected, shown],
  );
  const lead = leadById(thread.id);
  const [channel, setChannel] = useState<ChannelKey>(thread.ch);
  const [draft, setDraft] = useState(thread.sugg ?? "");

  const select = (id: number) => {
    const next = THREADS.find((t) => t.id === id);
    setSelected(id);
    setRead((r) => (r.includes(id) ? r : [...r, id]));
    setChannel(next?.ch ?? "mail");
    setDraft(next?.sugg ?? "");
  };

  if (!lead) return null;

  return (
    <div className="main">
      <TopBar title="Inbox" />
      <div className="scroll">
        <div className="full inbox">
          <div className="ib-list pane">
            <div className="ib-list-h">
              <Segmented<"needs" | "all">
                value={filter}
                onChange={setFilter}
                items={[
                  ["needs", "To reply", THREADS.filter((t) => t.needs && !handled.includes(t.id)).length],
                  ["all", "All", THREADS.length],
                ]}
              />
              {/* These conversations are the demo constants in lib/app/inbox, not this workspace's
                  messages. Label them so a real account does not mistake them for its own. */}
              <span className="samp">Illustrative demo data</span>
            </div>

            <div className="threads">
              {shown.map((t) => {
                const person = leadById(t.id);
                if (!person) return null;
                const unread = t.unread && !read.includes(t.id);
                return (
                  <button
                    key={t.id}
                    className={"th" + (t.id === thread.id ? " on" : "") + (unread ? " unread" : "")}
                    onClick={() => select(t.id)}
                  >
                    <Avatar name={person.n} />
                    <div>
                      <div className="r1">
                        <b>{person.n}</b>
                        <time>{t.time}</time>
                      </div>
                      <p>{preview(t.msgs)}</p>
                      <div className="r3">
                        <span className="chname">
                          <Dot k={t.ch} />
                          {CHANNEL[t.ch].name}
                        </span>
                        <span className={"tag " + INTENT_TONE[t.intent]}>{t.intent}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {shown.length === 0 && <p className="empty">Inbox zero. Nothing left to reply to.</p>}
            </div>
          </div>

          <section className="convo pane">
            <div className="convo-h">
              <button className="ib back" aria-label="Back" onClick={() => setSelected(0)}>
                <BackIcon />
              </button>
              <Avatar name={lead.n} />
              <div>
                <b>{lead.n}</b>
                <small>
                  {lead.t} · {lead.c}
                </small>
              </div>
              <div className="acts">
                <Link className="btn sm line hide-m" href="/dashboard/leads">
                  Profile
                </Link>
                <button className="btn sm acc">Call</button>
              </div>
            </div>

            <div className="msgs">
              {thread.msgs.map((m, i) =>
                "sys" in m ? (
                  <div className="sys" key={i}>
                    {m.t}
                  </div>
                ) : (
                  <div className={"msg " + m.s} key={i}>
                    <div className="meta">
                      {m.s === "me" ? "You" : lead.n.split(" ")[0]} · {CHANNEL[m.ch].name} · {m.w}
                    </div>
                    {m.subj && <div className="subj">{m.subj}</div>}
                    <div className="bubble">{m.t}</div>
                  </div>
                ),
              )}
            </div>

            {thread.auto ? (
              <div className="composer">
                <p className="ack">{thread.auto}</p>
              </div>
            ) : (
              <div className="composer">
                <div className="f">
                  <Segmented<ChannelKey>
                    value={channel}
                    onChange={setChannel}
                    items={[
                      ["li", "LinkedIn"],
                      ["mail", "Email"],
                      ["wa", "WhatsApp"],
                    ]}
                  />
                  {thread.sugg && draft === thread.sugg && (
                    <span className="tag acc hide-m">Suggested reply</span>
                  )}
                </div>
                <textarea
                  className="ta"
                  aria-label="Reply"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="f">
                  <button className="btn sm line" onClick={() => setDraft((d) => `${d}\n\nflightpath.app/aarav`)}>
                    Booking link
                  </button>
                  <button
                    className="btn sm ghost"
                    onClick={() => setHandled((h) => [...h, thread.id])}
                  >
                    Mark handled
                  </button>
                  <span className="sp" />
                  <button className="btn pri" onClick={() => setHandled((h) => [...h, thread.id])}>
                    Send
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="ctx pane">
            <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
              <Avatar name={lead.n} size="lg" />
              <b style={{ fontSize: 15 }}>{lead.n}</b>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {lead.t} · {lead.c}
              </span>
            </div>
            <dl>
              <dt>Score</dt>
              <dd>
                <span className={"score " + scoreBand(lead.score)}>{lead.score}</span>
              </dd>
              <dt>Stage</dt>
              <dd>
                <span className="stage">
                  <i style={{ background: STAGE_COLOR[lead.stage] }} />
                  {lead.stage}
                </span>
              </dd>
              <dt>Campaign</dt>
              <dd>{CAMPAIGN_FOR_LEAD[lead.id] ?? CAMPAIGNS[1].name}</dd>
              <dt>Owner</dt>
              <dd>{OWNERS[lead.own]}</dd>
            </dl>
            <ul className="sigs">
              {lead.sig.map((s) => (
                <li key={s}>
                  <span>{SIGNAL_LABEL[s]}</span>
                  <span className="p">
                    {SIGNAL_SCORE[s] >= 0 ? "+" : ""}
                    {SIGNAL_SCORE[s]}
                  </span>
                </li>
              ))}
            </ul>
            <Link className="btn line block" href="/dashboard/leads">
              Open lead
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
