"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TopBar } from "./AppShell";
import { BackIcon } from "./icons";
import { SampleBanner } from "./SampleBanner";
import { Avatar, Dot, Segmented } from "./ui";
import { api } from "@/lib/api";
import { relativeTime, toChannelKey, toStageLabel } from "@/lib/app/adapt";
import { CHANNEL } from "@/lib/app/channels";
import { scoreBand, STAGE_COLOR } from "@/lib/app/leads";
import { SENDING_ENABLED, SENDING_OFF_NOTE } from "@/lib/capabilities";
import type { Message, Thread } from "@/lib/data/types";

/** Display label and pill tone per intent the API reports. */
const INTENT: Record<Thread["intent"], { label: string; tone: string }> = {
  interested: { label: "Interested", tone: "pos" },
  question: { label: "Question", tone: "acc" },
  objection: { label: "Objection", tone: "hl" },
  "out-of-office": { label: "Out of office", tone: "" },
  "opt-out": { label: "Opt-out", tone: "alert" },
};

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? WHEN.format(d) : "";
}

type Detail = { messages: Message[] } | { error: string };

export function InboxScreen() {
  const [filter, setFilter] = useState<"needs" | "all">("needs");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  /** Phone width shows either the list or the conversation; this is which. */
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<Record<string, Detail>>({});

  /** Guards against an out-of-order response overwriting a newer one. */
  const listRequest = useRef(0);

  const load = useCallback(async () => {
    const id = ++listRequest.current;
    setLoading(true);
    try {
      const result = await api.threads({ filter: "all" });
      if (id !== listRequest.current) return;
      setThreads(result.threads);
      setDetails({});
      setError(null);
    } catch (caught) {
      if (id !== listRequest.current) return;
      setError(caught instanceof Error ? caught.message : "Could not load conversations.");
    } finally {
      if (id === listRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needing = threads.filter((t) => t.needsReply);
  const shown = filter === "needs" ? needing : threads;
  const thread = shown.find((t) => t.id === selected) ?? shown[0] ?? null;
  const threadId = thread?.id ?? null;
  const detail = threadId ? details[threadId] : undefined;

  // Fetch the messages of whichever thread is showing; each is fetched once per list load.
  useEffect(() => {
    if (!threadId) return;
    let live = true;
    api
      .thread(threadId)
      .then((r) => live && setDetails((d) => ({ ...d, [threadId]: { messages: r.messages } })))
      .catch(
        (caught) =>
          live &&
          setDetails((d) => ({
            ...d,
            [threadId]: { error: caught instanceof Error ? caught.message : "Could not load this conversation." },
          })),
      );
    return () => {
      live = false;
    };
  }, [threadId, threads]);

  const retryDetail = () => {
    if (!threadId) return;
    setDetails((d) => {
      const { [threadId]: _drop, ...rest } = d;
      return rest;
    });
    // Re-selecting the same id would not re-run the effect, so reload the list, which does.
    void load();
  };

  const pick = (id: string) => {
    setSelected(id);
    setOpen(true);
  };

  const first = thread?.leadName.split(" ")[0] ?? "";

  return (
    <div className="main">
      <TopBar title="Inbox" />
      <div className="scroll">
        {/* A column, so the sample banner takes its height and the panes share what is left. */}
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ padding: "6px var(--g) 0", flex: "none" }}>
            <SampleBanner onRemoved={() => void load()} />
          </div>
          <div
            className={"full inbox" + (open && thread ? " thread" : "")}
            style={{ flex: "1 1 0", minHeight: 0, height: "auto" }}
          >
            <div className="ib-list pane">
              <div className="ib-list-h">
                <Segmented<"needs" | "all">
                  value={filter}
                  onChange={setFilter}
                  items={[
                    ["needs", "To reply", needing.length],
                    ["all", "All", threads.length],
                  ]}
                />
              </div>

              <div className="threads" aria-busy={loading}>
                {shown.map((t) => {
                  const key = toChannelKey(t.channel);
                  const intent = INTENT[t.intent];
                  return (
                    <button
                      key={t.id}
                      className={"th" + (t.id === thread?.id ? " on" : "") + (t.unread ? " unread" : "")}
                      onClick={() => pick(t.id)}
                    >
                      <Avatar name={t.leadName} />
                      <div>
                        <div className="r1">
                          <b>{t.leadName}</b>
                          <time dateTime={t.lastAt}>{relativeTime(t.lastAt)}</time>
                        </div>
                        <p>{t.preview}</p>
                        <div className="r3">
                          <span className="chname">
                            <Dot k={key} />
                            {CHANNEL[key].name}
                          </span>
                          <span className={"tag " + intent.tone}>{intent.label}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {loading && threads.length === 0 && !error && (
                  <p className="empty" role="status">
                    Loading conversations…
                  </p>
                )}
                {error && (
                  <p className="empty" role="alert">
                    {error}{" "}
                    <button className="sortb" onClick={() => void load()}>
                      Retry
                    </button>
                  </p>
                )}
                {!loading && !error && threads.length === 0 && (
                  <p className="empty">No conversations yet. Replies from your leads will show up here.</p>
                )}
                {!loading && !error && threads.length > 0 && shown.length === 0 && (
                  <p className="empty">Nothing is waiting for a reply.</p>
                )}
              </div>
            </div>

            <section className="convo pane">
              {thread ? (
                <>
                  <div className="convo-h">
                    <button className="ib back" aria-label="Back to conversations" onClick={() => setOpen(false)}>
                      <BackIcon />
                    </button>
                    <Avatar name={thread.leadName} />
                    <div>
                      <b>{thread.leadName}</b>
                      <small>
                        {thread.role} · {thread.company}
                      </small>
                    </div>
                    <div className="acts">
                      <Link className="btn sm line" href="/dashboard/leads">
                        Open lead
                      </Link>
                    </div>
                  </div>

                  <div className="msgs" aria-busy={!detail}>
                    {!detail && (
                      <p className="empty" role="status">
                        Loading messages…
                      </p>
                    )}
                    {detail && "error" in detail && (
                      <p className="empty" role="alert">
                        {detail.error}{" "}
                        <button className="sortb" onClick={retryDetail}>
                          Retry
                        </button>
                      </p>
                    )}
                    {detail && "messages" in detail && detail.messages.length === 0 && (
                      <p className="empty">No messages in this conversation yet.</p>
                    )}
                    {detail &&
                      "messages" in detail &&
                      detail.messages.map((m) => (
                        <div className={"msg " + (m.from === "us" ? "me" : "them")} key={m.id}>
                          <div className="meta">
                            {m.from === "us" ? "You" : first} · {CHANNEL[toChannelKey(m.channel)].name} ·{" "}
                            {when(m.sentAt)}
                          </div>
                          <div className="bubble">{m.body}</div>
                        </div>
                      ))}
                  </div>

                  <div className="composer">
                    <textarea
                      className="ta"
                      aria-label="Reply"
                      placeholder="Replying isn't available yet."
                      disabled={!SENDING_ENABLED}
                    />
                    <div className="f">
                      {!SENDING_ENABLED && (
                        <span className="muted" style={{ fontSize: 12.5 }}>
                          {SENDING_OFF_NOTE}
                        </span>
                      )}
                      <span className="sp" />
                      <button className="btn pri" disabled={!SENDING_ENABLED}>
                        Send
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                threads.length > 0 && <p className="empty">Select a conversation to read it.</p>
              )}
            </section>

            <aside className="ctx pane">
              {thread && (
                <>
                  <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
                    <Avatar name={thread.leadName} size="lg" />
                    <b style={{ fontSize: 15 }}>{thread.leadName}</b>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      {thread.role} · {thread.company}
                    </span>
                  </div>
                  <dl>
                    <dt>Score</dt>
                    <dd>
                      <span className={"score " + scoreBand(thread.score)}>{thread.score}</span>
                    </dd>
                    <dt>Stage</dt>
                    <dd>
                      <span className="stage">
                        <i style={{ background: STAGE_COLOR[toStageLabel(thread.stage)] }} />
                        {toStageLabel(thread.stage)}
                      </span>
                    </dd>
                    <dt>Campaign</dt>
                    <dd>{thread.campaignName ?? "—"}</dd>
                    <dt>Owner</dt>
                    <dd>{thread.ownerName || "—"}</dd>
                  </dl>
                  {thread.signals.length > 0 && (
                    <ul className="sigs">
                      {thread.signals.map((s) => (
                        <li key={s.label}>
                          <span>{s.label}</span>
                          <span className="p">
                            {s.points >= 0 ? "+" : ""}
                            {s.points}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link className="btn line block" href="/dashboard/leads">
                    Open lead
                  </Link>
                </>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
