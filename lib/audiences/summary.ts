/**
 * A lead's LinkedIn profile, read as a GTM briefing.
 *
 * Everything here is **derived from the profile the provider returned** — their own headline, their
 * own roles, their own skills. Nothing is invented: a field the profile does not carry comes out
 * empty rather than guessed, and the one judgement this file makes (what kind of pitch tends to
 * land on a person in this seat) is labelled as a read of their role, not a fact about them.
 *
 * Import-free and erasable, so `node --test` can load it directly (see CLAUDE.md).
 */

export type SummaryRole = {
  title: string;
  company: string;
  period: string;
  description: string;
};

export type ProfileInput = {
  name: string;
  headline: string;
  summary: string;
  location: string;
  company: string;
  title: string;
  degree: number;
  followers: number | null;
  isPremium: boolean;
  isOpenToWork: boolean;
  isHiring: boolean;
  experience: SummaryRole[];
  education: { school: string; degree: string; field: string; period: string }[];
  skills: string[];
};

export type LeadBriefing = {
  /** One line: who they are and where. */
  headline: string;
  /** Two or three sentences a seller can read before a call. */
  background: string;
  /** Short factual chips — degree, hiring, tenure. Each is true of the profile or absent. */
  signals: string[];
  /** Topics that appear on their own profile, deduplicated and capped. */
  interests: string[];
  /** How they are likely to buy, read from their seat. Labelled as a read, never as a fact. */
  pitch: { seat: string; angle: string; avoid: string };
  /** Their roles, newest first, as the provider gave them. */
  employment: SummaryRole[];
  /** Openers built only from facts on the profile. Empty when the profile carries too little. */
  openers: string[];
};

type Seat = { seniority: "founder" | "exec" | "leader" | "manager" | "individual"; fn: Fn };
type Fn = "sales" | "marketing" | "product" | "engineering" | "operations" | "finance" | "people" | "general";

const SENIORITY: [RegExp, Seat["seniority"]][] = [
  [/\b(founder|co-?founder|owner|proprietor)\b/i, "founder"],
  [/\b(ceo|cto|coo|cfo|cmo|cro|cpo|chief|president|partner|managing director)\b/i, "exec"],
  [/\b(vp|vice president|svp|evp|head of|director)\b/i, "leader"],
  [/\b(manager|lead|principal|senior manager)\b/i, "manager"],
];

const FUNCTION: [RegExp, Fn][] = [
  [/\b(sales|account executive|business development|bdr|sdr|revenue|gtm|go-?to-?market)\b/i, "sales"],
  [/\b(marketing|demand gen|growth|brand|content|seo|campaign)\b/i, "marketing"],
  [/\b(product|pm\b|product manager|design|ux)\b/i, "product"],
  [/\b(engineer|engineering|developer|software|technical|architect|data)\b/i, "engineering"],
  [/\b(operations|ops|supply|logistics|program|project)\b/i, "operations"],
  [/\b(finance|accounting|controller|treasur)\b/i, "finance"],
  [/\b(people|talent|recruit|hr\b|human resources)\b/i, "people"],
];

/** Which seat this person sits in, read from their title and headline. */
export function readSeat(title: string, headline: string): Seat {
  const text = `${title} ${headline}`;
  const seniority = SENIORITY.find(([pattern]) => pattern.test(text))?.[1] ?? "individual";
  const fn = FUNCTION.find(([pattern]) => pattern.test(text))?.[1] ?? "general";
  return { seniority, fn };
}

const SEAT_NAME: Record<Seat["seniority"], string> = {
  founder: "Founder",
  exec: "Executive",
  leader: "Functional leader",
  manager: "Manager",
  individual: "Individual contributor",
};

const FN_NAME: Record<Fn, string> = {
  sales: "sales",
  marketing: "marketing",
  product: "product",
  engineering: "engineering",
  operations: "operations",
  finance: "finance",
  people: "people",
  general: "",
};

