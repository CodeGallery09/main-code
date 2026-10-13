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
  workflowChannels,
  type Workflow,
  type WorkflowStatus,
} from "@/lib/app/workflow";

export type WorkflowSummary = {
  id: number;
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
  const campaign = CAMPAIGNS.find((c) => c.id === w.id);
  const ran = campaign ? hasRun(campaign) : false;
  const m = ran && channels.length ? campaignMetrics(w.id, channels, DAYS - 30, DAYS - 1) : null;

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
