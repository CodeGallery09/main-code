/**
 * A name, company and title for a row of an uploaded file.
 *
 * The upload maps columns to *contact attributes* (email, phone, WhatsApp, LinkedIn) and keeps
 * every other column as-is. A lead, though, needs a name to be shown and searched. This reads the
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

export type LeadIdentity = { name: string; company: string; title: string };

const NAME_MAX = 120;
const key = (header: string) => header.toLowerCase().replace(/[\s_\-.]+/g, "");

const NAME = ["name", "fullname", "contactname", "leadname", "contact", "person"];
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

export function leadIdentity(row: RowIdentity): LeadIdentity {
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
