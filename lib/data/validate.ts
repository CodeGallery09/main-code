/**
 * Write-path validation for the app's CRUD endpoints.
 *
 * Same contract as lib/demoRequest.ts: a `{ ok: true, data } | { ok: false, errors }` union, so
 * the route handler and any client form can run the identical check. Deliberately **import-free
 * and erasable** so `node --test` can load this file directly (see CLAUDE.md) — that is what
 * makes the write path testable without a database or a server.
 *
 * It validates *shape and range only*. Referential questions ("does this campaign exist in my
 * workspace?") belong to the repository, which is the only layer that can answer them.
 */

export const CHANNELS = ["linkedin", "email", "whatsapp", "call", "sms"] as const;
export const LEAD_STAGES = [
  "new",
  "reaching",
  "engaged",
  "hot",
  "meeting",
  "nurture",
  "paused",
  "stopped",
  "closed",
] as const;
export const LEAD_SOURCES = ["form", "csv", "linkedin", "crm", "event"] as const;
export const CAMPAIGN_STATUSES = ["live", "scheduled", "paused", "draft", "completed"] as const;
export const CAMPAIGN_TYPES = ["standalone", "multichannel"] as const;

export const NAME_MAX = 120;
export const TAGS_MAX = 10;
export const TAG_MAX = 32;
export const NEXT_STEP_MAX = 200;
export const MESSAGE_MAX = 5000;
export const URL_MAX = 500;

export type ValidationErrors = Record<string, string>;
export type Validation<T> = { ok: true; data: T } | { ok: false; errors: ValidationErrors };

/* ----------------------------------------------------------- primitives -- */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;

/**
 * Deliberately permissive: one @, a dot in the domain, no spaces. Anything stricter rejects
 * valid addresses, and the only real proof an address works is sending to it.
 */
export const looksLikeEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;

/** Keeps digits and a leading +, so "+91 98765 43210" and "(555) 010-9999" both survive. */
export function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const kept = trimmed.replace(/[^\d+]/g, "");
  const digits = kept.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return kept.startsWith("+") ? `+${digits}` : digits;
}

/**
 * A web URL, with `https://` added when it was typed without a scheme — the same rule the upload
 * applies to a LinkedIn column (`checkUrl` in lib/leads/validation.ts), so a profile added by hand
 * and one imported from a file are stored, and matched, the same way.
 */
export function normaliseUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : "https://" + value;
  return /^https?:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#][^\s]*)?$/i.test(withScheme) ? withScheme : null;
}

function cleanTags(value: unknown, errors: ValidationErrors): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.tags = "Tags must be a list.";
    return [];
  }
  const seen = new Set<string>();
  for (const entry of value) {
    const tag = text(entry);
    if (!tag) continue;
    if (tag.length > TAG_MAX) {
      errors.tags = `Each tag must be ${TAG_MAX} characters or fewer.`;
      return [];
    }
    seen.add(tag);
  }
  if (seen.size > TAGS_MAX) {
    errors.tags = `Use ${TAGS_MAX} tags or fewer.`;
    return [];
  }
  return Array.from(seen);
}

/* ------------------------------------------------------------------ lead -- */

export type LeadInput = {
  name: string;
  company: string;
  title: string;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  stage: (typeof LEAD_STAGES)[number];
  score: number;
  source: (typeof LEAD_SOURCES)[number];
  tags: string[];
  consent: boolean;
  nextStep: string;
  ownerId: string | null;
  campaignId: string | null;
  starred: boolean;
};

/** A PATCH body: only the keys actually present are applied. */
export type LeadPatch = Partial<LeadInput>;

/**
 * `partial` switches between POST (every required field must be present) and PATCH (validate
 * only what was sent). One function for both keeps the two paths from drifting apart.
 */
