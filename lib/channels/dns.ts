/**
 * Looking a sending domain's records up in public DNS. The reading of what comes back is in
 * `lib/data/dnsRecords.ts` (pure, tested); this file only asks.
 *
 * Every lookup has a short timeout and a missing record is an empty answer, not an error: a domain
 * with no DMARC record is a finding to show, and one slow resolver must not hang the request.
 *
 * Server-only (`node:dns`).
 */

import { Resolver } from "node:dns/promises";
import { DKIM_SELECTORS, readDkim, readDmarc, readSpf, type DomainRecords } from "@/lib/data/dnsRecords";

const TIMEOUT_MS = 4_000;

/** Whether a name answers with anything an email domain would have. */
async function exists(resolver: Resolver, host: string): Promise<boolean> {
  const attempt = (lookup: Promise<unknown[]>) =>
    Promise.race([
      lookup.then((rows) => rows.length > 0).catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), TIMEOUT_MS)),
    ]);
  const answers = await Promise.all([attempt(resolver.resolveMx(host)), attempt(resolver.resolve4(host))]);
  return answers.some(Boolean);
}

async function txt(resolver: Resolver, name: string): Promise<string[][]> {
  try {
    return await Promise.race([
      resolver.resolveTxt(name),
      new Promise<string[][]>((resolve) => setTimeout(() => resolve([]), TIMEOUT_MS)),
    ]);
  } catch {
    // ENOTFOUND / ENODATA: nothing published there.
    return [];
  }
}

export async function checkDomainRecords(host: string): Promise<DomainRecords> {
  const resolver = new Resolver({ timeout: TIMEOUT_MS, tries: 2 });
  const [found, root, dmarc, ...dkim] = (await Promise.all([
    exists(resolver, host),
    txt(resolver, host),
    txt(resolver, `_dmarc.${host}`),
    ...DKIM_SELECTORS.map((selector) => txt(resolver, `${selector}._domainkey.${host}`)),
  ])) as [boolean, string[][], string[][], ...string[][][]];
  return {
    found: found || root.length > 0,
    spf: readSpf(root),
    dmarc: readDmarc(dmarc),
    dkim: readDkim(DKIM_SELECTORS.map((selector, i) => ({ selector, records: dkim[i] }))),
  };
}
