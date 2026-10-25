/**
 * A name, company and title for a row of an uploaded file.
 *
 * The upload maps columns to *contact attributes* (email, phone, WhatsApp, LinkedIn) and keeps
 * every other column as-is. An audience, though, needs a name to be shown and searched. This reads the
 * kept columns for the obvious ones, and when a file has none, falls back to something readable
 * made from the contact itself rather than storing a blank.
 *
 * Header names are used here only as a convenience for display fields. Reachability is never
 * decided by a header — see validation.ts.
 *
 * Import-free and erasable so it runs under `node --test`.
 */

export type RowIdentity = {
  email: string | null;
  mobile: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  extra: Record<string, string>;
};

export type AudienceIdentity = { name: string; company: string; title: string };

const NAME_MAX = 120;
const key = (header: string) => header.toLowerCase().replace(/[\s_\-.]+/g, "");

const NAME = ["name", "fullname", "contactname", "audiencename", "contact", "person"];
const FIRST = ["firstname", "givenname", "first", "fname"];
const LAST = ["lastname", "surname", "familyname", "last", "lname"];
const COMPANY = ["company", "companyname", "organization", "organisation", "account", "employer", "business"];
const TITLE = ["title", "jobtitle", "role", "position", "designation", "jobrole"];

/** The first non-empty value among the columns whose normalised header is in `wanted`. */
function pick(extra: Record<string, string>, wanted: string[]): string {
  const by = new Map<string, string>();
  for (const [header, value] of Object.entries(extra)) by.set(key(header), value);
  for (const name of wanted) {
    const value = by.get(name);
    if (value && value.trim()) return value.trim();
  }
  return "";
}

const titleCase = (text: string) =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

/** `priya.raman@kitebox.example` -> "Priya Raman"; `maya_reyes+sales@x.io` -> "Maya Reyes". */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0].split("+")[0].replace(/[._\-]+/g, " ").replace(/\d+/g, " ").trim();
  // A mailbox like "info" or "sales" is a role, not a person; "Info" would be a misleading name.
  if (!local || /^(info|sales|hello|hi|contact|support|team|admin|office|mail)$/i.test(local)) return "";
  return titleCase(local);
}

/** `https://linkedin.com/in/maya-reyes-1a2b3c/` -> "Maya Reyes". */
function nameFromLinkedin(url: string): string {
  const slug = url.replace(/\/+$/, "").split("/in/")[1]?.split(/[/?#]/)[0] ?? "";
  const words = slug
    .split("-")
    .filter((part) => part && !/\d/.test(part));
  return words.length ? titleCase(words.join(" ")) : "";
}

const clip = (text: string) => (text.length > NAME_MAX ? text.slice(0, NAME_MAX - 1) + "…" : text);

/**
 * Which display details the file itself does not give for a row. A name can still be shown (made
 * from the email or LinkedIn by `audienceIdentity`), but the preview says it was not in the file.
 */
export function identityGaps(extra: Record<string, string>): { name: boolean; company: boolean; title: boolean } {
  return {
    name: !pick(extra, NAME) && !pick(extra, FIRST) && !pick(extra, LAST),
    company: !pick(extra, COMPANY),
    title: !pick(extra, TITLE),
  };
}

const IDENTITY = new Set([...NAME, ...FIRST, ...LAST, ...COMPANY, ...TITLE]);
const COMPANY_FACTS = new Set([
  "industry", "sector", "vertical",
  "website", "companywebsite", "companyurl", "domain", "companydomain",
  "employees", "employeecount", "companysize", "size", "headcount",
  "location", "city", "state", "country", "region", "hq", "headquarters",
  "revenue", "annualrevenue", "founded", "foundedyear",
]);

/**
 * Sorts the kept columns of an upload for the prospect profile: company columns (industry,
 * website, size, location, …) and everything else. Name, company and title columns are left out —
 * they are already the audience's own fields. Values are shown exactly as the file gave them.
 */
export function splitFileFields(extra: Record<string, string>): {
  company: { label: string; value: string }[];
  other: { label: string; value: string }[];
} {
  const company: { label: string; value: string }[] = [];
  const other: { label: string; value: string }[] = [];
  for (const [label, raw] of Object.entries(extra)) {
    const value = String(raw ?? "").trim();
    const k = key(label);
    if (!value || IDENTITY.has(k)) continue;
    (COMPANY_FACTS.has(k) ? company : other).push({ label, value });
  }
  return { company, other };
}

export function audienceIdentity(row: RowIdentity): AudienceIdentity {
  let name = pick(row.extra, NAME);
  if (!name) {
    const first = pick(row.extra, FIRST);
    const last = pick(row.extra, LAST);
    name = [first, last].filter(Boolean).join(" ");
  }
  if (!name && row.email) name = nameFromEmail(row.email);
  if (!name && row.linkedin) name = nameFromLinkedin(row.linkedin);
  if (!name) {
    const number = row.mobile || row.whatsapp;
    name = number ? `Contact ${number}` : row.email ? row.email.split("@")[0] : "Unnamed contact";
  }
  return {
    name: clip(name),
    company: clip(pick(row.extra, COMPANY)),
    title: clip(pick(row.extra, TITLE)),
  };
}

/**
 * What an import may fill in on an audience that already existed: its company and title, and only where
 * the audience has none. An audience added by hand carries just a name and contact details, so a file that
 * matches it later is where those come from. The name is never replaced, and nothing the audience
 * already has is overwritten — the same "keeps what it has, gains what it lacked" rule merge.ts
 * applies to contact fields.
 */
export function identityFill(
  current: { company: string; title: string },
  row: RowIdentity,
): { company?: string; title?: string } {
  const from = audienceIdentity(row);
  const fill: { company?: string; title?: string } = {};
  if (!current.company.trim() && from.company) fill.company = from.company;
  if (!current.title.trim() && from.title) fill.title = from.title;
  return fill;
}
