/**
 * The content-based rules that decide whether an uploaded row is reachable.
 *
 * Column names are never trusted: a column is whatever the user mapped it to,
 * and every row entry is judged on its own content.
 *
 *   Email     — the entry has to contain "@" (and something either side of it).
 *   Mobile    — a leading "+" country code and exactly as many digits as that
 *               country allows. The digit rules come from a phone library, so
 *               this module takes the check as an argument and stays import-free.
 *   WhatsApp  — the same rule as Mobile.
 *   LinkedIn  — a web URL has to be present in the entry.
 *
 * Import-free and erasable so it runs in the browser, in a route handler and
 * directly under `node --test`.
 */

export type AttributeKey = "email" | "mobile" | "whatsapp" | "linkedin";

export const ATTRIBUTES: { key: AttributeKey; label: string; hint: string }[] = [
  { key: "email", label: "Email", hint: "Must contain @" },
  { key: "mobile", label: "Mobile number", hint: "+country code, exact digits" },
  { key: "whatsapp", label: "WhatsApp number", hint: "+country code, exact digits" },
  { key: "linkedin", label: "LinkedIn profile URL", hint: "Must be a web URL" },
];

/** Which uploaded column feeds each attribute. A missing key means "not mapped". */
export type Mapping = Partial<Record<AttributeKey, string>>;

/** The outcome of one cell check. `value` is the normalised form we store. */
export type CellCheck = { ok: boolean; value?: string; reason?: string };

/** Signature of the phone check this module is handed (see ./phone.ts). */
export type PhoneCheck = (raw: string) => CellCheck;

export function checkEmail(raw: string): CellCheck {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "Email is blank" };
  if (!value.includes("@")) return { ok: false, reason: "“@” is not present" };
  const [local, ...rest] = value.split("@");
  const domain = rest.join("@");
  if (!local || !domain) return { ok: false, reason: "“@” has nothing either side of it" };
  if (/\s/.test(value)) return { ok: false, reason: "Email contains a space" };
  return { ok: true, value: value.toLowerCase() };
}

/**
 * A web URL has to be present. A bare host like `linkedin.com/in/maya` counts —
 * the rule is about a URL being there, not about how it was typed.
 */
export function checkUrl(raw: string): CellCheck {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "URL not present" };
  const match = value.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/i);
  if (!match) return { ok: false, reason: "URL not present" };
  const found = match[0];
  const url = /^https?:\/\//i.test(found) ? found : "https://" + found;
  return { ok: true, value: url };
}

/** Runs the rule for one attribute against one cell. */
export function checkCell(attribute: AttributeKey, raw: string, phone: PhoneCheck): CellCheck {
  if (attribute === "email") return checkEmail(raw);
  if (attribute === "linkedin") return checkUrl(raw);
  return phone(raw);
}

/* ---------- a whole upload ------------------------------------------------ */

/** One lead as it came off the sheet, with only the entries that passed. */
export type ParsedLead = {
  /** 1-based row number in the file, header excluded — what the error log shows. */
  row: number;
  email: string | null;
  mobile: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  /** Every other column, kept so nothing from the file is silently dropped. */
  extra: Record<string, string>;
};

export type RowError = {
  row: number;
  attribute: AttributeKey;
  /** The entry as it appeared, trimmed and shortened for display. */
  value: string;
  reason: string;
};

export type ChannelSummary = {
  attribute: AttributeKey;
  mapped: boolean;
  column: string | null;
  total: number;
  reachable: number;
  invalid: number;
  blank: number;
};

export type UploadSummary = {
  totalRows: number;
  /** Rows reachable on at least one mapped channel. */
  reachableRows: number;
  channels: ChannelSummary[];
  errors: RowError[];
  leads: ParsedLead[];
};

const shorten = (value: string) => (value.length > 48 ? value.slice(0, 45) + "…" : value);

/**
 * Validates every row against the mapping and returns the reachable counts, the
 * row-by-row error log and the leads worth saving.
 */
