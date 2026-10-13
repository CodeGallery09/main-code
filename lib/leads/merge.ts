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

const norm = (key: keyof ProfileAttributes, value: string) =>
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
