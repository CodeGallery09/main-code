"use client";

import type { CSSProperties } from "react";
import { Glyph } from "../icons";
import { CHANNEL } from "@/lib/app/channels";
import {
  PORT_LABEL,
  STEPS,
  stepLabel,
  type Port,
  type StepKind,
  type StepNode,
  type StepStat,
} from "@/lib/app/workflow";

/** The step's chip takes its channel's colours, or the tone of its group. */
export function chipStyle(kind: StepKind): CSSProperties {
  const ch = STEPS[kind].ch;
  if (ch) return { background: CHANNEL[ch].soft, color: CHANNEL[ch].hex };
  if (kind === "audience") return { background: "var(--ink)", color: "var(--surface)" };
  if (kind === "goal") return { background: "var(--pos-soft)", color: "var(--pos)" };
  if (kind === "exit") return { background: "var(--surface-2)", color: "var(--muted)" };
  return { background: "var(--hl-soft)", color: "var(--hl-ink)" };
}

export function StepChip({ kind }: { kind: StepKind }) {
  return (
    <span className="chi" style={chipStyle(kind)}>
      <Glyph n={STEPS[kind].icon} />
    </span>
  );
}

/** Where each outgoing socket sits across the card. */
export const portOffsets = (kind: StepKind) =>
  STEPS[kind].ports.length === 2 ? ["25%", "75%"] : ["50%"];

/**
 * One card on the canvas. Each unused socket carries a `+` that opens the
 * step menu, shown on hover and pinned open while the step has a problem.
 */
export function StepCard({
  node,
  stats,
  issue,
  lonely,
  taken,
  onQuickAdd,
}: {
  node: StepNode;
  stats?: StepStat[];
  issue?: string;
  /** The workflow is still just an audience, so the `+` stays visible. */
  lonely: boolean;
  taken: (port: Port) => boolean;
  onQuickAdd: (port: Port, from: HTMLElement) => void;
}) {
  const { kind } = node;
  const ports = STEPS[kind].ports;
  const offsets = portOffsets(kind);

  return (
    <div
      className={
        "fpnode" + (kind === "audience" ? " start" : "") + (kind === "goal" ? " goal" : "") + (issue ? " bad" : "")
      }
      title={issue || ""}
    >
      {kind !== "audience" && <div className="react-flow__handle react-flow__handle-top target" />}

      <div className="nh">
        <StepChip kind={kind} />
        <div className="nt">
          <small>{STEPS[kind].label}</small>
          <b>{stepLabel(kind, node.data)}</b>
        </div>
      </div>

      {stats && (
        <div className="nstat">
          {stats.map(([value, label]) => (
            <span key={label}>
              <b>{value}</b> {label}
            </span>
          ))}
        </div>
      )}

      {ports.length === 2 && (
        <div className="branches">
          <span>{PORT_LABEL[ports[0]]}</span>
          <span>{PORT_LABEL[ports[1]]}</span>
        </div>
      )}

      {ports.map((port, i) => (
        <div
          key={port}
          className="react-flow__handle react-flow__handle-bottom source"
          data-port={port}
          style={{ left: offsets[i] }}
        />
      ))}

      {ports.map((port, i) =>
        taken(port) ? null : (
          <button
            key={"q" + port}
            type="button"
            className={"qadd" + (issue || lonely ? " show" : "")}
            style={{ left: offsets[i] }}
            aria-label="Add next step"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onQuickAdd(port, e.currentTarget);
            }}
          >
            <Glyph n="plus" />
          </button>
        ),
      )}

      {issue && <span className="baddot" />}
    </div>
  );
}
