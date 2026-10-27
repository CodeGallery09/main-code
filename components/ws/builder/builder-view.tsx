"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, Lock, Plus, Trash2, TriangleAlert, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import { SENDING_ENABLED } from "@/lib/capabilities";
import { AUDIENCE_CAMPAIGN, AUDIENCE_WORKSPACE, type StepKind, type WorkflowGraph } from "@/lib/app/workflow";
import { SETUP_HREF } from "@/lib/nav";
import type { Channel } from "@/lib/data/types";
import { CHANNEL_NAME } from "@/lib/ws/channels";
import {
  newTouch,
  paceOf,
  PACE_GAPS,
  readPlan,
  repace,
  TOUCH_KINDS,
  TOUCH_WHAT,
  writePlan,
  type Pace,
  type Touch,
} from "@/lib/ws/plan";
import { cn, fmt } from "@/lib/ws/utils";
import { SidebarRail } from "@/components/ws/shell/sidebar";
import { Card } from "@/components/ws/ui/card";
import { Button } from "@/components/ws/ui/button";
import { ChannelTile } from "@/components/ws/ui/channel-tile";
import { Segmented } from "@/components/ws/ui/segmented";
import { Expand } from "@/components/ws/ui/motion";
import { NativeSelect, Switch } from "@/components/ws/ui/misc";

export type AudienceOption = { value: string; label: string; size: number | null };

type Save = "idle" | "pending" | "saving" | "saved" | "failed";

const SAVE_DELAY = 900;

/**
 * The strategy builder.
 *
 * Someone setting up outreach answers four questions — who, which channels,
 * how often, when to stop — so the page is exactly those four, top to bottom.
 * Deliberately absent: a node canvas, a step palette, a property inspector and
 * any message editing. The graph underneath still supports branching; a stored
 * plan that uses it is shown read-only rather than flattened.
 */