export function validateUpload(
  headers: string[],
  rows: string[][],
  mapping: Mapping,
  phone: PhoneCheck,
): UploadSummary {
  const index: Partial<Record<AttributeKey, number>> = {};
  for (const { key } of ATTRIBUTES) {
    const column = mapping[key];
    if (!column) continue;
    const at = headers.indexOf(column);
    if (at >= 0) index[key] = at;
  }

  const channels: ChannelSummary[] = ATTRIBUTES.map(({ key }) => ({
    attribute: key,
    mapped: index[key] !== undefined,
    column: index[key] !== undefined ? headers[index[key] as number] : null,
    total: rows.length,
    reachable: 0,
    invalid: 0,
    blank: 0,
  }));
  const byKey: Record<string, ChannelSummary> = {};
  for (const c of channels) byKey[c.attribute] = c;

  const errors: RowError[] = [];
  const leads: ParsedLead[] = [];
  const mappedColumns = new Set(Object.values(mapping).filter(Boolean) as string[]);

  rows.forEach((cells, i) => {
    const row = i + 1;
    const lead: ParsedLead = { row, email: null, mobile: null, whatsapp: null, linkedin: null, extra: {} };

    for (const { key } of ATTRIBUTES) {
      const at = index[key];
      if (at === undefined) continue;
      const raw = (cells[at] || "").trim();
      const summary = byKey[key];
      if (!raw) {
        summary.blank++;
        errors.push({ row, attribute: key, value: "", reason: BLANK_REASON[key] });
        continue;
      }
      const check = checkCell(key, raw, phone);
      if (check.ok && check.value) {
        summary.reachable++;
        lead[key] = check.value;
      } else {
        summary.invalid++;
        errors.push({ row, attribute: key, value: shorten(raw), reason: check.reason || "Invalid entry" });
      }
    }

    headers.forEach((header, at) => {
      if (mappedColumns.has(header)) return;
      const raw = (cells[at] || "").trim();
      if (raw) lead.extra[header] = raw;
    });

    leads.push(lead);
  });

  const reachableRows = leads.filter((l) => l.email || l.mobile || l.whatsapp || l.linkedin).length;

  return { totalRows: rows.length, reachableRows, channels, errors, leads };
}

/**
 * The same summary with some rows taken out — used for people already in another campaign, who are
 * not part of the segment. Counts of reachable rows drop by the entries those rows contributed;
 * `totalRows` and the error log stay as the file was, since they describe the file, not the segment.
 */
export function withoutRows(summary: UploadSummary, rows: ReadonlySet<number>): UploadSummary {
  if (!rows.size) return summary;
  const dropped = summary.leads.filter((lead) => rows.has(lead.row));
  const channels = summary.channels.map((channel) => ({
    ...channel,
    reachable: channel.reachable - dropped.filter((lead) => lead[channel.attribute]).length,
  }));
  const leads = summary.leads.filter((lead) => !rows.has(lead.row));
  return {
    ...summary,
    channels,
    leads,
    reachableRows: leads.filter((l) => l.email || l.mobile || l.whatsapp || l.linkedin).length,
  };
}

const BLANK_REASON: Record<AttributeKey, string> = {
  email: "Email is blank",
  mobile: "Mobile number is blank",
  whatsapp: "WhatsApp number is blank",
  linkedin: "URL not present",
};

/* ---------- mapping guesses ---------------------------------------------- */

const HINTS: Record<AttributeKey, string[]> = {
  email: ["email", "e-mail", "mail", "work email", "emailaddress"],
  mobile: ["mobile", "phone", "cell", "contact number", "tel"],
  whatsapp: ["whatsapp", "wa", "whats app"],
  linkedin: ["linkedin", "li url", "profile url", "linked in"],
};

/**
 * A first guess at the mapping from the header text, only as a convenience —
 * the user can change every row, and validation never looks at header names.
 */
export function suggestMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const taken = new Set<string>();
  for (const key of ["email", "whatsapp", "mobile", "linkedin"] as AttributeKey[]) {
    const hit = headers.find((h) => {
      if (taken.has(h)) return false;
      const text = h.toLowerCase().replace(/[_-]+/g, " ");
      return HINTS[key].some((hint) => text.includes(hint));
    });
    if (hit) {
      mapping[key] = hit;
      taken.add(hit);
    }
  }
  return mapping;
}
