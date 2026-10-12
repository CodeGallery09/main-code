"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Channel, Message, Thread } from "@/lib/data/types";
import {
  Avatar,
  CHANNEL_LABEL,
  ChannelMark,
  DemoDataNote,
  ErrorNote,
  Loading,
  ScoreBadge,
  Segmented,
  fmtAgo,
  fmtDate,
  fmtTime,
} from "@/components/app/ui";
import { SendIcon } from "@/components/app/icons";

const INTENT_LABEL: Record<Thread["intent"], string> = {
  interested: "Interested",
  question: "Question",
  objection: "Objection",
  "out-of-office": "Out of office",
  "opt-out": "Opt-out",
};

const REPLY_CHANNELS: Channel[] = ["linkedin", "email", "whatsapp"];

export function InboxScreen({ initial }: { initial: Thread[] }) {
  const [filter, setFilter] = useState("to-reply");
  const [threads, setThreads] = useState<Thread[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("linkedin");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Reload the list whenever the filter changes.
  useEffect(() => {
    let live = true;
    api
      .threads({ filter })
      .then(({ threads: rows }) => {
        if (!live) return;
        setThreads(rows);
        if (!rows.some((row) => row.id === activeId)) setActiveId(rows[0]?.id ?? null);
      })
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
    // activeId is intentionally not a dependency: changing threads shouldn't refetch the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Load the open conversation.
  useEffect(() => {
    if (!activeId) {
      setThread(null);
      setMessages([]);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    api
      .thread(activeId)
      .then((data) => {
        if (!live) return;
        setThread(data.thread);
        setMessages(data.messages);
        setChannel(data.thread.channel === "call" || data.thread.channel === "sms" ? "email" : data.thread.channel);
        setDraft("");
      })
      .catch((err: Error) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [activeId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    if (!activeId || !draft.trim()) return;
    setSending(true);
    try {
      const { message } = await api.sendMessage(activeId, channel, draft.trim());
      setMessages((rows) => [...rows, message]);
      setDraft("");
      setThreads((rows) =>
        rows.map((row) => (row.id === activeId ? { ...row, needsReply: false, unread: false } : row)),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const toReply = threads.filter((t) => t.needsReply).length;

  return (
    <div className="grid min-h-0 grid-cols-1 gap-3.5 lg:h-[calc(100svh-var(--app-top)-var(--app-gap)*3)] lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,278px)]">
      {/* ---------- list ---------- */}
      <section className="lg lg-sheen lg-in r-xl flex min-h-0 flex-col" aria-label="Conversations">
        <div className="px-3.5 pb-3 pt-3.5">
          <Segmented
            label="Filter conversations"
            value={filter}
            onChange={setFilter}
            items={[
              { id: "to-reply", label: "To reply", count: toReply },
              { id: "all", label: "All", count: threads.length },
            ]}
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {threads.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setActiveId(row.id)}
                aria-current={row.id === activeId ? "true" : undefined}
                className={`w-full rounded-[14px] px-3 py-2.5 text-left transition-colors ${
                  row.id === activeId ? "bg-white/85 shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "hover:bg-white/50"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <Avatar initials={row.initials} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <p className="truncate text-[14px] font-semibold text-ink">{row.leadName}</p>
                      {row.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-label="Unread" />}
                      <span className="ml-auto shrink-0 text-[11.5px] text-muted">{fmtAgo(row.lastAt)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-ink-2">{row.preview}</p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                      <ChannelMark channel={row.channel} className="h-3.5 w-3.5" />
                      {CHANNEL_LABEL[row.channel]}
                      <span className="pill h-5 !px-2 text-[11px]">{INTENT_LABEL[row.intent]}</span>
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
          {!threads.length && (
            <li className="px-3 py-10 text-center text-[13.5px] text-muted">No conversations here.</li>
          )}
        </ul>
      </section>

      {/* ---------- conversation ---------- */}
      <section
        className="lg lg-sheen lg-in r-xl flex min-h-0 flex-col"
        style={{ "--i": 1 } as React.CSSProperties}
        aria-label="Conversation"
      >
        {error && <div className="p-4"><ErrorNote message={error} /></div>}
        {loading && !thread && <div className="p-4"><Loading rows={4} /></div>}

        {thread && (
          <>
            <header className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-3">
              <Avatar initials={thread.initials} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{thread.leadName}</p>
                <p className="truncate text-[12.5px] text-muted">
                  {thread.role} · {thread.company}
                </p>
              </div>
              <Link href="/dashboard/leads" className="gbtn gbtn-sm">
                Profile
              </Link>
              <button type="button" className="gbtn gbtn-sm gbtn-solid">
                Call
              </button>
            </header>

            <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex flex-col ${message.from === "us" ? "items-end" : "items-start"}`}
                >
                  <p className="mb-1 px-1 text-[11.5px] text-muted">
                    {message.from === "us" ? "You" : thread.leadName.split(" ")[0]} ·{" "}
                    {CHANNEL_LABEL[message.channel]} · {fmtDate(message.sentAt)} {fmtTime(message.sentAt)}
                  </p>
                  <div
                    className={`max-w-[min(560px,86%)] rounded-[18px] px-3.5 py-2.5 text-[14px] leading-relaxed ${
                      message.from === "us"
                        ? "bg-ink text-white shadow-[0_8px_18px_-10px_rgb(0_0_0/0.6)]"
                        : "lg-thin text-ink"
                    }`}
                  >
                    {message.body}
                  </div>
                </div>
              ))}
            </div>

            <footer className="border-t border-black/[0.06] p-3">
              <div className="mb-2 flex items-center gap-2">
                <Segmented
                  label="Reply channel"
                  value={channel}
                  onChange={(id) => setChannel(id as Channel)}
                  items={REPLY_CHANNELS.map((c) => ({ id: c, label: CHANNEL_LABEL[c] }))}
                />
                <span className="tag-sample ml-auto">Nothing is sent</span>
              </div>
              <textarea
                className="ginput min-h-[84px]"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={`Reply to ${thread.leadName.split(" ")[0]} on ${CHANNEL_LABEL[channel]}…`}
                aria-label="Your reply"
              />
              <div className="mt-2 flex items-center gap-2">
                <button type="button" className="gbtn gbtn-sm">
                  Booking link
                </button>
                <button type="button" className="gbtn gbtn-sm gbtn-quiet">
                  Mark handled
                </button>
                <button
                  type="button"
                  className="gbtn gbtn-sm gbtn-solid ml-auto"
                  onClick={send}
                  disabled={sending || !draft.trim()}
                >
                  <SendIcon />
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </footer>
          </>
        )}

        {!thread && !loading && !error && (
          <p className="p-10 text-center text-[14px] text-muted">Pick a conversation to open it.</p>
        )}
      </section>

      {/* ---------- lead panel ---------- */}
      <aside
        className="lg lg-sheen lg-in r-xl hidden min-h-0 flex-col overflow-y-auto p-4 xl:flex"
        style={{ "--i": 2 } as React.CSSProperties}
        aria-label="Lead detail"
      >
        {thread ? (
          <>
            <Avatar initials={thread.initials} className="!h-11 !w-11 !text-[14px]" />
            <p className="mt-3 text-[16px] font-semibold text-ink">{thread.leadName}</p>
            <p className="text-[12.5px] text-muted">
              {thread.role} · {thread.company}
            </p>

            <dl className="mt-5 space-y-2.5 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Score</dt>
                <dd><ScoreBadge score={thread.score} /></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Stage</dt>
                <dd className="font-medium capitalize text-ink">{thread.stage}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Campaign</dt>
                <dd className="truncate font-medium text-ink">{thread.campaignName ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Owner</dt>
                <dd className="font-medium text-ink">{thread.ownerName}</dd>
              </div>
            </dl>

            <p className="thead mt-6">Why this score</p>
            <ul className="mt-2">
              {thread.signals.map((signal) => (
                <li
                  key={signal.label}
                  className="row-sep flex items-center justify-between py-2 text-[13px]"
                >
                  <span className="text-ink-2">{signal.label}</span>
                  <span className="font-semibold tabular-nums text-ink">+{signal.points}</span>
                </li>
              ))}
            </ul>

            <Link href="/dashboard/leads" className="gbtn mt-5 w-full">
              Open lead
            </Link>
            <DemoDataNote className="mt-4" />
          </>
        ) : (
          <p className="text-[13.5px] text-muted">No conversation open.</p>
        )}
      </aside>
    </div>
  );
}
