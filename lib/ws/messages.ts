/**
 * Every message a workspace has written, read out of the plans that hold them.
 *
 * There is no shared template library in this product yet: a message lives on
 * the step that sends it. Rather than invent a library, this reads the real
 * copy out of each stored workflow so it can all be seen — and edited — in one
 * place. Editing one changes that step, and says so.
 */

import { STEPS, type StepKind, type StepNode } from "@/lib/app/workflow";
import type { Channel, WorkflowRecord } from "@/lib/data/types";

export type MessageRow = {
  /** Unique across the workspace: the strategy plus the node that holds the copy. */
  key: string;
  strategyId: string;
  strategyName: string;
  nodeId: string;
  kind: StepKind;
  channel: Channel;
  /** What the step does — "Send an email". */
  what: string;
  /** The subject line, where the channel has one. */
  subject: string | null;
  body: string;
  updatedAt: string;
};

const CHANNEL_OF: Partial<Record<StepKind, Channel>> = {
  li_invite: "linkedin",
  li_msg: "linkedin",
  email: "email",
  wa: "whatsapp",
  call: "call",
  sms: "sms",
};

const WHAT: Partial<Record<StepKind, string>> = {
  li_invite: "LinkedIn invite",
  li_msg: "LinkedIn message",
  email: "Email",
  wa: "WhatsApp message",
  call: "Call script",
  sms: "SMS",
};

/** The field on a step that actually carries its words. */
export function bodyField(kind: StepKind): "note" | "body" | "notes" {
  if (kind === "li_invite") return "note";
  if (kind === "call") return "notes";
  return "body";
}

const copyOf = (node: StepNode): string => {
  const field = bodyField(node.kind);
  return (node.data[field] as string | undefined) ?? "";
};

export function readMessages(records: WorkflowRecord[]): MessageRow[] {
  const rows: MessageRow[] = [];
  for (const record of records) {
    for (const node of record.graph.nodes as StepNode[]) {
      const channel = CHANNEL_OF[node.kind];
      if (!channel) continue;
      rows.push({
        key: `${record.strategyId}:${node.id}`,
        strategyId: record.strategyId,
        strategyName: record.name,
        nodeId: node.id,
        kind: node.kind,
        channel,
        what: WHAT[node.kind] ?? STEPS[node.kind].label,
        subject: node.kind === "email" ? ((node.data.subject as string | undefined) ?? "") : null,
        body: copyOf(node),
        updatedAt: record.updatedAt,
      });
    }
  }
  return rows;
}

/** The first line of a message, for a list row. */
export function firstLine(row: MessageRow) {
  if (row.subject !== null) return row.subject ? `Subject: ${row.subject}` : "No subject yet";
  const line = row.body.split("\n").find((l) => l.trim());
  return line?.trim() || "Nothing written yet";
}
