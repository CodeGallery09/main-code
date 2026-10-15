/**
 * Derived view of the workflow library.
 *
 * `lib/app/workflow.ts` owns the graph model; this module turns it into the
 * handful of numbers the library grid shows, so the cards and the builder can
 * never disagree. Figures are illustrative demo data, derived from the
 * workflow itself rather than stored, same as the builder's canvas stats.
 */

import { CHANNEL, type ChannelKey } from "@/lib/app/channels";
import { CAMPAIGNS, hasRun } from "@/lib/app/campaigns";
import { campaignMetrics, DAYS } from "@/lib/app/metrics";
import {
  STEPS,
  WORKFLOWS,
  fromGraph,
  graphFromTemplate,
  validateWorkflowGraph,
  workflowChannels,
  type Workflow,
  type WorkflowStatus,
} from "@/lib/app/workflow";

export type WorkflowSummary = {
  /** The campaign id for a stored workflow; a small number for the demo library. */
  id: number | string;
  name: string;
  status: WorkflowStatus;
  channels: ChannelKey[];
  /** Steps that actually do something — the Audience root is not one of them. */
  steps: number;
  started: string | null;
  daily: number;
  /** False until the workflow has actually been published and sent. */
  ran: boolean;
  /** Leads currently moving through it. */
  inFlight: number;
  replies: number;
  meetings: number;
  /** Set when the graph is incomplete, so the card can warn before it is run. */
  needsWork: boolean;
  /** Invented at signup; the card labels it. */
  isSample?: boolean;
};

export const STATUS_TAG: Record<WorkflowStatus, { label: string; tone: string }> = {
  live: { label: "Live", tone: "pos" },
  paused: { label: "Paused", tone: "hl" },
  draft: { label: "Draft", tone: "" },
};

/** A workflow is ready to run once it sends on something and has no empty copy. */
export function incomplete(w: Workflow): boolean {
  const sends = w.nodes.filter((n) => STEPS[n.kind].ch);
  if (!sends.length) return true;
  return sends.some((n) => {
    const body = (n.data as { body?: string }).body;
    return typeof body === "string" && !body.trim();
  });
}

export function summarise(w: Workflow): WorkflowSummary {
  const channels = workflowChannels(w) as ChannelKey[];
  // Anything that has never been published shows dashes rather than invented numbers.
  // `hasRun` is the same rule the campaigns table uses, so the two screens agree.
  // The demo metrics are keyed by the demo campaign's number; a stored workflow has none.
  const demoId = typeof w.id === "number" ? w.id : null;
  const campaign = demoId === null ? undefined : CAMPAIGNS.find((c) => c.id === demoId);
  const ran = campaign ? hasRun(campaign) : false;
  const m = ran && demoId !== null && channels.length ? campaignMetrics(demoId, channels, DAYS - 30, DAYS - 1) : null;

  return {
    id: w.id,
    name: w.name,
    status: w.status,
    channels,
    steps: w.nodes.filter((n) => n.kind !== "audience").length,
    started: w.started,
    daily: w.daily,
    ran,
    inFlight: m ? Math.round(m.sent - m.replied) : 0,
    replies: m ? Math.round(m.replied) : 0,
    meetings: m ? Math.round(m.meetings) : 0,
    needsWork: incomplete(w),
  };
}

export const workflowSummaries = (): WorkflowSummary[] => WORKFLOWS.map(summarise);

export const channelNames = (keys: ChannelKey[]) =>
  keys.length ? keys.map((k) => CHANNEL[k].name).join(" · ") : "No channels yet";

/** Campaign status -> the three states a workflow card shows. */
const CARD_STATUS: Record<string, WorkflowStatus> = {
  live: "live",
  paused: "paused",
  completed: "paused",
  draft: "draft",
  scheduled: "draft",
};

const START = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/**
 * A library card for a workflow that is actually stored. There are no sent-message results to
 * report yet, so "in flight" and "meetings" stay dashes (`ran: false`) rather than invented
 * numbers; the card shows what is real — its steps, channels, pace and status.
 */
export function summariseStored(
  campaign: { id: string; name: string; status: string; startedAt: string; isSample?: boolean },
  graph: unknown,
  name?: string,
): WorkflowSummary {
  const checked = graph ? validateWorkflowGraph(graph) : null;
  const valid = checked && checked.ok ? checked.data : graphFromTemplate("blank");
  const status = CARD_STATUS[campaign.status] ?? "draft";
  const w = fromGraph(valid, {
    id: campaign.id,
    name: name ?? campaign.name,
    status,
    started: status === "draft" ? null : START.format(new Date(campaign.startedAt)),
  });
  return { ...summarise(w), isSample: Boolean(campaign.isSample) };
}
