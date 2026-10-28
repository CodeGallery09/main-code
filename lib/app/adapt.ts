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

import type { Strategy, Channel, Audience, AudienceStage } from "@/lib/data/types";
import type { ChannelKey } from "./channels";
import type { Stage } from "./audiences";

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

const STAGE_TO_LABEL: Record<AudienceStage, Stage> = {
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

const LABEL_TO_STAGE: Record<Stage, AudienceStage> = {
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

export const toStageLabel = (stage: AudienceStage): Stage => STAGE_TO_LABEL[stage];
export const toStage = (label: Stage): AudienceStage => LABEL_TO_STAGE[label];

/* ------------------------------------------------------------------ audience -- */

/**
 * What the audiences table renders. Identical to the demo layer's `Audience` except `id` is the
 * database's string id — the screens need it to address API endpoints, and a numeric id would
 * have to be invented and mapped back on every write.
 */
export type AppAudience = {
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
  strategyId: string | null;
  ownerId: string;
  source: Audience["source"];
  /** Invented at signup; the table labels it so it is never mistaken for a real contact. */
  isSample: boolean;
};

const SOURCE_LABEL: Record<Audience["source"], string> = {
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
export function toAppAudience(audience: Audience): AppAudience {
  const tags = [...audience.tags];
  const titleTag = `Title: ${audience.title}`;
  // Seeded audiences already carry this tag; pushing it again gave the table two identical React keys.
  if (audience.title && !tags.includes(titleTag)) tags.push(titleTag);

  return {
    id: audience.id,
    n: audience.name,
    t: audience.title,
    c: audience.company,
    // Per-audience engagement signals live on threads, not audiences; the table does not read this.
    sig: [],
    stage: toStageLabel(audience.stage),
    step: audience.nextStep,
    last: relativeTime(audience.updatedAt),
    lastCh: "mail",
    next: audience.nextStep || "—",
    own: ownerInitials(audience.ownerName),
    ph: audience.phone ?? undefined,
    score: audience.score,
    src: SOURCE_LABEL[audience.source],
    tags,
    calls: audience.callCount,
    avgCall: audience.avgCallSeconds,
    msgs: audience.messageCount,
    consent: audience.consent,
    fav: audience.starred,
    email: audience.email ?? "",
    // The stored profile URL only. This used to be a slug made up from the name, which showed a
    // LinkedIn address nobody had given us.
    li: audience.linkedin ?? "",
    strategyId: audience.strategyId,
    ownerId: audience.ownerId,
    source: audience.source,
    isSample: audience.isSample ?? false,
  };
}

/* -------------------------------------------------------------- strategy -- */

/** The strategies table's row shape, with the database's string id. */
export type AppStrategy = {
  id: string;
  name: string;
  type: "single" | "multi";
  status: "live" | "scheduled" | "paused" | "draft" | "completed";
  channels: ChannelKey[];
  audiences: number;
  ver: number;
  startedAt?: string;
  scheduledAt?: string;
  /** Live figures from the database, which the demo layer had to simulate. */
  sent: number | null;
  delivered: number | null;
  openRate: number | null;
  replyRate: number | null;
  clicks: number | null;
  isSample: boolean;
};

const DATE_LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function toAppStrategy(strategy: Strategy): AppStrategy {
  const started = new Date(strategy.startedAt);
  const isFuture = started.getTime() > Date.now();
  // "v2" -> 2; a draft has no published version, which the table renders as "—".
  const version = strategy.version ? Number.parseInt(strategy.version.replace(/^v/, ""), 10) || 0 : 0;

  return {
    id: strategy.id,
    name: strategy.name,
    type: strategy.type === "multichannel" && strategy.channels.length > 1 ? "multi" : "single",
    status: strategy.status,
    channels: strategy.channels.map(toChannelKey),
    audiences: strategy.audiences,
    ver: version,
    // A scheduled strategy shows when it goes out; a running one shows when it started.
    startedAt: isFuture ? undefined : DATE_LABEL.format(started),
    scheduledAt: isFuture ? DATE_LABEL.format(started) : undefined,
    sent: strategy.sent,
    delivered: strategy.delivered,
    openRate: strategy.openRate,
    replyRate: strategy.replyRate,
    clicks: strategy.clicks,
    isSample: strategy.isSample ?? false,
  };
}

/** A strategy has run once it has a published version and a start date in the past. */
export const hasRun = (strategy: AppStrategy) => strategy.ver > 0 && !strategy.scheduledAt;