export function validateLead(input: unknown, partial = false): Validation<LeadPatch> {
  const errors: ValidationErrors = {};
  if (!isObject(input)) return { ok: false, errors: { _: "Expected an object." } };

  const out: LeadPatch = {};
  const has = (key: string) => input[key] !== undefined;

  if (has("name") || !partial) {
    const name = text(input.name);
    if (!name) errors.name = "Enter the lead's name.";
    else if (name.length > NAME_MAX) errors.name = `Keep the name to ${NAME_MAX} characters.`;
    else out.name = name;
  }

  if (has("company")) {
    const company = text(input.company);
    if (company.length > NAME_MAX) errors.company = `Keep the company to ${NAME_MAX} characters.`;
    else out.company = company;
  } else if (!partial) {
    out.company = "";
  }

  if (has("title")) {
    const title = text(input.title);
    if (title.length > NAME_MAX) errors.title = `Keep the title to ${NAME_MAX} characters.`;
    else out.title = title;
  } else if (!partial) {
    out.title = "";
  }

  if (has("email")) {
    const email = text(input.email).toLowerCase();
    if (!email) out.email = null;
    else if (!looksLikeEmail(email)) errors.email = "Enter a valid email address.";
    else out.email = email;
  } else if (!partial) {
    out.email = null;
  }

  if (has("phone")) {
    const raw = text(input.phone);
    if (!raw) out.phone = null;
    else {
      const phone = normalisePhone(raw);
      if (!phone) errors.phone = "Enter a valid phone number.";
      else out.phone = phone;
    }
  } else if (!partial) {
    out.phone = null;
  }

  if (has("linkedin")) {
    const raw = text(input.linkedin);
    if (!raw) out.linkedin = null;
    else {
      const url = normaliseUrl(raw);
      if (!url || url.length > URL_MAX) errors.linkedin = "Enter a LinkedIn profile URL.";
      else out.linkedin = url;
    }
  } else if (!partial) {
    out.linkedin = null;
  }

  // A lead added by hand has not been contacted yet, so it starts at "new", like an imported one.
  if (has("stage") || !partial) {
    const stage = oneOf(input.stage ?? "new", LEAD_STAGES);
    if (!stage) errors.stage = "Pick a valid stage.";
    else out.stage = stage;
  }

  if (has("source") || !partial) {
    const source = oneOf(input.source ?? "form", LEAD_SOURCES);
    if (!source) errors.source = "Pick a valid source.";
    else out.source = source;
  }

  if (has("score") || !partial) {
    const raw = input.score ?? 0;
    const score = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      errors.score = "Score must be between 0 and 100.";
    } else {
      out.score = Math.round(score);
    }
  }

  if (has("tags") || !partial) {
    const tags = cleanTags(input.tags, errors);
    if (!errors.tags) out.tags = tags;
  }

  // Consent gates outreach, so an absent value is false, never "assume yes".
  if (has("consent") || !partial) out.consent = input.consent === true;
  if (has("starred") || !partial) out.starred = input.starred === true;

  if (has("nextStep") || !partial) {
    const nextStep = text(input.nextStep);
    if (nextStep.length > NEXT_STEP_MAX) {
      errors.nextStep = `Keep the next step to ${NEXT_STEP_MAX} characters.`;
    } else {
      out.nextStep = nextStep;
    }
  }

  if (has("ownerId")) out.ownerId = text(input.ownerId) || null;
  else if (!partial) out.ownerId = null;

  if (has("campaignId")) out.campaignId = text(input.campaignId) || null;
  else if (!partial) out.campaignId = null;

  if (Object.keys(errors).length) return { ok: false, errors };
  if (partial && Object.keys(out).length === 0) {
    return { ok: false, errors: { _: "Send at least one field to update." } };
  }
  return { ok: true, data: out };
}

/* -------------------------------------------------------------- campaign -- */

export type CampaignInput = {
  name: string;
  status: (typeof CAMPAIGN_STATUSES)[number];
  type: (typeof CAMPAIGN_TYPES)[number];
  channels: (typeof CHANNELS)[number][];
  startedAt: string | null;
};

export type CampaignPatch = Partial<CampaignInput>;

