// Shared demo-request contract: used by the form (client) and the API route (server).
// Keep this file dependency-free and import-free so it runs anywhere, including `node --test`.

export const ROLES = ["Founder/CEO", "Sales Leader", "Sales Representative", "RevOps", "Marketing", "Other"] as const;
export const TEAM_SIZES = ["1", "2–5", "6–10", "11–15", "16+"] as const;
export const CHALLENGES = [
  "Finding the right audience",
  "Coordinating outreach channels",
  "Improving replies/conversions",
  "Understanding campaign performance",
  "Managing compliance",
  "Other",
] as const;

export type DemoRequest = {
  fullName: string;
  workEmail: string;
  company: string;
  website: string; // normalised URL, or "" when not provided
  role: (typeof ROLES)[number];
  teamSize: (typeof TEAM_SIZES)[number];
  challenge: (typeof CHALLENGES)[number];
  notes: string;
};

export type DemoField = keyof DemoRequest;
export type DemoErrors = Partial<Record<DemoField, string>>;
export type DemoValidation = { ok: true; data: DemoRequest } | { ok: false; errors: DemoErrors };

export const FIELD_ORDER: DemoField[] = ["fullName", "workEmail", "company", "website", "role", "teamSize", "challenge", "notes"];
export const NOTES_MAX = 1000;
const TEXT_MAX = 120;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Accepts "acme.com" or "https://acme.com"; returns a normalised URL or null if invalid. */
export function normaliseWebsite(raw: string): string | null {
  const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || !/^[^.\s]+(\.[^.\s]+)+$/.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function oneOf<T extends readonly string[]>(list: T, v: string): v is T[number] {
  return (list as readonly string[]).includes(v);
}

export function validateDemoRequest(input: unknown): DemoValidation {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: DemoErrors = {};

  const fullName = str(src.fullName);
  if (!fullName) errors.fullName = "Enter your full name.";
  else if (fullName.length > TEXT_MAX) errors.fullName = `Keep this under ${TEXT_MAX} characters.`;

  const workEmail = str(src.workEmail);
  if (!workEmail) errors.workEmail = "Enter your work email.";
  else if (workEmail.length > 254 || !EMAIL_RE.test(workEmail)) errors.workEmail = "Enter a valid email, like name@company.com.";

  const company = str(src.company);
  if (!company) errors.company = "Enter your company name.";
  else if (company.length > TEXT_MAX) errors.company = `Keep this under ${TEXT_MAX} characters.`;

  const rawSite = str(src.website);
  let website = "";
  if (rawSite) {
    const normalised = rawSite.length <= 2048 ? normaliseWebsite(rawSite) : null;
    if (normalised) website = normalised;
    else errors.website = "Enter a valid website, like acme.com.";
  }

  const role = str(src.role);
  if (!oneOf(ROLES, role)) errors.role = "Select your role.";

  const teamSize = str(src.teamSize);
  if (!oneOf(TEAM_SIZES, teamSize)) errors.teamSize = "Select your team size.";

  const challenge = str(src.challenge);
  if (!oneOf(CHALLENGES, challenge)) errors.challenge = "Select your biggest GTM challenge.";

  const notes = str(src.notes);
  if (notes.length > NOTES_MAX) errors.notes = `Keep this under ${NOTES_MAX} characters.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      fullName,
      workEmail,
      company,
      website,
      role: role as DemoRequest["role"],
      teamSize: teamSize as DemoRequest["teamSize"],
      challenge: challenge as DemoRequest["challenge"],
      notes,
    },
  };
}

/** Response body returned by POST /api/demo-request. */
export type DemoSubmitResponse =
  | { ok: true }
  | { ok: false; code: "invalid"; errors: DemoErrors }
  | { ok: false; code: "not_configured" | "delivery_failed" | "bad_request"; message: string };
