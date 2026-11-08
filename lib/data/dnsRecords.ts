/**
 * Reading a sending domain's DNS: whether SPF, DKIM and DMARC are published, from the TXT records
 * `lib/channels/dns.ts` looked up.
 *
 * These three records are what a receiving server checks before it decides whether mail from the
 * domain is genuine. Missing any one is the commonest reason cold email lands in spam, so the
 * Setup screen shows each, with what it found, and the exact thing to add when it found nothing.
 *
 * **DKIM cannot be found by asking the domain.** Its record lives at `<selector>._domainkey.<domain>`
 * and the selector is chosen by whoever sends the mail. So this tries the selectors the common mail
 * providers use (`DKIM_SELECTORS`); a domain signing with a custom selector reads as "not found"
 * here even when it is fine, and the screen says so rather than calling it broken.
 *
 * Import-free and erasable, so `node --test` loads it directly.
 */

/** Selectors used by Google Workspace, Microsoft 365, Zoho and the common sending tools. */
export const DKIM_SELECTORS = [
  "google",
  "selector1",
  "selector2",
  "default",
  "k1",
  "s1",
  "s2",
  "dkim",
  "mail",
  "zmail",
  "smtp",
] as const;

export type RecordCheck = {
  ok: boolean;
  /** The record found, or "" when there was none. */
  record: string;
  /** One line on what was found or what to do. */
  note: string;
};

export type DomainRecords = {
  /**
   * Whether the domain answered at all (any MX, A or TXT record). A domain that does not exist —
   * a typo, or one not yet registered — is a different problem from one missing its records, and
   * the screen must not tell someone to add DKIM to a domain DNS has never heard of.
   */
  found: boolean;
  spf: RecordCheck;
  dkim: RecordCheck & { selector: string };
  dmarc: RecordCheck;
};

/** A TXT answer arrives as chunks per record; a record is its chunks joined. */
const joined = (records: string[][]): string[] => records.map((chunks) => chunks.join("").trim()).filter(Boolean);

/**
 * `https://www.Acme.com/about` → `acme.com`; `mail.acme.co.uk` stays as it is. `null` for anything
 * that is not a domain name.
 */
export function normaliseDomain(input: string): string | null {
  let value = (input ?? "").trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  if (value.includes("@")) value = value.split("@").pop() ?? "";
  if (value.startsWith("www.")) value = value.slice(4);
  if (value.length > 253) return null;
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(value) ? value : null;
}

/** SPF: exactly one `v=spf1` TXT record on the domain itself. Two is an error receivers punish. */
export function readSpf(records: string[][]): RecordCheck {
  const spf = joined(records).filter((r) => /^v=spf1(\s|$)/i.test(r));
  if (spf.length === 0) {
    return {
      ok: false,
      record: "",
      note: "No SPF record. Add a TXT record on the domain; your mail provider gives the exact value (Google: v=spf1 include:_spf.google.com ~all).",
    };
  }
  if (spf.length > 1) {
    return { ok: false, record: spf.join(" | "), note: "More than one SPF record. Merge them into one — receivers fail a domain with two." };
  }
  return { ok: true, record: spf[0], note: "Published." };
}

/** DMARC: a `v=DMARC1` TXT record at `_dmarc.<domain>`. `p=none` passes but is noted. */
export function readDmarc(records: string[][]): RecordCheck {
  const dmarc = joined(records).filter((r) => /^v=DMARC1(;|\s|$)/i.test(r));
  if (!dmarc.length) {
    return {
      ok: false,
      record: "",
      note: "No DMARC record. Add a TXT record at _dmarc with at least: v=DMARC1; p=none; rua=mailto:you@yourdomain",
    };
  }
  const policy = /(?:^|;)\s*p=(\w+)/i.exec(dmarc[0])?.[1]?.toLowerCase() ?? "";
  return {
    ok: true,
    record: dmarc[0],
    note: policy === "none" ? "Published, in monitoring mode (p=none). That is fine for sending." : `Published (p=${policy || "?"}).`,
  };
}

/** DKIM: the first selector with a key (`v=DKIM1` or a `p=` public key). */
export function readDkim(found: { selector: string; records: string[][] }[]): DomainRecords["dkim"] {
  for (const { selector, records } of found) {
    const key = joined(records).find((r) => /(^|;)\s*v=DKIM1/i.test(r) || /(^|;)\s*p=[A-Za-z0-9+/=]{20,}/.test(r));
    if (key) return { ok: true, selector, record: key.slice(0, 120), note: `Found under the "${selector}" selector.` };
  }
  return {
    ok: false,
    selector: "",
    record: "",
    note: `No DKIM key under the usual selectors (${DKIM_SELECTORS.slice(0, 3).join(", ")}…). Turn on DKIM signing at your mail provider and publish the record it gives you. If you use a custom selector, this check can't see it.`,
  };
}
