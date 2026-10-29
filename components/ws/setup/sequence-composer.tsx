"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { api, fieldErrorsOf } from "@/lib/api";
import {
  AUDIENCE_WORKSPACE,
  copyField,
  defaults,
  graphFromSequence,
  MERGE_VARS,
  SEQUENCE_KINDS,
  STEPS,
  type SequenceStep,
  type StepData,
  type StepKind,
} from "@/lib/app/workflow";
import { SENDING_CHANNELS } from "@/lib/capabilities";
import type { Channel, Strategy } from "@/lib/data/types";
import { CHANNEL_NAME } from "@/lib/ws/channels";
import { cn } from "@/lib/ws/utils";
import { EASE_OUT } from "@/components/ws/ui/motion";
import { Button } from "@/components/ws/ui/button";
import { ChannelTile } from "@/components/ws/ui/channel-tile";
import { NativeSelect } from "@/components/ws/ui/misc";

/** A LinkedIn invitation note is cut off past this; the free-account limit is lower still. */
const NOTE_LIMIT = 300;
const FREE_NOTE_LIMIT = 200;

/** The workspace's own word for the channel each touch sends on. */
const CHANNEL_OF: Record<string, Channel> = {
  li: "linkedin",
  mail: "email",
  wa: "whatsapp",
  call: "call",
  sms: "sms",
};

const channelOf = (kind: StepKind): Channel => CHANNEL_OF[STEPS[kind].ch ?? "li"];

/**
 * Does this touch put something in front of the lead today? LinkedIn sends for real and a call
 * becomes a to-do someone can act on; email cannot be connected yet, so a sequence containing one
 * is partly a plan for later. Said here rather than discovered in the run log after launching.
 */
const canAct = (kind: StepKind) => {
  const channel = channelOf(kind);
  return channel === "call" || (SENDING_CHANNELS as readonly string[]).includes(channel);
};

const WHAT: Partial<Record<StepKind, string>> = {
  li_invite: "LinkedIn invite",
  li_msg: "LinkedIn message",
  email: "Email",
  call: "Call task",
};

const COPY_LABEL: Partial<Record<StepKind, string>> = {
  li_invite: "Note on the connection request",
  li_msg: "Message",
  email: "Body",
  call: "What to cover on the call",
};

/** One row of the composer. `body` always holds whatever field this kind carries its words in. */
type Draft = { uid: number; kind: StepKind; wait: number; subject: string; body: string };

let uid = 0;
const draftOf = (kind: StepKind, wait: number): Draft => {
  const d = defaults(kind);
  return {
    uid: (uid += 1),
    kind,
    wait,
    subject: (d.subject as string | undefined) ?? "",
    body: (d[copyField(kind)] as string | undefined) ?? "",
  };
};

/**
 * Write a sequence here, in the order it goes out.
 *
 * Messages is where every piece of copy in the workspace already lives, so it is where writing a
 * new one belongs. Saving does exactly what the builder's canvas does — it creates a strategy and
 * its plan — so the result is a real sequence that is listed on Strategies and launches there,
 * not a template sitting in a library that cannot send. Branching, A/B and goals stay on the
 * canvas; this is the straight line, which is most of them.
 */
