"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { api, fieldErrorsOf } from "@/lib/api";
import {
  AUDIENCE_WORKSPACE,
  graphForChannel,
  graphFromTemplate,
  TEMPLATES,
  type StepChannel,
  type WorkflowGraph,
} from "@/lib/app/workflow";
import { SENDING_CHANNELS } from "@/lib/capabilities";
import { SETUP_HREF } from "@/lib/nav";
import type { Channel } from "@/lib/data/types";
import { CHANNEL_NAME } from "@/lib/ws/channels";
import { cn } from "@/lib/ws/utils";
import { ChannelTile } from "@/components/ws/ui/channel-tile";
import { NativeSelect } from "@/components/ws/ui/misc";

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
 * Does a channel put something in front of the lead today?
 *
 * LinkedIn sends for real and a call step becomes a to-do a person can act on. Email cannot be
 * connected at all yet, so a play that contains it is partly decorative — and a user who finds
 * that out from the activity log after launching has already spent their first impression on it.
 * The play cards say so before the plan is created.
 */
const canAct = (channel: Channel) => channel === "call" || (SENDING_CHANNELS as readonly string[]).includes(channel);

/**
 * New strategy — selection only. Pick how it runs, and the builder opens on a
 * draft. Nothing is written on a GET: a link prefetch would create a strategy.
 */
export function NewStrategyView() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("multi");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The audiences this workspace actually has, with their live counts. */
  const [options, setOptions] = useState<{ value: string; label: string; size: number }[] | null>(null);
  const [audience, setAudience] = useState("");

  /**
   * **The audience is chosen here, not in the builder.**
   *
   * A plan's first step used to default to "Leads in this strategy", which for a strategy created
   * one second ago is always nobody — so every first launch was refused with "there is nobody in
   * this plan's audience yet" and the user had to work out, unaided, that the fix was a select
   * inside the first card of the canvas. Asking here costs one field and removes the dead end.
   */
  useEffect(() => {
    let alive = true;
    void Promise.all([api.segments(), api.audiences({ pageSize: 1 })])
      .then(([{ segments }, leads]) => {
        if (!alive) return;
        const rows = [
          { value: AUDIENCE_WORKSPACE, label: "All leads", size: leads.total },
          ...segments.map((seg) => ({ value: seg.id, label: seg.name, size: seg.audienceCount })),
        ];
        setOptions(rows);
        // Default to the newest audience that has someone in it, else everyone.
        setAudience((rows.find((r) => r.value !== AUDIENCE_WORKSPACE && r.size > 0) ?? rows[0]).value);
      })
      .catch(() => alive && setOptions([]));
    return () => {
      alive = false;
    };
  }, []);

  const chosen = useMemo(() => options?.find((o) => o.value === audience) ?? null, [options, audience]);
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
      await api.saveWorkflow(strategy.id, {
        name,
        graph: graph ?? graphFromTemplate(key === "blank" ? "blank" : key, audience || undefined),
      });
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
              Pick how it runs and who it reaches. Nothing goes out until you launch it from Strategies.
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

          <section className="flex flex-col gap-[7px] rounded-xl border border-border bg-card px-4 py-[13px]">
            <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
              <h2 className="font-mono text-[14px] font-bold tracking-[-0.01em]">Who is this for?</h2>
              <span className="text-[11.5px] text-muted-foreground">
                You can change it on the first step of the plan.
              </span>
            </div>
            {options === null ? (
              <p className="text-[12px] text-muted-foreground">Reading your audiences…</p>
            ) : options.length === 0 || options.every((o) => o.size === 0) ? (
              <p className="text-[12px] leading-[1.55] text-body">
                There are no leads in this workspace yet, so there is nobody for a plan to reach.{" "}
                <Link href="/dashboard/audiences" className="font-medium text-foreground hover:underline">
                  Add or upload some first
                </Link>
                .
              </p>
            ) : (
              <>
                <NativeSelect
                  id="new-strategy-audience"
                  label="Audience"
                  hideLabel
                  value={audience}
                  onChange={setAudience}
                  options={options.map((o) => ({
                    value: o.value,
                    label: `${o.label} · ${o.size} ${o.size === 1 ? "lead" : "leads"}`,
                  }))}
                  className="w-full sm:w-[340px]"
                  selectClassName="w-full"
                />
                <p className="text-[11.5px] leading-[1.55] text-muted-foreground">
                  {chosen && chosen.size === 0
                    ? "That audience is empty, so there would be nobody to enrol. Pick another one."
                    : "Only leads with consent recorded, and who are not already in another strategy, are enrolled."}
                </p>
              </>
            )}
          </section>

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
                      <span className="flex flex-wrap items-center gap-x-[6px] font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-foreground">
                        {play.ch.map((c, i) => {
                          const channel = CHANNEL_OF[c];
                          return (
                            <span key={c} className="contents">
                              {i > 0 ? <span aria-hidden>·</span> : null}
                              {/* Struck through when the channel cannot put anything in front of a
                                  lead today, so the separators must sit outside the struck span. */}
                              <span
                                className={cn(!canAct(channel) && "line-through decoration-from-font")}
                                title={canAct(channel) ? undefined : `${CHANNEL_NAME[channel]} can't send yet`}
                              >
                                {CHANNEL_NAME[channel]}
                              </span>
                            </span>
                          );
                        })}
                      </span>
                    </button>
                  ))
                : SINGLE.map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void start(
                          channel,
                          `${CHANNEL_NAME[channel]} sequence`,
                          [channel],
                          graphForChannel(SHORT_OF[channel], audience || undefined),
                        )
                      }
                      className="flex items-center gap-[10px] rounded-[11px] border border-border bg-card px-[15px] py-[10px] text-left transition-colors hover:border-input disabled:opacity-60"
                    >
                      <ChannelTile channel={channel} size="sm" />
                      <span className="flex min-w-0 flex-col gap-[2px]">
                        <span className="text-[12.5px] font-semibold">{CHANNEL_NAME[channel]}</span>
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-muted-foreground">
                          {busy === channel
                            ? "Opening…"
                            : canAct(channel)
                              ? "Touch · pause · follow-up"
                              : "Can't send yet"}
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
            <strong className="font-semibold text-body">LinkedIn is the only channel that sends today.</strong> A call
            step becomes a to-do for a person; an email step is written down with the reason it could not go out,
            because no mailbox can be connected yet. Working hours and daily limits come from the account the plan
            sends from, in{" "}
            <Link href={SETUP_HREF} className="font-medium text-foreground hover:underline">
              Setup
            </Link>
            . Nothing goes out until you launch it from Strategies.
          </p>
        </div>
      </div>
    </div>
  );
}