export function validateCampaign(input: unknown, partial = false): Validation<CampaignPatch> {
  const errors: ValidationErrors = {};
  if (!isObject(input)) return { ok: false, errors: { _: "Expected an object." } };

  const out: CampaignPatch = {};
  const has = (key: string) => input[key] !== undefined;

  if (has("name") || !partial) {
    const name = text(input.name);
    if (!name) errors.name = "Name the campaign.";
    else if (name.length > NAME_MAX) errors.name = `Keep the name to ${NAME_MAX} characters.`;
    else out.name = name;
  }

  if (has("status") || !partial) {
    const status = oneOf(input.status ?? "draft", CAMPAIGN_STATUSES);
    if (!status) errors.status = "Pick a valid status.";
    else out.status = status;
  }

  if (has("type") || !partial) {
    const type = oneOf(input.type ?? "standalone", CAMPAIGN_TYPES);
    if (!type) errors.type = "Pick a valid type.";
    else out.type = type;
  }

  if (has("channels") || !partial) {
    const raw = input.channels ?? [];
    if (!Array.isArray(raw)) {
      errors.channels = "Channels must be a list.";
    } else {
      const picked: (typeof CHANNELS)[number][] = [];
      let bad = false;
      for (const entry of raw) {
        const channel = oneOf(entry, CHANNELS);
        if (!channel) {
          bad = true;
          break;
        }
        if (!picked.includes(channel)) picked.push(channel);
      }
      if (bad) errors.channels = "That is not a channel we support.";
      else if (!picked.length) errors.channels = "Pick at least one channel.";
      else out.channels = picked;
    }
  }

  // A multichannel campaign with one channel is a standalone campaign wearing a hat: the
  // workflow builder only opens for `multichannel`, so an empty graph would be unreachable.
  const type = out.type ?? (partial ? null : "standalone");
  if (type === "multichannel" && out.channels && out.channels.length < 2) {
    errors.channels = "A multichannel campaign needs two or more channels.";
  }

  if (has("startedAt")) {
    const raw = text(input.startedAt);
    if (!raw) out.startedAt = null;
    else if (Number.isNaN(Date.parse(raw))) errors.startedAt = "Enter a valid date.";
    else out.startedAt = new Date(raw).toISOString();
  } else if (!partial) {
    out.startedAt = null;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  if (partial && Object.keys(out).length === 0) {
    return { ok: false, errors: { _: "Send at least one field to update." } };
  }
  return { ok: true, data: out };
}

/* --------------------------------------------------------------- message -- */

export function validateMessageBody(input: unknown): Validation<{ body: string }> {
  if (!isObject(input)) return { ok: false, errors: { _: "Expected an object." } };
  const body = text(input.body);
  if (!body) return { ok: false, errors: { body: "Write a message first." } };
  if (body.length > MESSAGE_MAX) {
    return { ok: false, errors: { body: `Keep the message to ${MESSAGE_MAX} characters.` } };
  }
  return { ok: true, data: { body } };
}

/* --------------------------------------------------------------- accounts -- */

/** The ceilings the Configuration sliders are drawn against; the server enforces the same. */
export const LINKEDIN_LIMITS = { connections: 30, messages: 100, visits: 120 } as const;
export const EMAIL_CAP_MAX = 500;

export type AccountSettingsPatch = {
  connections?: number;
  messages?: number;
  visits?: number;
  cap?: number;
  rotate?: boolean;
};

const wholeNumber = (value: unknown, max: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max ? value : null;

/**
 * Only the dials a user can turn. Identity (handle, name), state and health are facts about the
 * connected account, not preferences, so they are never accepted from a request body.
 */
export function validateAccountPatch(
  channel: "linkedin" | "email",
  input: unknown,
): Validation<AccountSettingsPatch> {
  if (!isObject(input)) return { ok: false, errors: { _: "Expected an object." } };
  const errors: ValidationErrors = {};
  const out: AccountSettingsPatch = {};

  const numeric = (key: "connections" | "messages" | "visits" | "cap", max: number, label: string) => {
    if (input[key] === undefined) return;
    const value = wholeNumber(input[key], max);
    if (value === null) errors[key] = `${label} must be a whole number from 0 to ${max}.`;
    else out[key] = value;
  };

  if (channel === "linkedin") {
    numeric("connections", LINKEDIN_LIMITS.connections, "Connection requests");
    numeric("messages", LINKEDIN_LIMITS.messages, "Messages");
    numeric("visits", LINKEDIN_LIMITS.visits, "Profile visits");
  } else {
    numeric("cap", EMAIL_CAP_MAX, "The daily cap");
    if (input.rotate !== undefined) {
      if (typeof input.rotate !== "boolean") errors.rotate = "Rotate must be on or off.";
      else out.rotate = input.rotate;
    }
  }

  // Keys that belong to the other channel are mistakes, not no-ops.
  const allowed =
    channel === "linkedin" ? ["connections", "messages", "visits"] : ["cap", "rotate"];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) errors[key] = "That setting can't be changed here.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  if (Object.keys(out).length === 0) return { ok: false, errors: { _: "Send at least one setting to change." } };
  return { ok: true, data: out };
}

/** A list of campaign ids, deduplicated; whether they exist is the repository's check. */
export function validateCampaignIds(input: unknown): Validation<string[]> {
  if (!isObject(input) || !Array.isArray(input.campaignIds)) {
    return { ok: false, errors: { campaignIds: "Send the campaigns as a list." } };
  }
  const ids = new Set<string>();
  for (const entry of input.campaignIds) {
    const id = text(entry);
    if (!id || id.length > 64) return { ok: false, errors: { campaignIds: "Each campaign must be an id." } };
    ids.add(id);
  }
  if (ids.size > 200) return { ok: false, errors: { campaignIds: "Too many campaigns." } };
  return { ok: true, data: [...ids] };
}

/* --------------------------------------------------------- workspace settings -- */

const MAX_TOGGLES = 24;
const MAX_LIST = 20;
const MAX_TOKEN_LEN = 40;
const FALLBACK_MAX = 60;
const WEEKDAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** A bounded list of short strings, deduplicated; null on anything that doesn't fit. */
function stringList(value: unknown, maxItems: number, maxLen: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    const item = text(entry);
    if (!item || item.length > maxLen) return null;
    if (!out.includes(item)) out.push(item);
  }
  return out.length <= maxItems ? out : null;
}