export function SequenceComposer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (strategy: Strategy) => void;
}) {
  const still = useReducedMotion();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<Draft[]>(() => [draftOf("li_invite", 0)]);
  const [options, setOptions] = useState<{ value: string; label: string; size: number }[] | null>(null);
  const [audience, setAudience] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The same question the New strategy screen asks, for the same reason: a plan that starts on an
  // audience with nobody in it is refused at launch, and the refusal is hard to act on.
  useEffect(() => {
    if (!open || options) return;
    let alive = true;
    void Promise.all([api.segments(), api.audiences({ pageSize: 1 })])
      .then(([{ segments }, leads]) => {
        if (!alive) return;
        const rows = [
          { value: AUDIENCE_WORKSPACE, label: "All leads", size: leads.total },
          ...segments.map((seg) => ({ value: seg.id, label: seg.name, size: seg.audienceCount })),
        ];
        setOptions(rows);
        setAudience((rows.find((r) => r.value !== AUDIENCE_WORKSPACE && r.size > 0) ?? rows[0]).value);
      })
      .catch(() => alive && setOptions([]));
    return () => {
      alive = false;
    };
  }, [open, options]);

  const edit = (uidOf: number, patch: Partial<Draft>) =>
    setSteps((current) => current.map((s) => (s.uid === uidOf ? { ...s, ...patch } : s)));

  /** Changing the kind swaps in that kind's own starting copy, unless the writer has typed. */
  function changeKind(step: Draft, kind: StepKind) {
    const stock = defaults(step.kind);
    const untouched = step.body === ((stock[copyField(step.kind)] as string | undefined) ?? "");
    const next = defaults(kind);
    edit(step.uid, {
      kind,
      subject: untouched ? ((next.subject as string | undefined) ?? "") : step.subject,
      body: untouched ? ((next[copyField(kind)] as string | undefined) ?? "") : step.body,
    });
  }

  function move(index: number, by: -1 | 1) {
    setSteps((current) => {
      const to = index + by;
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  const channels = useMemo(
    () => [...new Set(steps.map((s) => channelOf(s.kind)))] as Channel[],
    [steps],
  );
  const overLong = steps.some((s) => s.kind === "li_invite" && s.body.length > NOTE_LIMIT);
  const ready = name.trim().length > 0 && steps.length > 0 && !overLong;

  async function save() {
    setBusy(true);
    setError("");
    const title = name.trim();
    try {
      const { strategy } = await api.createStrategy({
        name: title,
        type: "multichannel",
        status: "draft",
        channels,
      });
      const plan: SequenceStep[] = steps.map((s, i) => {
        const data: StepData = { [copyField(s.kind)]: s.body };
        if (s.kind === "email") data.subject = s.subject;
        return { kind: s.kind, wait: i === 0 ? 0 : s.wait, data };
      });
      await api.saveWorkflow(strategy.id, {
        name: title,
        graph: graphFromSequence(plan, audience || undefined),
      });
      onCreated(strategy);
    } catch (caught) {
      const fields = fieldErrorsOf(caught);
      setError(
        fields
          ? Object.values(fields)[0]
          : caught instanceof Error
            ? caught.message
            : "That sequence could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,19,0.28)] p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: still ? 0 : 0.14 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Write a sequence"
            className="flex max-h-[calc(100dvh-32px)] w-full max-w-[620px] flex-col overflow-hidden rounded-xl border border-border bg-card"
            initial={{ opacity: 0, y: still ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: still ? 0 : 6 }}
            transition={still ? { duration: 0 } : EASE_OUT}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-4 py-[10px]">
              <h2 className="font-mono text-[13px] font-bold tracking-[-0.01em]">Write a sequence</h2>
              <p className="mt-[2px] text-[11.5px] leading-[1.55] text-muted-foreground">
                The touches in the order they go out. Saving creates the strategy, so you launch it from
                Strategies when it reads right.
              </p>
            </div>

            <form
              method="post"
              className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-4 py-[12px]"
              onSubmit={(e) => {
                e.preventDefault();
                if (ready && !busy) void save();
              }}
            >
              <span className="flex flex-col gap-[5px]">
                <label htmlFor="seq-name" className="label-mono">
                  Name
                </label>
                <input
                  id="seq-name"
                  value={name}
                  required
                  placeholder="Q4 founders"
                  onChange={(e) => setName(e.target.value)}
                  className="h-[34px] rounded-lg border border-input bg-card px-[11px] text-[12px]"
                />
              </span>

              <span className="flex flex-col gap-[5px]">
                <label htmlFor="seq-audience" className="label-mono">
                  Who it is for
                </label>
                <select
                  id="seq-audience"
                  value={audience}
                  disabled={options === null}
                  onChange={(e) => setAudience(e.target.value)}
                  className="h-[34px] rounded-lg border border-input bg-card px-[9px] text-[12px]"
                >
                  {options === null ? (
                    <option value="">Loading your audiences…</option>
                  ) : (
                    options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label} · {o.size} {o.size === 1 ? "lead" : "leads"}
                      </option>
                    ))
                  )}
                </select>
              </span>

              <div className="flex flex-col gap-[10px]">
                <span className="label-mono">The sequence</span>
                {steps.map((step, i) => (
                  <StepCard
                    key={step.uid}
                    step={step}
                    index={i}
                    last={i === steps.length - 1}
                    only={steps.length === 1}
                    onKind={(kind) => changeKind(step, kind)}
                    onEdit={(patch) => edit(step.uid, patch)}
                    onMove={(by) => move(i, by)}
                    onRemove={() => setSteps((c) => c.filter((s) => s.uid !== step.uid))}
                  />
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => setSteps((c) => [...c, draftOf(c.some((s) => s.kind === "li_invite") ? "li_msg" : "li_invite", 3)])}
                >
                  <Plus aria-hidden strokeWidth={2} />
                  Add a touch
                </Button>
              </div>

              <p className="rounded-[10px] bg-accent px-[13px] py-[8px] text-[11.5px] leading-[1.55] text-muted-foreground">
                Branches, A/B splits and goals are drawn on the canvas — open the sequence in the builder once
                it is saved and it is all there. A token with nothing behind it sends as a blank, so keep one
                out unless every lead in the audience has it.
              </p>

              {error ? (
                <p role="alert" className="text-[11.5px] text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-[8px] pt-[2px]">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                  {busy ? "Saving…" : "Create the sequence"}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StepCard({
  step,
  index,
  last,
  only,
  onKind,
  onEdit,
  onMove,
  onRemove,
}: {
  step: Draft;
  index: number;
  last: boolean;
  only: boolean;
  onKind: (kind: StepKind) => void;
  onEdit: (patch: Partial<Draft>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const id = `seq-${step.uid}`;
  const invite = step.kind === "li_invite";

  return (
    <div className="flex flex-col gap-[10px] rounded-[10px] border border-border bg-chrome px-[14px] py-3">
      <div className="flex flex-wrap items-center gap-[9px]">
        <ChannelTile channel={channelOf(step.kind)} />
        <NativeSelect
          id={`${id}-kind`}
          label={`Touch ${index + 1}`}
          value={step.kind}
          onChange={(v) => onKind(v as StepKind)}
          options={SEQUENCE_KINDS.map((k) => ({ value: k, label: WHAT[k] ?? STEPS[k].label }))}
          className="min-w-0"
        />
        <span className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Move touch ${index + 1} earlier`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp aria-hidden strokeWidth={1.8} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Move touch ${index + 1} later`}
          disabled={last}
          onClick={() => onMove(1)}
        >
          <ArrowDown aria-hidden strokeWidth={1.8} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Remove touch ${index + 1}`}
          disabled={only}
          onClick={onRemove}
        >
          <Trash2 aria-hidden strokeWidth={1.8} />
        </Button>
      </div>

      {index === 0 ? (
        <p className="text-[11px] text-muted-foreground">Goes out as soon as the sequence is launched.</p>
      ) : (
        <span className="flex flex-wrap items-center gap-[8px]">
          <label htmlFor={`${id}-wait`} className="label-mono">
            Wait first
          </label>
          <input
            id={`${id}-wait`}
            type="number"
            min={0}
            max={60}
            value={step.wait}
            onChange={(e) => onEdit({ wait: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })}
            className="h-[30px] w-[66px] rounded-lg border border-input bg-card px-[9px] text-[12px]"
          />
          <span className="text-[11.5px] text-muted-foreground">business days after the touch above</span>
        </span>
      )}

      {step.kind === "email" && (
        <span className="flex flex-col gap-[5px]">
          <label htmlFor={`${id}-subject`} className="label-mono">
            Subject
          </label>
          <input
            id={`${id}-subject`}
            value={step.subject}
            onChange={(e) => onEdit({ subject: e.target.value })}
            className="h-[34px] rounded-lg border border-input bg-card px-[11px] text-[12px]"
          />
        </span>
      )}

      <span className="flex flex-col gap-[5px]">
        <label htmlFor={`${id}-body`} className="label-mono">
          {COPY_LABEL[step.kind] ?? "Message"}
        </label>
        <textarea
          id={`${id}-body`}
          rows={invite ? 4 : 6}
          value={step.body}
          onChange={(e) => onEdit({ body: e.target.value })}
          className="w-full resize-y rounded-lg border border-input bg-card px-[12px] py-[9px] text-[12.5px] leading-[1.6]"
        />
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <span className="label-mono">Insert</span>
        {MERGE_VARS.map((token) => (
          <button
            key={token}
            type="button"
            onClick={() => onEdit({ body: `${step.body}${token}` })}
            className="inline-flex h-[26px] items-center rounded-md border border-input bg-card px-[9px] font-mono text-[11px]"
          >
            {token}
          </button>
        ))}
        {invite && (
          <span
            className={cn(
              "ml-auto font-mono text-[11px]",
              step.body.length > NOTE_LIMIT ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {step.body.length} / {NOTE_LIMIT}
          </span>
        )}
      </div>

      {invite && (
        <p className="text-[11px] leading-[1.55] text-muted-foreground">
          A free LinkedIn account takes only a handful of personalised invites a month and caps the note at{" "}
          {FREE_NOTE_LIMIT} characters — past that LinkedIn sends the request bare and tells us nothing.
        </p>
      )}

      {!canAct(step.kind) && (
        <p className="text-[11px] leading-[1.55] text-warning">
          {CHANNEL_NAME[channelOf(step.kind)]} cannot be connected yet, so this touch is written down with its
          reason instead of going out. Everything before and after it still runs.
        </p>
      )}
    </div>
  );
}