/** What tends to land on a seat like this, and what tends not to. A read, not a claim about them. */
function pitchFor(seat: Seat): { angle: string; avoid: string } {
  const byFunction: Partial<Record<Fn, { angle: string; avoid: string }>> = {
    sales: {
      angle: "Lead with pipeline and reply rates. People in revenue seats buy a number they are measured on, so open with what changes in their funnel and how fast.",
      avoid: "Feature tours and architecture. They will forward those to someone else.",
    },
    marketing: {
      angle: "Lead with attribution and the cost of a qualified conversation. Show where the channel mix moves.",
      avoid: "Seat-level workflow detail: it reads as a tool for a different team.",
    },
    product: {
      angle: "Lead with the workflow and what it removes. They respond to a clear before-and-after of the day-to-day.",
      avoid: "Revenue projections they do not own.",
    },
    engineering: {
      angle: "Lead with how it fits what they already run — integration surface, data flow, what it does not require.",
      avoid: "Outcome claims with no mechanism behind them.",
    },
    operations: {
      angle: "Lead with handoffs removed and hours saved per week, with the steps named.",
      avoid: "Strategy framing; they want the process.",
    },
    finance: {
      angle: "Lead with cost per outcome and what is replaced. Be specific about the contract.",
      avoid: "Anything that sounds like an unbudgeted pilot.",
    },
    people: {
      angle: "Lead with time back for the team and the quality of each conversation.",
      avoid: "Volume language; it reads as spam risk.",
    },
  };
  const base = byFunction[seat.fn] ?? {
    angle: "Lead with the single problem their title implies and one concrete outcome. Keep the first message to one ask.",
    avoid: "A broad product pitch before you know which problem is theirs.",
  };
  if (seat.seniority === "founder" || seat.seniority === "exec") {
    return {
      angle: `${base.angle} At this level keep it to three sentences and name the business outcome first.`,
      avoid: `${base.avoid} Long messages and multiple asks.`,
    };
  }
  if (seat.seniority === "individual") {
    return {
      angle: `${base.angle} They are likely a user rather than the budget holder, so aim for a referral upward as much as a meeting.`,
      avoid: `${base.avoid} Pricing and contract talk this early.`,
    };
  }
  return base;
}

const clean = (value: string): string => (value ?? "").replace(/\s+/g, " ").trim();

/** Topic words from the person's own profile: their skills first, then nouns from their headline. */
function interestsOf(profile: ProfileInput): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const value = clean(raw);
    const key = value.toLowerCase();
    if (!value || value.length < 3 || seen.has(key)) return;
    seen.add(key);
    out.push(value);
  };
  for (const skill of profile.skills) add(skill);
  // A headline is written by the person about what they do, so its phrases are topics they chose.
  for (const phrase of clean(profile.headline).split(/[|•·,—–]|\s+at\s+/i)) {
    const value = clean(phrase);
    if (value && value.split(" ").length <= 5) add(value);
  }
  return out.slice(0, 8);
}

/** "3 years" from "2021 - Present", or "" when the period does not carry two readable years. */
function tenure(period: string): string {
  const years = clean(period).match(/(19|20)\d{2}/g);
  if (!years) return "";
  const from = Number(years[0]);
  const to = /present|current/i.test(period) ? new Date().getFullYear() : Number(years[1] ?? years[0]);
  const span = to - from;
  if (!Number.isFinite(span) || span < 0) return "";
  if (span === 0) return "under a year";
  return `${span} ${span === 1 ? "year" : "years"}`;
}

/**
 * The briefing. Give it what the provider returned; it never reaches back out for more.
 */