/** A bounded map of short keys to booleans — the shape every toggle-row group above takes. */
function toggleMap(value: unknown, maxEntries = MAX_TOGGLES): Record<string, boolean> | null {
  if (!isObject(value)) return null;
  const out: Record<string, boolean> = {};
  let n = 0;
  for (const [key, v] of Object.entries(value)) {
    if (++n > maxEntries || !key || key.length > MAX_TOKEN_LEN || typeof v !== "boolean") return null;
    out[key] = v;
  }
  return out;
}

const inRange = (value: unknown, min: number, max: number): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
};

/**
 * `{token}` → fallback text, or null for "blank if missing". Shape only — which tokens exist is
 * the Variables tab's own catalogue (`lib/app/configuration.ts`), not something this layer knows.
 */
export type VariableFallbacksPatch = Record<string, string | null>;

export function validateVariableFallbacks(input: unknown): Validation<VariableFallbacksPatch> {
  if (!isObject(input)) return { ok: false, errors: { _: "Expected an object." } };
  const out: VariableFallbacksPatch = {};
  let n = 0;
  for (const [token, value] of Object.entries(input)) {
    if (!/^\{[a-z_]{1,30}\}$/.test(token)) {
      return { ok: false, errors: { _: "That is not a variable token." } };
    }
    if (value === null) {
      out[token] = null;
    } else if (typeof value === "string" && value.length <= FALLBACK_MAX) {
      out[token] = text(value);
    } else {
      return { ok: false, errors: { [token]: `Keep a fallback to ${FALLBACK_MAX} characters.` } };
    }
    if (++n > 40) return { ok: false, errors: { _: "Too many variables." } };
  }
  return { ok: true, data: out };
}

export type SendingRulesInput = {
  days: string[];
  from: string;
  to: string;
  timezone: "lead" | "workspace";
  holidays: string[];
  limitOn: boolean;
  perDay: number;
  perWeek: number;
  cooloff: number;
  /** Keyed by stop-rule id — see `STOP_RULES` in `lib/app/configuration.ts`. */
  stops: Record<string, boolean>;
  /** Keyed by audience-rule id — see `AUDIENCE_RULES`. */
  audience: Record<string, boolean>;
  bounceRate: number;
  acceptance: number;
  slowWhatsApp: boolean;
};

export type SendingRulesPatch = Partial<SendingRulesInput>;