export function BuilderView({
  strategyId,
  initialName,
  status,
  graph,
  stored,
  audiences,
}: {
  strategyId: string;
  initialName: string;
  status: "live" | "paused" | "draft";
  graph: WorkflowGraph;
  stored: boolean;
  audiences: AudienceOption[];
}) {
  const base = useRef(graph);
  const read = useMemo(() => readPlan(graph), [graph]);

  const [name, setName] = useState(initialName);
  const [audience, setAudience] = useState(read.audience || AUDIENCE_CAMPAIGN);
  const [touches, setTouches] = useState<Touch[]>(read.touches);
  const [pace, setPace] = useState<Pace>(paceOf(read.touches));
  const [skipOther, setSkipOther] = useState(graph.settings.skipOther);
  const [picking, setPicking] = useState(false);
  const [save, setSave] = useState<Save>(stored ? "idle" : "saving");

  const [accounts, setAccounts] = useState<Channel[] | null>(null);
  useEffect(() => {
    let live = true;
    api
      .accounts()
      .then(({ accounts: rows }) => live && setAccounts([...new Set(rows.map((a) => a.channel as Channel))]))
      .catch(() => live && setAccounts([]));
    return () => {
      live = false;
    };
  }, []);

  const span = touches.length ? touches[touches.length - 1].day : 0;
  const chosen = audiences.find((a) => a.value === audience);

  /** A touch whose channel has no connected account can't run, and says so on the row. */
  const unconnected = useCallback(
    (channel: Channel) => accounts !== null && !accounts.includes(channel),
    [accounts],
  );
  const blocked = touches.filter((t) => unconnected(t.channel));

  const build = useCallback(
    (next: { audience: string; touches: Touch[]; skipOther: boolean }): WorkflowGraph => {
      const graphNow = writePlan(base.current, { audience: next.audience, touches: next.touches });
      return { ...graphNow, settings: { ...graphNow.settings, skipOther: next.skipOther } };
    },
    [],
  );

  // Autosave: debounced while typing, and flushed when the page goes away so a
  // half-typed name is never the thing that survives.
  const dirty = useRef(!stored);
  const latest = useRef({ name, audience, touches, skipOther });
  latest.current = { name, audience, touches, skipOther };

  const persist = useCallback(async () => {
    const snapshot = latest.current;
    setSave("saving");
    try {
      const next = build(snapshot);
      await api.saveWorkflow(strategyId, { name: snapshot.name.trim() || "Untitled strategy", graph: next });
      base.current = next;
      dirty.current = false;
      setSave("saved");
    } catch {
      setSave("failed");
    }
  }, [build, strategyId]);

  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(() => void persist(), SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [name, audience, touches, skipOther, persist]);

  useEffect(() => {
    const flush = () => {
      if (dirty.current) void persist();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persist]);

  /**
   * Every edit goes through here. A plan that branches is never written back
   * from this editor, so its controls are disabled and this is a no-op guard
   * rather than a silent flattening.
   */
  function change<T>(setter: (v: T) => void) {
    return (value: T) => {
      if (!read.linear) return;
      dirty.current = true;
      setSave("pending");
      setter(value);
    };
  }

  const setTouchList = change<Touch[]>((next) => setTouches(repace(next, pace)));
  const setPaceAndDates = (next: Pace) => {
    if (!read.linear) return;
    dirty.current = true;
    setSave("pending");
    setPace(next);
    setTouches((list) => repace(list, next));
  };

  const saveLabel: Record<Save, string> = {
    idle: "saved",
    pending: "unsaved changes",
    saving: "saving…",
    saved: "saved",
    failed: "not saved — we'll retry on your next change",
  };

  return (
    <div className="flex min-h-screen">
      <SidebarRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-chrome px-[22px] py-[11px]">
          <div className="flex min-w-0 items-center gap-[11px]">
            <Link
              href="/dashboard/strategies"
              aria-label="Back to strategies"
              className="flex size-[32px] shrink-0 items-center justify-center rounded-lg border border-input bg-card hover:bg-accent"
            >
              <ArrowLeft aria-hidden className="size-[15px]" strokeWidth={2} />
            </Link>
            <label htmlFor="strategy-name" className="sr-only">
              Strategy name
            </label>
            <input
              id="strategy-name"
              value={name}
              readOnly={!read.linear}
              onChange={(e) => change(setName)(e.target.value)}
              className="w-[290px] max-w-full rounded-md border border-transparent bg-transparent px-2 py-[5px] font-mono text-[15px] font-bold tracking-[-0.01em] hover:border-input"
            />
            <span
              className={cn("whitespace-nowrap font-mono text-[11px]", save === "failed" ? "text-warning" : "text-muted-foreground")}
            >
              {status === "draft" ? "Draft" : status === "live" ? "Live" : "Paused"} · {saveLabel[save]}
            </span>
          </div>
        </div>

        <div className="flex flex-1 justify-center px-5 pb-12 pt-[26px] sm:px-[22px]">
          <div className="flex w-full max-w-[820px] flex-col gap-[18px]">
            <div>
              <h1 className="mb-[6px] font-mono text-[24px] font-bold tracking-[-0.02em]">Here&apos;s the plan</h1>
              <p className="text-[13.5px] text-muted-foreground">
                {touches.length === 0
                  ? "Nothing in it yet. Add the first touch below."
                  : `${touches.length} ${touches.length === 1 ? "touch" : "touches"} over ${span} ${span === 1 ? "day" : "days"}. Change anything, or leave it as it is.`}
              </p>
            </div>

            {!read.linear && (
              <div role="alert" className="flex flex-wrap items-center gap-[11px] rounded-[10px] border border-warning-border bg-warning-bg px-[14px] py-3">
                <TriangleAlert aria-hidden className="size-[16px] shrink-0 text-warning" strokeWidth={1.9} />
                <span className="min-w-0 flex-1 text-[13px] leading-[1.5] text-warning">
                  This plan branches. The list below shows the touches on its main path; editing here would drop the
                  branches, so it is left as it is until branching has an editor of its own.
                </span>
              </div>
            )}

            {blocked.length > 0 && (
              <div role="alert" className="flex flex-wrap items-center gap-[11px] rounded-[10px] border border-warning-border bg-warning-bg px-[14px] py-3">
                <TriangleAlert aria-hidden className="size-[16px] shrink-0 text-warning" strokeWidth={1.9} />
                <span className="min-w-0 flex-1 basis-[260px] text-[13px] leading-[1.5] text-warning">
                  {blocked.length === 1 ? "One touch uses" : `${blocked.length} touches use`} a channel with no account
                  connected, so {blocked.length === 1 ? "it" : "they"} could never run.
                </span>
                <Link href={SETUP_HREF} className="inline-flex h-[30px] items-center rounded-md border border-warning-border bg-card px-[11px] text-[12.5px] font-medium text-warning">
                  Connect an account
                </Link>
              </div>
            )}

            {/* 1 · Who */}
            <Card className="flex flex-wrap items-center gap-3 px-4 py-[15px]">
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-primary text-primary-foreground">
                <Users aria-hidden className="size-[16px]" strokeWidth={1.8} />
              </span>
              <span className="flex min-w-0 flex-1 basis-[220px] flex-col gap-[2px]">
                <span className="label-mono text-[10.5px]">Who it goes to</span>
                <span className="text-[14px] font-semibold">{chosen?.label ?? "Choose an audience"}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  {chosen?.size === null || chosen === undefined
                    ? "Counted when the strategy runs"
                    : `${fmt(chosen.size)} ${chosen.size === 1 ? "lead" : "leads"}`}
                  {skipOther ? " · anyone already in another strategy is skipped" : ""}
                </span>
              </span>
              <NativeSelect
                id="builder-audience"
                label="Audience"
                hideLabel
                value={audience}
                onChange={change(setAudience)}
                options={audiences.map((a) => ({ value: a.value, label: a.label }))}
                disabled={!read.linear}
                selectClassName="min-w-[240px]"
              />
            </Card>

            {/* 2 + 3 · What happens, and how often */}
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-[14px]">
                <h2 className="font-mono text-[14px] font-bold tracking-[-0.01em]">What happens, in order</h2>
                <span className="flex items-center gap-[9px]">
                  <span className="label-mono text-[10.5px]">Pace</span>
                  <Segmented<Pace>
                    label="How persistent"
                    size="sm"
                    value={pace}
                    onChange={setPaceAndDates}
                    disabled={!read.linear}
                    options={(Object.keys(PACE_GAPS) as Pace[]).map((p) => ({
                      value: p,
                      label: p[0].toUpperCase() + p.slice(1),
                    }))}
                  />
                </span>
              </div>

              <ol className="px-4 pb-[14px] pt-2">
                {touches.length === 0 && (
                  <li className="py-6 text-center text-[13px] text-muted-foreground">
                    Add the first touch to get started.
                  </li>
                )}
                {touches.map((t) => {
                  const flagged = unconnected(t.channel);
                  return (
                    <li
                      key={t.id}
                      className={cn(
                        "flex items-center gap-[13px]",
                        flagged
                          ? "my-px rounded-[10px] border border-warning-border bg-warning-surface p-3"
                          : "border-b border-divider py-[13px]",
                      )}
                    >
                      <span className="flex shrink-0 basis-[62px] flex-col gap-px">
                        <span className="font-mono text-[13px] font-bold">Day {t.day}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {t.day === 1 && t.gap === 0 ? "start" : t.gap === 0 ? "same day" : `+${t.gap} days`}
                        </span>
                      </span>
                      <ChannelTile channel={t.channel} />
                      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                        <span className="truncate text-[13.5px] font-semibold">{t.what}</span>
                        <span className={cn("truncate text-[12.5px]", flagged ? "text-warning" : "text-muted-foreground")}>
                          {flagged
                            ? `No ${CHANNEL_NAME[t.channel]} account is connected, so this step can't run`
                            : "Uses the message saved on this step"}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="danger"
                          size="icon-sm"
                          aria-label={`Remove “${t.what}”`}
                          disabled={!read.linear}
                          onClick={() => setTouchList(touches.filter((x) => x.id !== t.id))}
                        >
                          <Trash2 aria-hidden strokeWidth={1.8} />
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ol>

              <div className="px-4 pb-4">
                <AnimatePresence initial={false} mode="wait">
                  {!picking ? (
                    <Expand key="add">
                      <Button variant="dashed" disabled={!read.linear} onClick={() => setPicking(true)}>
                        <Plus aria-hidden strokeWidth={2.2} />
                        Add a touch
                      </Button>
                    </Expand>
                  ) : (
                    <Expand key="pick">
                      <div className="flex flex-col gap-[10px] rounded-[10px] border border-border bg-chrome px-[13px] py-3">
                        <div className="flex items-center justify-between gap-[10px]">
                          <span className="label-mono text-[10.5px]">Add a touch on which channel?</span>
                          <Button variant="ghost" size="icon-sm" aria-label="Cancel" onClick={() => setPicking(false)}>
                            <X aria-hidden strokeWidth={2.2} />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {TOUCH_KINDS.map((kind) => (
                            <AddTouch
                              key={kind}
                              kind={kind}
                              onAdd={() => {
                                setTouchList([...touches, newTouch(kind, pace, touches.length)]);
                                setPicking(false);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </Expand>
                  )}
                </AnimatePresence>
              </div>
            </Card>

            {/* 4 · When to stop */}
            <Card>
              <div className="border-b border-border px-4 py-[14px]">
                <h2 className="font-mono text-[14px] font-bold tracking-[-0.01em]">When to stop</h2>
              </div>
              <div className="px-4 pb-[14px] pt-[6px]">
                <Rule
                  title="Stop as soon as they reply"
                  note="On any channel. The thread moves to your Inbox and nothing else goes out."
                >
                  <span className="inline-flex items-center gap-[6px] font-mono text-[10.5px] text-muted-foreground">
                    <Lock aria-hidden className="size-[13px]" strokeWidth={1.8} />
                    Always on
                  </span>
                </Rule>
                <Rule
                  title="Skip anyone already in another strategy"
                  note="A lead is only ever in one sequence, so nobody gets two at once."
                >
                  <Switch
                    checked={skipOther}
                    onChange={change(setSkipOther)}
                    disabled={!read.linear}
                    label="Skip anyone already in another strategy"
                  />
                </Rule>
              </div>
            </Card>

            {/* Outcome */}
            <div className="flex flex-wrap items-center gap-[14px] rounded-xl bg-accent px-4 py-[15px]">
              <span className="flex min-w-0 flex-1 basis-[280px] flex-col gap-1">
                <span className="text-[13.5px] font-semibold">
                  {SENDING_ENABLED ? "If you turn this on now" : "Nothing sends yet"}
                </span>
                <span className="text-[12.5px] leading-[1.55] text-body">
                  {SENDING_ENABLED
                    ? `Each person's plan runs ${span} days, inside your sending window.`
                    : `This plan is saved and ready: ${touches.length} ${touches.length === 1 ? "touch" : "touches"} over ${span} ${span === 1 ? "day" : "days"}. There is no sender behind it yet, so turning a strategy on would be a claim we can't keep — connect your accounts in Setup and this is the first thing that will run.`}
                </span>
              </span>
              <Link
                href={SETUP_HREF}
                className="inline-flex h-[34px] items-center rounded-lg border border-input bg-card px-[13px] text-[13px] font-medium"
              >
                Go to Setup
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddTouch({ kind, onAdd }: { kind: StepKind; onAdd: () => void }) {
  const channel: Channel = kind === "email" ? "email" : kind === "call" ? "call" : "linkedin";
  return (
    <button
      type="button"
      onClick={onAdd}
      className="inline-flex h-[38px] items-center gap-2 rounded-[9px] border border-input bg-card pl-2 pr-[13px] text-[13px] font-medium transition-colors hover:bg-accent"
    >
      <ChannelTile channel={channel} size="sm" />
      {TOUCH_WHAT[kind]}
    </button>
  );
}

function Rule({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-divider py-3 last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-[13.5px] font-medium">{title}</span>
        <span className="text-[12.5px] text-muted-foreground">{note}</span>
      </span>
      {children}
    </div>
  );
}

export { AUDIENCE_WORKSPACE };