export function buildBriefing(profile: ProfileInput): LeadBriefing {
  const seat = readSeat(profile.title, profile.headline);
  const pitch = pitchFor(seat);
  const roles = profile.experience.map((role) => ({
    title: clean(role.title),
    company: clean(role.company),
    period: clean(role.period),
    description: clean(role.description),
  }));
  const current = roles[0];
  const held = current ? tenure(current.period) : "";
  const previous = roles.slice(1, 4).map((role) => role.company).filter(Boolean);

  const signals: string[] = [];
  if (profile.degree === 1) signals.push("Already a 1st-degree connection");
  else if (profile.degree === 2) signals.push("2nd degree — a shared connection can introduce you");
  else if (profile.degree >= 3) signals.push(`${profile.degree}rd degree or further`);
  if (profile.isHiring) signals.push("Hiring right now");
  if (profile.isOpenToWork) signals.push("Open to work — may be leaving the seat");
  if (profile.isPremium) signals.push("LinkedIn Premium — checks InMail");
  if (held) signals.push(`${held} in the current role`);
  if (profile.followers && profile.followers >= 2000) signals.push(`${profile.followers.toLocaleString("en-IN")} followers — posts publicly`);

  const where = [clean(profile.title), clean(profile.company) && `at ${clean(profile.company)}`]
    .filter(Boolean)
    .join(" ");
  const headline = clean(profile.headline) || where || clean(profile.name);

  const sentences: string[] = [];
  if (where) sentences.push(`${clean(profile.name) || "This lead"} is ${where}${held ? `, ${held} in the seat` : ""}${clean(profile.location) ? `, based in ${clean(profile.location)}` : ""}.`);
  if (previous.length) sentences.push(`Previously at ${previous.join(", ")}.`);
  if (clean(profile.summary)) {
    const about = clean(profile.summary);
    sentences.push(`In their own words: "${about.length > 220 ? `${about.slice(0, 219)}…` : about}"`);
  }
  const school = profile.education[0];
  if (school && clean(school.school)) {
    sentences.push(`Studied ${[clean(school.field) || clean(school.degree), `at ${clean(school.school)}`].filter(Boolean).join(" ")}.`);
  }

  const openers: string[] = [];
  if (current?.company && held && held !== "under a year") {
    openers.push(`Mention the ${held} at ${current.company} and ask what has changed about the role in that time.`);
  }
  if (profile.isHiring && current?.company) {
    openers.push(`They are hiring at ${current.company} — a growing team is a reason the problem is live now.`);
  }
  if (previous.length) {
    openers.push(`Ask how the move from ${previous[0]} to ${current?.company || "their current company"} changed what they measure.`);
  }
  if (profile.skills.length) {
    openers.push(`Their profile lists ${profile.skills.slice(0, 3).join(", ")} — open on the one closest to what you sell.`);
  }

  return {
    headline,
    background: sentences.join(" "),
    signals,
    interests: interestsOf(profile),
    pitch: {
      seat: [SEAT_NAME[seat.seniority], FN_NAME[seat.fn]].filter(Boolean).join(" · "),
      angle: pitch.angle,
      avoid: pitch.avoid,
    },
    employment: roles.slice(0, 6),
    openers: openers.slice(0, 3),
  };
}

/* ---------- what is kept on the lead -------------------------------------- */

/**
 * The LinkedIn read, as it is stored on `audiences.extra.linkedin`.
 *
 * It lives in the existing `extra` jsonb rather than in columns of its own so that reading a
 * profile needs no migration — and so a provider that returns a different shape tomorrow cannot
 * break a write path.
 */
export type LinkedInExtra = {
  /** The provider's internal id. An invite or a message is addressed to this, not to the URL. */
  providerId: string;
  /** ISO. How old the briefing is, so a screen can offer to read it again. */
  fetchedAt: string;
  profileUrl: string;
  briefing: LeadBriefing | null;
};

const EMPTY_EXTRA: LinkedInExtra = { providerId: "", fetchedAt: "", profileUrl: "", briefing: null };

/** Reads the stored block back, tolerating a row written before this existed. */
export function readLinkedInExtra(extra: unknown): LinkedInExtra {
  if (typeof extra !== "object" || extra === null) return EMPTY_EXTRA;
  const block = (extra as Record<string, unknown>).linkedin;
  if (typeof block !== "object" || block === null) return EMPTY_EXTRA;
  const row = block as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    providerId: text(row.providerId),
    fetchedAt: text(row.fetchedAt),
    profileUrl: text(row.profileUrl),
    briefing: (row.briefing as LeadBriefing | undefined) ?? null,
  };
}