/** A PATCH body: only the keys actually present are validated and applied. */
export function validateSendingRulesPatch(input: unknown): Validation<SendingRulesPatch> {
  if (!isObject(input)) return { ok: false, errors: { _: "Expected an object." } };
  const errors: ValidationErrors = {};
  const out: SendingRulesPatch = {};
  const has = (key: string) => input[key] !== undefined;

  if (has("days")) {
    const raw = input.days;
    if (!Array.isArray(raw) || !raw.every((d) => typeof d === "string" && WEEKDAY_ABBR.includes(d))) {
      errors.days = "Pick valid days.";
    } else {
      out.days = [...new Set(raw as string[])];
    }
  }
  if (has("from")) {
    if (typeof input.from !== "string" || !TIME_RE.test(input.from)) errors.from = "Enter a valid time.";
    else out.from = input.from;
  }
  if (has("to")) {
    if (typeof input.to !== "string" || !TIME_RE.test(input.to)) errors.to = "Enter a valid time.";
    else out.to = input.to;
  }
  if (has("timezone")) {
    const tz = oneOf(input.timezone, ["lead", "workspace"] as const);
    if (!tz) errors.timezone = "Pick a valid time zone.";
    else out.timezone = tz;
  }
  if (has("holidays")) {
    const holidays = stringList(input.holidays, MAX_LIST, MAX_TOKEN_LEN);
    if (!holidays) errors.holidays = "Pick valid countries.";
    else out.holidays = holidays;
  }
  if (has("limitOn")) {
    if (typeof input.limitOn !== "boolean") errors.limitOn = "Must be on or off.";
    else out.limitOn = input.limitOn;
  }
  if (has("perDay")) {
    const v = inRange(input.perDay, 1, 10);
    if (v === null) errors.perDay = "Per day must be between 1 and 10.";
    else out.perDay = v;
  }
  if (has("perWeek")) {
    const v = inRange(input.perWeek, 1, 30);
    if (v === null) errors.perWeek = "Per week must be between 1 and 30.";
    else out.perWeek = v;
  }
  if (has("cooloff")) {
    const v = inRange(input.cooloff, 0, 365);
    if (v === null) errors.cooloff = "Cool-off must be between 0 and 365 days.";
    else out.cooloff = v;
  }
  if (has("stops")) {
    const stops = toggleMap(input.stops);
    if (!stops) errors.stops = "Invalid stop rules.";
    else out.stops = stops;
  }
  if (has("audience")) {
    const audience = toggleMap(input.audience);
    if (!audience) errors.audience = "Invalid audience rules.";
    else out.audience = audience;
  }
  if (has("bounceRate")) {
    const v = inRange(input.bounceRate, 1, 20);
    if (v === null) errors.bounceRate = "Bounce rate must be between 1 and 20%.";
    else out.bounceRate = v;
  }
  if (has("acceptance")) {
    const v = inRange(input.acceptance, 5, 60);
    if (v === null) errors.acceptance = "Acceptance must be between 5 and 60%.";
    else out.acceptance = v;
  }
  if (has("slowWhatsApp")) {
    if (typeof input.slowWhatsApp !== "boolean") errors.slowWhatsApp = "Must be on or off.";
    else out.slowWhatsApp = input.slowWhatsApp;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  if (Object.keys(out).length === 0) return { ok: false, errors: { _: "Send at least one setting to change." } };
  return { ok: true, data: out };
}

export const RETENTION_CHOICES = ["12 months", "24 months", "36 months", "Never"] as const;

export type CompliancePatch = Partial<{
  domains: string[];
  /** Keyed by `ChannelKey`; the chosen consent-basis index for that channel. */
  consent: Record<string, number>;
  /** Keyed by regional-rule id — see `REGIONAL_RULES`. */
  regional: Record<string, boolean>;
  retention: (typeof RETENTION_CHOICES)[number];
}>;

export function validateCompliancePatch(input: unknown): Validation<CompliancePatch> {
  if (!isObject(input)) return { ok: false, errors: { _: "Expected an object." } };
  const errors: ValidationErrors = {};
  const out: CompliancePatch = {};
  const has = (key: string) => input[key] !== undefined;

  if (has("domains")) {
    const raw = input.domains;
    if (!Array.isArray(raw)) {
      errors.domains = "Domains must be a list.";
    } else {
      const domains: string[] = [];
      let bad = false;
      for (const entry of raw) {
        const d = text(entry).toLowerCase();
        if (!d || d.length > 253 || !DOMAIN_RE.test(d)) {
          bad = true;
          break;
        }
        if (!domains.includes(d)) domains.push(d);
      }
      if (bad) errors.domains = "Enter a valid domain.";
      else if (domains.length > 50) errors.domains = "Too many domains.";
      else out.domains = domains;
    }
  }
  if (has("consent")) {
    if (!isObject(input.consent)) {
      errors.consent = "Invalid consent choices.";
    } else {
      const consent: Record<string, number> = {};
      let bad = false;
      let n = 0;
      for (const [k, v] of Object.entries(input.consent)) {
        if (++n > 10 || !k || k.length > 16 || typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 5) {
          bad = true;
          break;
        }
        consent[k] = v;
      }
      if (bad) errors.consent = "Invalid consent choices.";
      else out.consent = consent;
    }
  }
  if (has("regional")) {
    const regional = toggleMap(input.regional);
    if (!regional) errors.regional = "Invalid regional rules.";
    else out.regional = regional;
  }
  if (has("retention")) {
    const retention = oneOf(input.retention, RETENTION_CHOICES);
    if (!retention) errors.retention = "Pick a valid retention period.";
    else out.retention = retention;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  if (Object.keys(out).length === 0) return { ok: false, errors: { _: "Send at least one setting to change." } };
  return { ok: true, data: out };
}
