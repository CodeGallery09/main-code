/**
 * Deduplication and parent-child profile merging.
 *
 * One lead is one profile. When an uploaded row shares a unique field with a
 * profile that already exists — email first, then mobile, WhatsApp, LinkedIn —
 * the row is treated as a child of that parent: the parent keeps its id and
 * everything it already knew, and any attribute it was missing is filled in
 * from the row. The profile is then linked to the segment the row came from, so
 * one person can belong to several uploads without being stored twice.
 *
 * Rows inside one file dedupe against each other the same way.
 *
 * Import-free and erasable so it runs under `node --test`.
 */

export type ProfileAttributes = {
  email: string | null;
  mobile: string | null;
  whatsapp: string | null;
  linkedin: string | null;
};

export type LeadProfile = ProfileAttributes & {
  id: string;
  /** Segments this profile belongs to, oldest first. */
  segmentIds: string[];
  /** Columns we had no attribute for, merged the same way (first value wins). */
  extra: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type IncomingLead = ProfileAttributes & {
  row: number;
  extra?: Record<string, string>;
};

/** Fields that identify a person, in the order they are trusted. */
export const MATCH_KEYS: (keyof ProfileAttributes)[] = ["email", "mobile", "whatsapp", "linkedin"];

export type MergeOutcome = {
  row: number;
  profileId: string;
  action: "created" | "merged";
  /** Which unique field matched the parent. */
  matchedOn: keyof ProfileAttributes | null;
  /** Attributes the parent was missing and gained from this row. */
  enriched: (keyof ProfileAttributes)[];
};

export type MergeResult = {
  profiles: LeadProfile[];
  outcomes: MergeOutcome[];
  created: number;
  merged: number;
};

/** The comparable form of an attribute: what two spellings of one person's address share. */
export const norm = (key: keyof ProfileAttributes, value: string) =>
  key === "email" ? value.trim().toLowerCase() : key === "linkedin" ? linkedinKey(value) : value.replace(/\D/g, "");

/** `linkedin.com/in/maya-reyes/` and `https://www.linkedin.com/in/maya-reyes` are one person. */
function linkedinKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .replace(/\?.*$/, "");
}

/**
 * Folds `incoming` into `existing` and returns the full profile list. `existing`
 * is never mutated, so a caller can show the result before storing it.
 */
export function mergeLeads(
  existing: LeadProfile[],
  incoming: IncomingLead[],
  segmentId: string,
  now: string,
  newId: (n: number) => string,
): MergeResult {
  const profiles: LeadProfile[] = existing.map((p) => ({
    ...p,
    segmentIds: [...p.segmentIds],
    extra: { ...p.extra },
  }));

  // Index every unique field of every profile, so a match is one lookup.
  const index: Record<string, number> = {};
  const keyOf = (field: keyof ProfileAttributes, value: string) => field + ":" + norm(field, value);
  profiles.forEach((p, at) => {
    for (const field of MATCH_KEYS) {
      const value = p[field];
      if (value) index[keyOf(field, value)] = at;
    }
  });

  const outcomes: MergeOutcome[] = [];
  let created = 0;
  let merged = 0;

  for (const lead of incoming) {
    if (!MATCH_KEYS.some((field) => lead[field])) continue; // nothing reachable, nothing to store

    let at = -1;
    let matchedOn: keyof ProfileAttributes | null = null;
    for (const field of MATCH_KEYS) {
      const value = lead[field];
      if (!value) continue;
      const hit = index[keyOf(field, value)];
      if (hit !== undefined) {
        at = hit;
        matchedOn = field;
        break;
      }
    }

    if (at === -1) {
      const profile: LeadProfile = {
        id: newId(profiles.length),
        email: lead.email,
        mobile: lead.mobile,
        whatsapp: lead.whatsapp,
        linkedin: lead.linkedin,
        segmentIds: [segmentId],
        extra: { ...(lead.extra || {}) },
        createdAt: now,
        updatedAt: now,
      };
      profiles.push(profile);
      const slot = profiles.length - 1;
      for (const field of MATCH_KEYS) {
        const value = profile[field];
        if (value) index[keyOf(field, value)] = slot;
      }
      created++;
      outcomes.push({ row: lead.row, profileId: profile.id, action: "created", matchedOn: null, enriched: [] });
      continue;
    }

    // Parent keeps everything it had; the child fills in what was missing.
    const parent = profiles[at];
    const enriched: (keyof ProfileAttributes)[] = [];
    for (const field of MATCH_KEYS) {
      const value = lead[field];
      if (!value || parent[field]) continue;
      parent[field] = value;
      index[keyOf(field, value)] = at;
      enriched.push(field);
    }
    for (const [column, value] of Object.entries(lead.extra || {})) {
      if (!parent.extra[column]) parent.extra[column] = value;
    }
    if (!parent.segmentIds.includes(segmentId)) parent.segmentIds.push(segmentId);
    parent.updatedAt = now;
    merged++;
    outcomes.push({ row: lead.row, profileId: parent.id, action: "merged", matchedOn, enriched });
  }

  return { profiles, outcomes, created, merged };
}

