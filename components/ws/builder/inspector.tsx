"use client";

import Link from "next/link";
import { Trash2, TriangleAlert } from "lucide-react";
import {
  CHECKS,
  GOALS,
  MERGE_VARS,
  OFFERED_CHECKS,
  PORT_LABEL,
  STEPS,
  stepLabel,
  type AudienceList,
  type CheckKey,
  type FlowEdge,
  type GoalKey,
  type Port,
  type StepData,
  type StepNode,
} from "@/lib/app/workflow";
import { refuseConnect } from "@/lib/ws/graphEdit";
import { SETUP_HREF } from "@/lib/nav";
import { cn } from "@/lib/ws/utils";
import { Button } from "@/components/ws/ui/button";
import { NativeSelect, Switch } from "@/components/ws/ui/misc";
import { StepTile } from "./canvas";

const INPUT =
  "w-full rounded-lg border border-input bg-card px-[10px] py-[7px] text-[12px] leading-[1.5] placeholder:text-faint";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[5px]">
      <label htmlFor={id} className="label-mono">
        {label}
      </label>
      {children}
    </div>
  );
}

/** The `{first_name}` chips: they append, because a textarea has no cursor to honour from here. */
function Variables({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {MERGE_VARS.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(v)}
          className="rounded-md bg-accent px-[7px] py-[2px] font-mono text-[10.5px] text-body hover:bg-sunken"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

/**
 * The settings of the selected step. Each kind shows only what it has: a note for an invite, a
 * subject and body for an email, a delay for a wait, a test for a condition. Where the step goes
 * next is set here too, so a plan can be wired without the mouse.
 */
export function Inspector({
  node,
  nodes,
  edges,
  lists,
  problem,
  readOnly,
  onPatch,
  onDelete,
  onLink,
}: {
  node: StepNode;
  nodes: StepNode[];
  edges: FlowEdge[];
  lists: AudienceList[];
  problem?: string;
  readOnly?: boolean;
  onPatch: (id: string, patch: Partial<StepData>) => void;
  onDelete: (id: string) => void;
  /** Wire `port` of this step to `target`, or clear it when `target` is empty. */
  onLink: (source: string, port: Port, target: string) => void;
}) {
  const step = STEPS[node.kind];
  const d = node.data;
  const patch = (p: Partial<StepData>) => onPatch(node.id, p);
  const id = (name: string) => `${node.id}-${name}`;

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-[10px]">
        <StepTile kind={node.kind} />
        <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
          <span className="truncate text-[13px] font-semibold">{step.label}</span>
          <span className="truncate text-[11px] text-muted-foreground">{stepLabel(node.kind, d, lists)}</span>
        </span>
        {node.kind !== "audience" ? (
          <Button
            variant="danger"
            size="icon"
            aria-label={`Delete ${step.label}`}
            disabled={readOnly}
            onClick={() => onDelete(node.id)}
          >
            <Trash2 aria-hidden strokeWidth={1.8} />
          </Button>
        ) : null}
      </div>

      {problem ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-bg px-[10px] py-[8px] text-[11.5px] leading-[1.5] text-warning">
          <TriangleAlert aria-hidden className="mt-px size-[13px] shrink-0" strokeWidth={2} />
          <span>
            {problem}
            {/isn't connected/.test(problem) ? (
              <>
                {" "}
                <Link href={SETUP_HREF} className="font-medium underline">
                  Connect it
                </Link>
              </>
            ) : null}
          </span>
        </p>
      ) : null}

      {node.kind === "audience" && (
        <Field id={id("list")} label="Who it goes to">
          <NativeSelect
            id={id("list")}
            label="Audience"
            hideLabel
            value={d.list}
            disabled={readOnly}
            onChange={(v) => patch({ list: v })}
            options={lists.map((l) => ({ value: l.k, label: l.name }))}
            className="w-full"
            selectClassName="w-full"
          />
        </Field>
      )}

      {node.kind === "li_invite" && (
        <Field id={id("note")} label="Note with the invite">
          <textarea
            id={id("note")}
            rows={5}
            value={d.note ?? ""}
            disabled={readOnly}
            maxLength={300}
            onChange={(e) => patch({ note: e.target.value })}
            className={INPUT}
          />
          <div className="flex items-center justify-between gap-2">
            <Variables onInsert={(v) => patch({ note: `${d.note ?? ""} ${v}`.trimStart() })} />
            <span className="font-mono text-[10.5px] text-muted-foreground">{(d.note ?? "").length}/300</span>
          </div>
        </Field>
      )}

      {(node.kind === "li_msg" || node.kind === "sms" || node.kind === "wa") && (
        <Field id={id("body")} label="Message">
          <textarea
            id={id("body")}
            rows={6}
            value={d.body ?? ""}
            disabled={readOnly}
            onChange={(e) => patch({ body: e.target.value })}
            className={INPUT}
          />
          <Variables onInsert={(v) => patch({ body: `${d.body ?? ""} ${v}`.trimStart() })} />
        </Field>
      )}

      {node.kind === "email" && (
        <>
          <Field id={id("subject")} label="Subject">
            <input
              id={id("subject")}
              value={d.subject ?? ""}
              disabled={readOnly}
              onChange={(e) => patch({ subject: e.target.value })}
              className={INPUT}
            />
          </Field>
          <Field id={id("body")} label="Email">
            <textarea
              id={id("body")}
              rows={9}
              value={d.body ?? ""}
              disabled={readOnly}
              onChange={(e) => patch({ body: e.target.value })}
              className={INPUT}
            />
            <Variables onInsert={(v) => patch({ body: `${d.body ?? ""} ${v}`.trimStart() })} />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px]">Reply in the same thread</span>
            <Switch checked={Boolean(d.thread)} disabled={readOnly} onChange={(v) => patch({ thread: v })} label="Reply in the same thread" />
          </div>
        </>
      )}

      {node.kind === "call" && (
        <>
          <Field id={id("assign")} label="Who calls">
            <NativeSelect
              id={id("assign")}
              label="Who calls"
              hideLabel
              value={d.assign ?? "owner"}
              disabled={readOnly}
              onChange={(v) => patch({ assign: v as "owner" | "rr" })}
              options={[
                { value: "owner", label: "The audience's owner" },
                { value: "rr", label: "Round robin" },
              ]}
              className="w-full"
              selectClassName="w-full"
            />
          </Field>
          <Field id={id("notes")} label="Notes for the caller">
            <textarea
              id={id("notes")}
              rows={4}
              value={d.notes ?? ""}
              disabled={readOnly}
              onChange={(e) => patch({ notes: e.target.value })}
              className={INPUT}
            />
          </Field>
          <p className="text-[11.5px] leading-[1.5] text-muted-foreground">
            A call step becomes a to-do for a person. Nothing dials for you.
          </p>
        </>
      )}

      {node.kind === "wait" && (
        <>
          <Field id={id("days")} label="Wait for">
            <span className="flex items-center gap-2">
              <input
                id={id("days")}
                type="number"
                min={0}
                max={90}
                value={d.days ?? 3}
                disabled={readOnly}
                onChange={(e) => patch({ days: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })}
                className={cn(INPUT, "w-[80px]")}
              />
              <span className="text-[12px] text-muted-foreground">days</span>
            </span>
          </Field>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px]">Count business days only</span>
            <Switch checked={Boolean(d.biz)} disabled={readOnly} onChange={(v) => patch({ biz: v })} label="Count business days only" />
          </div>
        </>
      )}

      {node.kind === "cond" && (
        <>
          <Field id={id("check")} label="Check whether they">
            <NativeSelect
              id={id("check")}
              label="Check"
              hideLabel
              value={d.check ?? "replied"}
              disabled={readOnly}
              onChange={(v) => patch({ check: v as CheckKey })}
              options={[...new Set<CheckKey>([...OFFERED_CHECKS, d.check ?? "replied"])].map((k) => ({
                value: k,
                label: CHECKS[k],
              }))}
              className="w-full"
              selectClassName="w-full"
            />
          </Field>
          {d.check === "score" ? (
            <Field id={id("score")} label="Score of at least">
              <input
                id={id("score")}
                type="number"
                min={0}
                max={100}
                value={d.score ?? 70}
                disabled={readOnly}
                onChange={(e) => patch({ score: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                className={cn(INPUT, "w-[80px]")}
              />
            </Field>
          ) : (
            <Field id={id("within")} label="Within">
              <span className="flex items-center gap-2">
                <input
                  id={id("within")}
                  type="number"
                  min={1}
                  max={90}
                  value={d.within ?? 3}
                  disabled={readOnly}
                  onChange={(e) => patch({ within: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })}
                  className={cn(INPUT, "w-[80px]")}
                />
                <span className="text-[12px] text-muted-foreground">days</span>
              </span>
            </Field>
          )}
        </>
      )}

      {node.kind === "split" && (
        <Field id={id("a")} label={`Path A gets ${d.a ?? 50}%`}>
          <input
            id={id("a")}
            type="range"
            min={5}
            max={95}
            step={5}
            value={d.a ?? 50}
            disabled={readOnly}
            onChange={(e) => patch({ a: Number(e.target.value) })}
            className="w-full accent-[var(--primary)]"
          />
          <span className="font-mono text-[11px] text-muted-foreground">
            {d.a ?? 50}% A · {100 - (d.a ?? 50)}% B
          </span>
        </Field>
      )}

      {node.kind === "goal" && (
        <Field id={id("goal")} label="The goal is">
          <NativeSelect
            id={id("goal")}
            label="Goal"
            hideLabel
            value={d.goal ?? "meeting"}
            disabled={readOnly}
            onChange={(v) => patch({ goal: v as GoalKey })}
            options={(Object.keys(GOALS) as GoalKey[]).map((k) => ({ value: k, label: GOALS[k] }))}
            className="w-full"
            selectClassName="w-full"
          />
        </Field>
      )}

      {node.kind === "exit" && (
        <p className="text-[11.5px] leading-[1.5] text-muted-foreground">
          Anyone who reaches this step leaves the strategy.
        </p>
      )}

      {step.ports.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-divider pt-4">
          {step.ports.map((port) => {
            const current = edges.find((e) => e.source === node.id && e.port === port)?.target ?? "";
            const label = PORT_LABEL[port] ? `If ${PORT_LABEL[port]}, go to` : "Then go to";
            return (
              <Field key={port} id={id(`next-${port}`)} label={label}>
                <NativeSelect
                  id={id(`next-${port}`)}
                  label={label}
                  hideLabel
                  value={current}
                  disabled={readOnly}
                  onChange={(v) => onLink(node.id, port, v)}
                  options={[
                    { value: "", label: "Nothing yet" },
                    ...nodes
                      .filter((n) => n.id === current || !refuseConnect(nodes, edges, node.id, n.id))
                      .map((n) => ({ value: n.id, label: `${STEPS[n.kind].label} · ${stepLabel(n.kind, n.data, lists)}` })),
                  ]}
                  className="w-full"
                  selectClassName="w-full"
                />
              </Field>
            );
          })}
        </div>
      )}
    </div>
  );
}
