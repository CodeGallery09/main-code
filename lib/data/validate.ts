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
export const LEAD_STAGES = ["reaching", "engaged", "hot", "meeting", "nurture", "closed"] as const;
export const LEAD_SOURCES = ["form", "csv", "linkedin", "crm", "event"] as const;
export const CAMPAIGN_STATUSES = ["live", "scheduled", "paused", "draft"] as const;
export const CAMPAIGN_TYPES = ["standalone", "multichannel"] as const;

export const NAME_MAX = 120;
export const TAGS_MAX = 10;
export const TAG_MAX = 32;
export const NEXT_STEP_MAX = 200;
export const MESSAGE_MAX = 5000;

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
  email: string | null;
  phone: string | null;
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

  if (has("stage") || !partial) {
    const stage = oneOf(input.stage ?? "reaching", LEAD_STAGES);
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
