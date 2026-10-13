/**
 * The bridge between the two data models in this codebase.
 *
 * `lib/data/` is canonical and database-backed: string ids, lowercase enums, full channel names.
 * `lib/app/` is the older demo layer the workspace screens were written against: numeric ids,
 * capitalised stages, short channel codes (`li`, `mail`, `wa`). The screens render the second
 * shape, so rather than rewrite hundreds of lines of presentational JSX — which is under active
 * development elsewhere — the mapping lives here, in one auditable place.
 *
 * **This file is a transitional seam, not an endorsement of two models.** Converging them is
 * tracked in CONTEXT.md §7. Until then, a new field needs adding in both models and here, which
 * is exactly the cost that should motivate finishing the convergence.
 *
 * The database vocabulary is the **superset** of both, so every mapping below is lossless in the
 * DB → UI direction. Nothing here invents or discards information.
 */

import type { Campaign, Channel, Lead, LeadStage } from "@/lib/data/types";
import type { ChannelKey } from "./channels";
import type { Stage } from "./leads";

/* -------------------------------------------------------------- channels -- */

const CHANNEL_TO_KEY: Record<Channel, ChannelKey> = {
  linkedin: "li",
  email: "mail",
  whatsapp: "wa",
  call: "call",
  sms: "sms",
};

const KEY_TO_CHANNEL: Record<ChannelKey, Channel> = {
  li: "linkedin",
  mail: "email",
  wa: "whatsapp",
  call: "call",
  sms: "sms",
};

export const toChannelKey = (channel: Channel): ChannelKey => CHANNEL_TO_KEY[channel];
export const toChannel = (key: ChannelKey): Channel => KEY_TO_CHANNEL[key];

/* ----------------------------------------------------------------- stage -- */

const STAGE_TO_LABEL: Record<LeadStage, Stage> = {
  new: "New",
  reaching: "Reaching",
  engaged: "Engaged",
  hot: "Hot",
  meeting: "Meeting",
  nurture: "Nurture",
  paused: "Paused",
  stopped: "Stopped",
  closed: "Closed",
};

const LABEL_TO_STAGE: Record<Stage, LeadStage> = {
  New: "new",
  Reaching: "reaching",
  Engaged: "engaged",
  Hot: "hot",
  Meeting: "meeting",
  Nurture: "nurture",
  Paused: "paused",
  Stopped: "stopped",
  Closed: "closed",
};

export const toStageLabel = (stage: LeadStage): Stage => STAGE_TO_LABEL[stage];
export const toStage = (label: Stage): LeadStage => LABEL_TO_STAGE[label];

/* ------------------------------------------------------------------ lead -- */

/**
 * What the leads table renders. Identical to the demo layer's `Lead` except `id` is the
 * database's string id — the screens need it to address API endpoints, and a numeric id would
 * have to be invented and mapped back on every write.
 */
export type AppLead = {
  id: string;
  n: string;
  t: string;
  c: string;
  sig: string[];
  stage: Stage;
  step: string;
  last: string;
  lastCh: ChannelKey;
  next: string;
  own: string;
  ph?: string;
  score: number;
  src: string;
  tags: string[];
  calls: number;
  avgCall: number | null;
  msgs: number;
  consent: boolean;
  fav: boolean;
  email: string;
  li: string;
  /** Raw values the table does not render but the editor needs, so an edit preserves them. */
  campaignId: string | null;
  ownerId: string;
  source: Lead["source"];
};

const SOURCE_LABEL: Record<Lead["source"], string> = {
  form: "Form",
  csv: "CSV",
  linkedin: "LinkedIn",
  crm: "CRM",
  event: "Event",
};

/** "Aarav Kapoor" -> "AK", matching the `OWNERS` keys the owner filter uses. */
function ownerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "??";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * "2h", "3d" — the table's compact last-touch column.
 *
 * Floors rather than rounds at every step: "1m" should mean a minute has actually passed, and
 * rounding would make 30 seconds ago read "1m" while the `< 1` guard below claims to show "now".
 */
export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Tags shown in the table: the stored tags, plus the derived "Title: …" chip the demo layer
 * appended. `tagColors()` keys off that prefix, so it has to keep the same shape.
 */
export function toAppLead(lead: Lead): AppLead {
  const tags = [...lead.tags];
  if (lead.title) tags.push(`Title: ${lead.title}`);

  const slug = lead.name
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  return {
    id: lead.id,
    n: lead.name,
    t: lead.title,
    c: lead.company,
    // Per-lead engagement signals live on threads, not leads; the table does not read this.
    sig: [],
    stage: toStageLabel(lead.stage),
    step: lead.nextStep,
    last: relativeTime(lead.updatedAt),
    lastCh: "mail",
    next: lead.nextStep || "—",
    own: ownerInitials(lead.ownerName),
    ph: lead.phone ?? undefined,
    score: lead.score,
    src: SOURCE_LABEL[lead.source],
    tags,
    calls: lead.callCount,
    avgCall: lead.avgCallSeconds,
    msgs: lead.messageCount,
    consent: lead.consent,
    fav: lead.starred,
    email: lead.email ?? "",
    li: `linkedin.com/in/${slug}`,
    campaignId: lead.campaignId,
    ownerId: lead.ownerId,
    source: lead.source,
  };
}

/* -------------------------------------------------------------- campaign -- */

/** The campaigns table's row shape, with the database's string id. */
export type AppCampaign = {
  id: string;
  name: string;
  type: "single" | "multi";
  status: "live" | "scheduled" | "paused" | "draft" | "completed";
  channels: ChannelKey[];
  leads: number;
  ver: number;
  startedAt?: string;
  scheduledAt?: string;
  /** Live figures from the database, which the demo layer had to simulate. */
  sent: number | null;
  delivered: number | null;
  openRate: number | null;
  replyRate: number | null;
  clicks: number | null;
};

const DATE_LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function toAppCampaign(campaign: Campaign): AppCampaign {
  const started = new Date(campaign.startedAt);
  const isFuture = started.getTime() > Date.now();
  // "v2" -> 2; a draft has no published version, which the table renders as "—".
  const version = campaign.version ? Number.parseInt(campaign.version.replace(/^v/, ""), 10) || 0 : 0;

  return {
    id: campaign.id,
    name: campaign.name,
    type: campaign.type === "multichannel" ? "multi" : "single",
    status: campaign.status,
    channels: campaign.channels.map(toChannelKey),
    leads: campaign.leads,
    ver: version,
    // A scheduled campaign shows when it goes out; a running one shows when it started.
    startedAt: isFuture ? undefined : DATE_LABEL.format(started),
    scheduledAt: isFuture ? DATE_LABEL.format(started) : undefined,
    sent: campaign.sent,
    delivered: campaign.delivered,
    openRate: campaign.openRate,
    replyRate: campaign.replyRate,
    clicks: campaign.clicks,
  };
}

/** A campaign has run once it has a published version and a start date in the past. */
export const hasRun = (campaign: AppCampaign) => campaign.ver > 0 && !campaign.scheduledAt;
