"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { Channel, Thread } from "@/lib/data/types";
import { CHANNEL_NAME } from "@/lib/ws/channels";
import { useAsync } from "@/lib/ws/use-async";
import { cn } from "@/lib/ws/utils";
import { PageBody, PageHeader, TopBar } from "@/components/ws/shell/page";
import { useWorkspace } from "@/components/ws/shell/workspace-context";
import { Card } from "@/components/ws/ui/card";
import { Button } from "@/components/ws/ui/button";
import { Appear, Expand } from "@/components/ws/ui/motion";
import { ChannelChip, EmptyState, Initials, LoadError, NativeSelect, Skeleton } from "@/components/ws/ui/misc";
import { Composer, ReplyBar } from "./composer";
import { MessageRecord, at, lastTouch } from "./messages";

/** The four channels a conversation can arrive on, and what you may do on each. */
const BLOCKS: Channel[] = ["email", "linkedin", "whatsapp", "call"];

const CAPABILITY: Record<Channel, string> = {
  email: "Reply here",
  linkedin: "Reply here",
  whatsapp: "View only",
  call: "Call and log",
  sms: "Not connected",
};

/**
 * Inbox — every conversation from every channel in one place. What you are
 * allowed to do differs by channel, and the screen says so before you try.
 */
export function InboxView() {
  const { refreshBadges } = useWorkspace();
  const [scope, setScope] = useState("all");
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [linkedInReady, setLinkedInReady] = useState(false);

  const list = useAsync(() => api.threads({ filter: "all" }), []);

  // Replies normally arrive by webhook. This asks as well, so a workspace whose webhook is not
  // registered still sees them; every message goes through the same idempotent writer.
  const reload = list.reload;
  useEffect(() => {
    const pull = () =>
      void api.syncInbox().then((answer) => {
        setLinkedInReady(answer.configured && answer.accounts > 0);
        if (answer.stored > 0) reload();
      }, () => undefined);
    pull();
    const timer = window.setInterval(pull, 30_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const threads = useMemo(() => list.data?.threads ?? [], [list.data]);
  const scoped = useMemo(
    () => (scope === "all" ? threads : threads.filter((t) => t.strategyName === scope)),
    [threads, scope],
  );
  const visible = channel === "all" ? scoped : scoped.filter((t) => t.channel === channel);
  const open = visible.find((t) => t.id === openId) ?? visible[0] ?? null;
  const needYou = scoped.filter((t) => t.needsReply).length;

  // A half-written reply must never carry into someone else's thread.
  useEffect(() => setComposing(false), [open?.id, scope, channel]);

  const scopeNames = useMemo(() => {
    const names = new Set(threads.map((t) => t.strategyName).filter((n): n is string => Boolean(n)));
    return [...names].sort();
  }, [threads]);

  return (
    <>
      <TopBar title="Inbox" />
      <PageBody>
        <Appear>
          <PageHeader
            title="Inbox"
            subtitle={
              list.state === "ready" && needYou > 0
                ? `${needYou} of ${scoped.length} ${scoped.length === 1 ? "conversation needs" : "conversations need"} you.`
                : "Every channel, one thread per person."
            }
            actions={
              scopeNames.length > 0 ? (
                <NativeSelect
                  id="inbox-scope"
                  label="Viewing"
                  value={scope}
                  onChange={(v) => {
                    setScope(v);
                    setOpenId(null);
                  }}
                  options={[
                    { value: "all", label: "All strategies" },
                    ...scopeNames.map((n) => ({ value: n, label: n })),
                  ]}
                  selectClassName="min-w-[232px]"
                />
              ) : undefined
            }
          />
        </Appear>

        <Appear index={1}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {BLOCKS.map((b) => {
              const inChannel = scoped.filter((t) => t.channel === b);
              const on = channel === b;
              return (
                <button
                  key={b}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setChannel(on ? "all" : b);
                    setOpenId(null);
                  }}
                  className={cn(
                    "flex flex-col gap-[6px] rounded-xl border px-3 pb-[9px] pt-[10px] text-left transition-colors",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-input",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "font-mono text-[11px] font-medium uppercase tracking-[0.09em]",
                        on ? "text-on-primary-muted" : "text-muted-foreground",
                      )}
                    >
                      {CHANNEL_NAME[b]}
                    </span>
                    {on && <span className="font-mono text-[10.5px] text-on-primary-muted">Filtered</span>}
                  </span>
                  <span className="flex items-baseline gap-[7px]">
                    <span className="font-mono text-[20px] font-bold leading-none tracking-[-0.02em]">
                      {inChannel.filter((t) => t.needsReply).length}
                    </span>
                    <span className={cn("text-[11.5px]", on ? "text-on-primary-muted" : "text-muted-foreground")}>
                      need you
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex items-center justify-between gap-2 font-mono text-[11px]",
                      on ? "text-on-primary-muted" : "text-muted-foreground",
                    )}
                  >
                    <span>{inChannel.length} open</span>
                    <span>{CAPABILITY[b]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Appear>

        <div
          className={cn(
            "grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-rows-1",
            open ? "lg:grid-cols-[minmax(250px,300px)_minmax(0,1fr)_minmax(200px,230px)]" : "lg:grid-cols-[minmax(250px,300px)_minmax(0,1fr)]",
          )}
        >
          <Card className="flex min-w-0 flex-col lg:min-h-0">
            <div className="flex items-center justify-between gap-[10px] border-b border-border px-4 py-[10px]">
              <h2 className="font-mono text-[13px] font-bold">
                {channel === "all" ? "All conversations" : CHANNEL_NAME[channel]} · {visible.length}
              </h2>
              {channel !== "all" && (
                <Button variant="outline" size="sm" className="h-[26px]" onClick={() => setChannel("all")}>
                  All channels
                </Button>
              )}
            </div>
            <div className="max-h-[420px] flex-1 overflow-y-auto lg:max-h-none lg:min-h-0">
              {list.state === "loading" ? (
                Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="flex gap-[11px] border-b border-divider px-4 py-[9px]">
                    <Skeleton className="size-[32px] rounded-full" />
                    <span className="flex flex-1 flex-col gap-[6px]">
                      <Skeleton className="h-[11px] w-[60%]" />
                      <Skeleton className="h-[10px] w-[85%]" />
                    </span>
                  </div>
                ))
              ) : list.state === "failed" ? (
                <LoadError message="We couldn't load your conversations." onRetry={list.reload} />
              ) : visible.length === 0 ? (
                <EmptyState>No conversations in this view. Change the strategy or clear the channel filter.</EmptyState>
              ) : (
                visible.map((t) => {
                  const selected = open?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-current={selected || undefined}
                      onClick={() => setOpenId(t.id)}
                      className={cn(
                        "flex w-full gap-[11px] border-b border-divider px-4 py-[9px] text-left transition-colors",
                        selected ? "bg-accent" : "bg-card hover:bg-chrome",
                      )}
                    >
                      <Initials text={t.initials} size={32} className={selected ? "bg-sunken" : undefined} />
                      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cn("truncate text-[12.5px]", selected ? "font-semibold" : "font-medium")}>
                            {t.audienceName}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{at(t.lastAt)}</span>
                        </span>
                        <span className="truncate font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-foreground">
                          {CHANNEL_NAME[t.channel]} · {t.company}
                        </span>
                        <span className={cn("truncate text-[11.5px]", selected ? "text-body" : "text-muted-foreground")}>
                          {t.preview}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          {open ? (
            <ThreadPane
              key={open.id}
              thread={open}
              linkedInReady={linkedInReady}
              composing={composing}
              onCompose={() => setComposing(true)}
              onCloseComposer={() => setComposing(false)}
              onReplied={() => {
                refreshBadges();
                list.reload();
              }}
            />
          ) : (
            <Card className="grid place-items-center p-10 text-center text-[12px] text-muted-foreground">
              Pick a conversation from the list.
            </Card>
          )}

          {open && <Rail thread={open} />}
        </div>
      </PageBody>
    </>
  );
}

function ThreadPane({
  thread,
  linkedInReady,
  composing,
  onCompose,
  onCloseComposer,
  onReplied,
}: {
  thread: Thread;
  linkedInReady: boolean;
  composing: boolean;
  onCompose: () => void;
  onCloseComposer: () => void;
  onReplied: () => void;
}) {
  const detail = useAsync(() => api.thread(thread.id), [thread.id]);
  const scroller = useRef<HTMLDivElement>(null);
  const messages = detail.state === "ready" ? detail.data.messages : [];

  // Open on the newest message — that is the one waiting for an answer.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, composing]);

  return (
    <Card className="flex min-w-0 flex-col lg:min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-[10px]">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-[9px]">
            <h2 className="text-[14px] font-semibold">
              {thread.audienceName}
              {thread.company ? ` · ${thread.company}` : ""}
            </h2>
            <ChannelChip>{CHANNEL_NAME[thread.channel]}</ChannelChip>
          </div>
          <span className="text-[11.5px] text-muted-foreground">
            {thread.role || "No title on file"} · last touch {lastTouch(thread, messages)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-[32px]" disabled title="Marking handled is not built yet">
            <Check aria-hidden strokeWidth={2.1} />
            Mark handled
          </Button>
        </div>
      </div>

      <div ref={scroller} className="flex max-h-[520px] flex-col gap-3 overflow-y-auto px-4 py-3 lg:max-h-none lg:min-h-0 lg:flex-1 [&>*]:shrink-0">
        {detail.state === "loading" ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-[86px] rounded-[10px]" />)
        ) : detail.state === "failed" ? (
          <LoadError message="We couldn't load this conversation." onRetry={detail.reload} />
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-muted-foreground">Nothing has been exchanged yet.</p>
        ) : (
          messages.map((m) => <MessageRecord key={m.id} m={m} thread={thread} />)
        )}
      </div>

      <Footer
        thread={thread}
        linkedInReady={linkedInReady}
        composing={composing}
        onCompose={onCompose}
        onCloseComposer={onCloseComposer}
        onReplied={() => {
          detail.reload();
          onReplied();
        }}
      />
    </Card>
  );
}

/** The footer depends on the channel: it says what you may do before you try. */
function Footer({
  thread,
  linkedInReady,
  composing,
  onCompose,
  onCloseComposer,
  onReplied,
}: {
  thread: Thread;
  linkedInReady: boolean;
  composing: boolean;
  onCompose: () => void;
  onCloseComposer: () => void;
  onReplied: () => void;
}) {
  return (
    <AnimatePresence initial={false} mode="wait">
      {composing ? (
        <Expand key="composer">
          <Composer thread={thread} onSaved={onReplied} onClose={onCloseComposer} />
        </Expand>
      ) : thread.channel === "email" || thread.channel === "linkedin" ? (
        <Expand key="bar">
          <ReplyBar onReply={onCompose} channel={thread.channel} linkedInReady={linkedInReady} />
        </Expand>
      ) : (
        <Expand key="handoff">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider bg-quiet px-4 pb-4 pt-[14px]">
            <p className="min-w-0 flex-1 basis-[280px] text-[11.5px] leading-[1.55] text-body">
              {thread.channel === "whatsapp"
                ? "WhatsApp is view-only here. Free-form replies have to go through WhatsApp Business."
                : "Calls are made on your own phone. Log the outcome afterwards so the lead's history stays true."}
            </p>
            <span className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={onCompose}>
                Note a reply here
              </Button>
              {thread.channel === "whatsapp" && (
                <a
                  href="https://business.whatsapp.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-[34px] items-center gap-[7px] rounded-lg bg-primary px-[13px] text-[12px] font-medium text-primary-foreground"
                >
                  Open in WhatsApp
                  <ExternalLink aria-hidden className="size-[14px]" strokeWidth={2} />
                </a>
              )}
            </span>
          </div>
        </Expand>
      )}
    </AnimatePresence>
  );
}

function Rail({ thread }: { thread: Thread }) {
  const fields: [string, string][] = [
    ["Title", thread.role || "Not on file"],
    ["Company", thread.company || "Not on file"],
    ["Owner", thread.ownerName],
    ["Stage", thread.stage],
    ["Score", String(thread.score)],
  ];

  return (
    <aside className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
      <Card className="flex flex-col gap-3 px-4 py-3">
        <h3 className="label-mono">Lead</h3>
        <dl className="flex flex-col gap-[10px]">
          {fields.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-[2px]">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="text-[11.5px] font-medium [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="flex flex-col gap-[10px] px-4 py-3">
        <h3 className="label-mono">Strategy</h3>
        <p className="text-[12.5px] font-medium">{thread.strategyName ?? "Not in a strategy"}</p>
        <p className="rounded-lg bg-secondary px-[11px] py-[9px] text-[11.5px] leading-[1.55] text-body">
          {thread.strategyName
            ? "A reply stops the sequence for this person."
            : "This person is not in a sequence, so nothing is scheduled for them."}
        </p>
      </Card>

      <Card className="flex flex-col gap-[11px] px-4 py-3">
        <h3 className="label-mono">Signals</h3>
        {thread.signals.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground">Nothing recorded on this conversation yet.</p>
        ) : (
          <ul className="flex flex-col gap-[9px]">
            {thread.signals.map((s) => (
              <li key={s.label} className="flex items-start justify-between gap-[9px]">
                <span className="text-[11.5px] text-body">{s.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">+{s.points}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </aside>
  );
}
