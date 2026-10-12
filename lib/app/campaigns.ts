/**
 * Demo campaign book. Metadata lives here; every performance figure is computed
 * from lib/app/metrics.ts so the list, the dashboard and analytics agree.
 */

import type { ChannelKey } from "./channels";
import { DAYS, shortDate } from "./metrics";

export type CampaignStatus = "live" | "scheduled" | "paused" | "draft" | "completed";

export type Campaign = {
  id: number;
  name: string;
  /** "single" runs one channel; "multi" is a multichannel flow. */
  type: "single" | "multi";
  status: CampaignStatus;
  channels: ChannelKey[];
  /** Size of the audience list behind the campaign. */
  leads: number;
  /** Published version count; 0 while a campaign is still a draft. */
  ver: number;
  /** Day index it started on, for campaigns scheduled off the demo clock. */
  startedOn?: number;
  /** Literal start label for the long-running flows. */
  startedAt?: string;
  /** When a scheduled campaign goes out. */
  scheduledAt?: string;
};

export const CAMPAIGNS: Campaign[] = [
  { id: 17, name: "Product launch · v3", type: "single", status: "scheduled", channels: ["mail"], leads: 5200, ver: 0, scheduledAt: "24 Oct, 10:00" },
  { id: 1, name: "Net-new outbound", type: "multi", status: "live", channels: ["li", "mail", "call"], leads: 612, ver: 2, startedAt: "12 Sep" },
  { id: 12, name: "Q4 webinar invite", type: "single", status: "live", channels: ["mail"], leads: 2400, ver: 1, startedOn: 165 },
  { id: 2, name: "Inbound follow-up", type: "multi", status: "live", channels: ["mail", "wa", "call"], leads: 214, ver: 1, startedAt: "3 Aug" },
  { id: 14, name: "Trial expiring · Oct cohort", type: "single", status: "live", channels: ["mail"], leads: 640, ver: 1, startedOn: 160 },
  { id: 13, name: "SaaSBoomi follow-up", type: "single", status: "live", channels: ["li"], leads: 180, ver: 1, startedOn: 170 },
  { id: 3, name: "Closed-lost re-engage", type: "multi", status: "live", channels: ["mail", "li", "sms"], leads: 458, ver: 1, startedAt: "20 Sep" },
  { id: 16, name: "Renewal check-ins", type: "single", status: "live", channels: ["call"], leads: 96, ver: 1, startedOn: 150 },
  { id: 15, name: "Demo reminders", type: "single", status: "paused", channels: ["sms"], leads: 420, ver: 1, startedOn: 120 },
  { id: 4, name: "Event follow-up", type: "multi", status: "paused", channels: ["wa", "call", "mail"], leads: 180, ver: 1, startedAt: "2 Jul" },
  { id: 11, name: "Diwali offer · SMB retailers", type: "single", status: "completed", channels: ["wa"], leads: 1840, ver: 1, startedOn: 152 },
  { id: 5, name: "Q1 founders", type: "multi", status: "draft", channels: ["li", "mail", "sms"], leads: 340, ver: 0 },
];

/** "Started 12 Sep" / "Starts 24 Oct, 10:00" / "Not published" */
export function scheduleLabel(c: Campaign) {
  if (c.status === "draft") return "Not published";
  if (c.scheduledAt && !c.ver) return `Starts ${c.scheduledAt}`;
  if (c.startedAt) return `Started ${c.startedAt}`;
  if (c.startedOn != null) return `Started ${shortDate(c.startedOn)}`;
  return "Started today";
}

/** Status pill wording and tone. */
export const STATUS_TAG: Record<CampaignStatus, { label: string; tone: string }> = {
  live: { label: "Live", tone: "pos" },
  scheduled: { label: "Scheduled", tone: "" },
  paused: { label: "Paused", tone: "hl" },
  draft: { label: "Draft", tone: "" },
  completed: { label: "Completed", tone: "" },
};

/** A draft or an unpublished schedule has no numbers to show yet. */
export const hasRun = (c: Campaign) => c.status !== "draft" && c.ver > 0;

/** Default reporting window: the last 30 days of the demo clock. */
export const LAST_30 = { from: DAYS - 30, to: DAYS - 1 };
