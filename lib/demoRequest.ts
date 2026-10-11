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

/* ---------------------------------------------------------------------------
   Founder call request: the "Speak with our Founders" booker on the landing page.
   The visitor proposes a date and time; nothing is scheduled until a founder replies,
   so the UI must call it a preferred time, never a confirmed booking.
   --------------------------------------------------------------------------- */
export const SLOT_FROM_MIN = 9 * 60; // 09:00
export const SLOT_TO_MIN = 17 * 60 + 30; // last start 17:30
export const SLOT_STEP_MIN = 30;
export const FOUNDER_TEXT_MAX = 600;
export const FOUNDER_NAME_MAX = 50;

export type FounderCallRequest = {
  fullName: string;
  workEmail: string;
  pains: string;
  notes: string;
  guestEmail: string; // "" when not provided
  date: string; // YYYY-MM-DD, in the visitor's time zone
  time: string; // HH:MM, 30-minute steps between 09:00 and 17:30
  timeZone: string; // IANA name reported by the browser, "" if unknown
};
export type FounderField = keyof FounderCallRequest;
export type FounderErrors = Partial<Record<FounderField, string>>;
export type FounderValidation = { ok: true; data: FounderCallRequest } | { ok: false; errors: FounderErrors };

export const FOUNDER_FIELD_ORDER: FounderField[] = ["fullName", "workEmail", "pains", "notes", "guestEmail", "date", "time"];

const NAME_RE = /^[\p{L}\p{M} .'’-]+$/u;

export function validateFounderCall(input: unknown): FounderValidation {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: FounderErrors = {};

  const fullName = str(src.fullName);
  if (fullName.replace(/[^\p{L}]/gu, "").length < 2) errors.fullName = "Enter your name (letters only).";
  else if (fullName.length > FOUNDER_NAME_MAX) errors.fullName = `Keep this under ${FOUNDER_NAME_MAX} characters.`;
  else if (!NAME_RE.test(fullName)) errors.fullName = "Use letters, spaces, hyphens and apostrophes only.";

  const workEmail = str(src.workEmail);
  if (!workEmail) errors.workEmail = "Enter your work email.";
  else if (workEmail.length > 254 || !EMAIL_RE.test(workEmail)) errors.workEmail = "Enter a valid email, like name@company.com.";

  const pains = str(src.pains);
  if (pains.length < 10) errors.pains = "Tell us a little more (at least a sentence).";
  else if (pains.length > FOUNDER_TEXT_MAX) errors.pains = `Keep this under ${FOUNDER_TEXT_MAX} characters.`;

  const notes = str(src.notes);
  if (notes.length > FOUNDER_TEXT_MAX) errors.notes = `Keep this under ${FOUNDER_TEXT_MAX} characters.`;

  const guestEmail = str(src.guestEmail);
  if (guestEmail && (guestEmail.length > 254 || !EMAIL_RE.test(guestEmail))) errors.guestEmail = "That guest email doesn't look right.";

  const date = str(src.date);
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const real = dm ? new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3])) : null;
  if (!dm || !real || real.getUTCFullYear() !== +dm[1] || real.getUTCMonth() !== +dm[2] - 1 || real.getUTCDate() !== +dm[3]) {
    errors.date = "Pick a date.";
  }

  const time = str(src.time);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  const mins = tm ? +tm[1] * 60 + +tm[2] : -1;
  if (mins < SLOT_FROM_MIN || mins > SLOT_TO_MIN || (mins - SLOT_FROM_MIN) % SLOT_STEP_MIN !== 0) errors.time = "Pick a time.";

  const timeZone = str(src.timeZone).slice(0, 64);

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { fullName, workEmail, pains, notes, guestEmail, date, time, timeZone } };
}

/** Response body returned by POST /api/demo-request for `kind: "founder_call"` requests. */
export type FounderSubmitResponse =
  | { ok: true }
  | { ok: false; code: "invalid"; errors: FounderErrors }
  | { ok: false; code: "not_configured" | "delivery_failed" | "bad_request"; message: string };
