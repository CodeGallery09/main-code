"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { api, fieldErrorsOf } from "@/lib/api";
import { graphForChannel, graphFromTemplate, TEMPLATES, type StepChannel, type WorkflowGraph } from "@/lib/app/workflow";
import { SETUP_HREF } from "@/lib/nav";
import type { Channel } from "@/lib/data/types";
import { CHANNEL_NAME } from "@/lib/ws/channels";
import { cn } from "@/lib/ws/utils";
import { ChannelTile } from "@/components/ws/ui/channel-tile";

type Kind = "multi" | "single";

const KINDS: { id: Kind; name: string; channels: string; note: string }[] = [
  {
    id: "multi",
    name: "Multichannel",
    channels: "Any channel · any order",
    note: "Move between LinkedIn, email and calls in one sequence.",
  },
  {
    id: "single",
    name: "Single channel",
    channels: "One channel only",
    note: "Offers, reminders, announcements — start to finish on one channel.",
  },
];

/** The short-code channels a stored template uses, in the workspace's own vocabulary. */
const CHANNEL_OF: Record<string, Channel> = {
  li: "linkedin",
  mail: "email",
  wa: "whatsapp",
  call: "call",
  sms: "sms",
};

const SHORT_OF: Record<string, StepChannel> = { linkedin: "li", email: "mail", call: "call", whatsapp: "wa", sms: "sms" };

/** Only channels that can run today are offered — the same rule the palette follows. */
const SINGLE: Channel[] = ["linkedin", "email", "call"];

/**
 * New strategy — selection only. Pick how it runs, and the builder opens on a
 * draft. Nothing is written on a GET: a link prefetch would create a strategy.
 */
export function NewStrategyView() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("multi");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plays = TEMPLATES.filter((t) => t.k !== "blank");

  async function start(key: string, name: string, channels: Channel[], graph?: WorkflowGraph) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const { strategy } = await api.createStrategy({
        name,
        type: "multichannel",
        status: "draft",
        channels: channels.length ? channels : ["linkedin", "email"],
      });
      await api.saveWorkflow(strategy.id, { name, graph: graph ?? graphFromTemplate(key === "blank" ? "blank" : key) });
      router.push(`/dashboard/workflows/${strategy.id}`);
    } catch (caught) {
      const fields = fieldErrorsOf(caught);
      setError(
        fields
          ? Object.values(fields)[0]
          : caught instanceof Error
            ? caught.message
            : "That strategy could not be started.",
      );
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col lg:min-h-0 lg:flex-1">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-chrome px-5 py-[6px]">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/strategies"
            aria-label="Back to strategies"
            className="flex size-[28px] items-center justify-center rounded-lg border border-input bg-card hover:bg-accent"
          >
            <ArrowLeft aria-hidden className="size-[15px]" strokeWidth={2} />
          </Link>
          <span className="font-mono text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            New strategy
          </span>
        </div>
        <Link href="/dashboard/strategies" className="text-[12px] text-body hover:underline">
          Cancel
        </Link>
      </div>

      <div className="flex flex-1 justify-center px-5 pb-5 pt-5 sm:px-6 lg:min-h-0 lg:overflow-y-auto">
        <div className="flex w-full max-w-[980px] flex-col gap-4">
          <div>
            <h1 className="mb-[3px] font-mono text-[18px] font-bold tracking-[-0.02em]">
              What are you reaching out for?
            </h1>
            <p className="text-[12.5px] text-muted-foreground">
              Pick how this one runs. You choose the audience in the next screen, and nothing goes out until you launch it.
            </p>
          </div>

          {error ? (
            <p role="alert" className="rounded-[10px] border border-warning-border bg-warning-bg px-[14px] py-3 text-[12px] text-warning">
              {error}
            </p>
          ) : null}

          <div
            role="radiogroup"
            aria-label="Kind of strategy"
            className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[14px]"
          >
            {KINDS.map((k) => {
              const on = k.id === kind;
              return (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setKind(k.id)}
                  className={cn(
                    "flex flex-col gap-[7px] rounded-xl bg-card text-left transition-colors",
                    on ? "border-2 border-primary px-[17px] py-4" : "border border-border px-4 py-[17px] hover:border-input",
                  )}
                >
                  <span className="flex items-center justify-between gap-[10px]">
                    <span className="text-[13px] font-semibold">{k.name}</span>
                    <span
                      aria-hidden
                      className={cn("size-[16px] rounded-full", on ? "border-[5px] border-primary" : "border border-input")}
                    />
                  </span>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
                    {k.channels}
                  </span>
                  <span className="text-[12px] leading-[1.55] text-body">{k.note}</span>
                </button>
              );
            })}
          </div>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
              <h2 className="font-mono text-[14px] font-bold tracking-[-0.01em]">
                {kind === "multi" ? "Start from a play" : "Pick the channel"}
              </h2>
              <span className="text-[11.5px] text-muted-foreground">
                {kind === "multi"
                  ? "Each play opens a ready-made plan you can change before anything sends."
                  : "The whole plan stays on this channel."}
              </span>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              {kind === "multi"
                ? plays.map((play) => (
                    <button
                      key={play.k}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void start(play.k, play.name, play.ch.map((c) => CHANNEL_OF[c]))}
                      className="flex flex-col gap-[7px] rounded-[11px] border border-border bg-card px-[15px] py-[10px] text-left transition-colors hover:border-input disabled:opacity-60"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-semibold">{play.name}</span>
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                          {busy === play.k ? "Opening…" : `${play.steps} steps`}
                        </span>
                      </span>
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-foreground">
                        {play.ch.map((c) => CHANNEL_NAME[CHANNEL_OF[c]]).join(" · ")}
                      </span>
                    </button>
                  ))
                : SINGLE.map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void start(channel, `${CHANNEL_NAME[channel]} sequence`, [channel], graphForChannel(SHORT_OF[channel]))
                      }
                      className="flex items-center gap-[10px] rounded-[11px] border border-border bg-card px-[15px] py-[10px] text-left transition-colors hover:border-input disabled:opacity-60"
                    >
                      <ChannelTile channel={channel} size="sm" />
                      <span className="flex min-w-0 flex-col gap-[2px]">
                        <span className="text-[12.5px] font-semibold">{CHANNEL_NAME[channel]}</span>
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-foreground">
                          {busy === channel ? "Opening…" : "Touch · pause · follow-up"}
                        </span>
                      </span>
                    </button>
                  ))}

              {kind === "multi" ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void start("blank", "Untitled strategy", [])}
                  className="flex flex-col gap-[7px] rounded-[11px] border border-dashed border-[#d3cfc6] px-[15px] py-[10px] text-left transition-colors hover:bg-card disabled:opacity-60"
                >
                  <span className="flex items-center gap-2">
                    <Plus aria-hidden className="size-[15px] text-body" strokeWidth={2} />
                    <span className="text-[12.5px] font-semibold">Blank</span>
                  </span>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-foreground">
                    {busy === "blank" ? "Opening…" : "Any channel"}
                  </span>
                </button>
              ) : null}
            </div>
          </section>

          <p className="border-t border-border pt-[14px] text-[11.5px] leading-[1.55] text-muted-foreground">
            Every strategy follows the same rules: daily limits per account, quiet hours, the workspace contact limit,
            and stop-on-reply. Those live in{" "}
            <Link href={SETUP_HREF} className="font-medium text-foreground hover:underline">
              Setup
            </Link>
            , not here.
          </p>
        </div>
      </div>
    </div>
  );
}
