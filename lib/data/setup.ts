/**
 * What is, and is not, set up in a workspace — computed from the workspace's own accounts and
 * domains, never typed in.
 *
 * Every check here is a statement about real state. A new workspace with no LinkedIn account
 * connected gets a blocking "no LinkedIn account" check, because that is true; it does not get
 * invented trouble about a teammate or a domain it has never had.
 *
 * Blocking (`bad`) checks are the ones that stop a message sending or landing; the rail badge on
 * Configuration counts them. Only checks that can be computed from persisted state are here —
 * nothing about sending windows or fallbacks, which are not stored yet.
 *
 * Import-free and erasable so the repository, the browser and `node --test` can all use it.
 */

import type { AccountsSnapshot } from "./types";

export type CheckTone = "bad" | "info" | "ok";

/** The Setup tab a check's button should open. */
export type CheckTab = "li" | "mail";

export type SetupCheck = {
  id: string;
  tone: CheckTone;
  title: string;
  detail: string;
  /** The button on the right; absent on a passing check. */
  action?: string;
  goes?: CheckTab;
};

const list = (items: string[]) =>
  items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const verified = (d: { spf: boolean; dkim: boolean; dmarc: boolean }) => d.spf && d.dkim && d.dmarc;

/** The records a domain is missing, in the order DNS guides list them. */
export function missingRecords(d: { spf: boolean; dkim: boolean; dmarc: boolean }): string[] {
  return [!d.spf && "SPF", !d.dkim && "DKIM", !d.dmarc && "DMARC"].filter(Boolean) as string[];
}

/**
 * A LinkedIn account that cannot send until someone acts: the session lapsed, LinkedIn restricted
 * it, or a sign-in was started and never finished. Shared with the Integrations screen so both
 * read the same rule.
 */
export const linkedInNeedsAction = (state: string): boolean =>
  state === "signed_out" || state === "restricted" || state === "connecting";

/** The wording each blocked state deserves. A restriction is not a sign-out and must not say so. */
export function linkedInStateNote(state: string): string {
  if (state === "restricted") return "LinkedIn has restricted this account";
  if (state === "connecting") return "sign-in not finished";
  return "needs to log in again";
}

export function setupChecks(snapshot: AccountsSnapshot): SetupCheck[] {
  const checks: SetupCheck[] = [];
  const linkedin = snapshot.accounts.filter((a) => a.channel === "linkedin");
  const mailboxes = snapshot.accounts.filter((a) => a.channel === "email");

  /* LinkedIn */
  if (!linkedin.length) {
    checks.push({
      id: "li-accounts",
      tone: "bad",
      title: "No LinkedIn account connected",
      detail: "LinkedIn steps have no account to send from. Connect one in Config.",
      goes: "li",
    });
  } else {
    const out = linkedin.filter((a) => linkedInNeedsAction(a.state));
    checks.push(
      out.length
        ? {
            id: "li-accounts",
            tone: "bad",
            title: "LinkedIn accounts connected",
            detail: `${list(out.map((a) => `${a.name} (${linkedInStateNote(a.state)})`))}. Steps that use ${out.length === 1 ? "it" : "them"} are paused.`,
            action: "Reconnect",
            goes: "li",
          }
        : {
            id: "li-accounts",
            tone: "ok",
            title: "LinkedIn accounts connected",
            detail: `${linkedin.length} ${linkedin.length === 1 ? "account" : "accounts"} ready to send.`,
          },
    );
  }

  /* Email */
  if (!mailboxes.length) {
    // Information, not a failure: connecting a mailbox is not built, so there is nothing the user
    // can do about it. Scoring it would leave every workspace permanently short of full marks
    // with a red row and no action — a score nobody can complete is not a score.
    checks.push({
      id: "mail-accounts",
      tone: "info",
      title: "Connecting a mailbox isn't available yet",
      detail: "Email steps will have no mailbox to send from until it is. Nothing to do here today.",
    });
  } else {
    checks.push({
      id: "mail-accounts",
      tone: "ok",
      title: "Mailboxes connected",
      detail: `${mailboxes.length} ${mailboxes.length === 1 ? "mailbox" : "mailboxes"} ready to send.`,
    });
  }

  if (snapshot.domains.length) {
    const bad = snapshot.domains.filter((d) => !verified(d));
    checks.push(
      bad.length
        ? {
            id: "mail-dns",
            tone: "bad",
            title: "Email domains authenticated",
            detail: `${list(bad.map((d) => `${d.host} (missing ${missingRecords(d).join(", ")})`))}. Mail from ${bad.length === 1 ? "this domain" : "these"} lands in spam.`,
            action: "Fix DNS",
            goes: "mail",
          }
        : {
            id: "mail-dns",
            tone: "ok",
            title: "Email domains authenticated",
            detail: "SPF, DKIM and DMARC pass on every sending domain.",
          },
    );
  }

  for (const box of mailboxes) {
    if (box.channel === "email" && box.state === "warming") {
      checks.push({
        id: `warmup-${box.id}`,
        tone: "info",
        title: "Mailbox warm-up",
        detail: `${box.handle} is on day ${box.settings.warmDay ?? 1} of 14.`,
        action: "View",
        goes: "mail",
      });
    }
  }

  /* Roadmap channels are not problems; they are not built. Say so once. */
  checks.push({
    id: "planned",
    tone: "info",
    title: "WhatsApp, calls and SMS are planned",
    detail: "These channels aren't available yet, so nothing needs setting up for them.",
  });

  return checks;
}

/** Everything that can stop a message sending or landing. The Configuration rail badge. */
export const blockingCount = (checks: SetupCheck[]): number => checks.filter((c) => c.tone === "bad").length;

/** Issue counts per tab, for the tab badges. */
export function tabIssues(checks: SetupCheck[]): Partial<Record<CheckTab, number>> {
  const out: Partial<Record<CheckTab, number>> = {};
  for (const check of checks) {
    if (check.tone === "bad" && check.goes) out[check.goes] = (out[check.goes] ?? 0) + 1;
  }
  return out;
}