/* ---------- who is already in a journey ----------------------------------- */

/**
 * Which uploaded rows are people already in a journey in another campaign.
 *
 * A lead belongs to at most one campaign at a time (`leads.campaign_id`). Uploading a file that
 * contains someone who is already in a campaign would put them into a second sequence and message
 * them twice, so those rows are **excluded** from the new segment and the user is told how many,
 * and from which campaigns, before anything is saved.
 *
 * A row is in a journey if *any* of its unique fields — email, mobile, WhatsApp, LinkedIn —
 * matches a lead who has a campaign. `mergeLeads` stops at the first match when it merges, but
 * this check must not: a row matching one lead by email and a different, in-journey lead by phone
 * is still someone we are already talking to.
 *
 * Import-free and erasable so it runs under `node --test`.
 */

/** A lead the workspace already has, as far as matching is concerned. */
export type KnownLead = ProfileAttributes & {
  id: string;
  /** The campaign whose journey this lead is in, or null when it is in none. */
  campaignId: string | null;
};

export type InJourneyRow = {
  row: number;
  leadId: string;
  campaignId: string;
  matchedOn: keyof ProfileAttributes;
};

export type JourneyReport = {
  /** Rows left out of the segment. */
  excluded: number;
  /** 1-based file rows, capped for transport. */
  rows: number[];
  /** How many of the excluded rows are in each campaign. */
  byCampaign: { campaignId: string; count: number }[];
};

/** Campaign-bearing leads, indexed by every unique field they carry. */
function indexInJourney(known: KnownLead[]): Map<string, KnownLead> {
  const index = new Map<string, KnownLead>();
  for (const lead of known) {
    if (!lead.campaignId) continue;
    for (const field of MATCH_KEYS) {
      const value = lead[field];
      if (value) index.set(field + ":" + norm(field, value), lead);
    }
  }
  return index;
}

/** The incoming rows that match a lead who is already in a campaign. One entry per row. */
export function findInJourney(known: KnownLead[], incoming: IncomingLead[]): InJourneyRow[] {
  const index = indexInJourney(known);
  const found: InJourneyRow[] = [];
  for (const lead of incoming) {
    for (const field of MATCH_KEYS) {
      const value = lead[field];
      if (!value) continue;
      const hit = index.get(field + ":" + norm(field, value));
      if (hit && hit.campaignId) {
        found.push({ row: lead.row, leadId: hit.id, campaignId: hit.campaignId, matchedOn: field });
        break;
      }
    }
  }
  return found;
}

const MAX_ROWS = 500;

/** The numbers the summary step shows, from the rows `findInJourney` returned. */
export function journeyReport(found: InJourneyRow[]): JourneyReport {
  const counts = new Map<string, number>();
  for (const hit of found) counts.set(hit.campaignId, (counts.get(hit.campaignId) ?? 0) + 1);
  return {
    excluded: found.length,
    rows: found.slice(0, MAX_ROWS).map((hit) => hit.row),
    byCampaign: [...counts].map(([campaignId, count]) => ({ campaignId, count })).sort((a, b) => b.count - a.count),
  };
}
