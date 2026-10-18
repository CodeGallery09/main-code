/**
 * The Configuration screen's static definitions: the tab list, the rules a workspace can switch
 * (with the values they start at), the personalisation variables the product understands, and the
 * compliance choices.
 *
 * **Nothing here describes a particular workspace.** Accounts, domains, campaigns and the setup
 * checks come from the database (`lib/data/setup.ts`, `/api/accounts`); this file only says what
 * can be configured and what each setting defaults to. Variables, Sending rules and Compliance do
 * have a real settings store behind them now (`workspace_settings`, via `/api/settings` —
 * see `defaultWorkspaceSettings()` below) — but nothing enforces them yet, because
 * `SENDING_ENABLED` in `lib/capabilities.ts` stays false until a real sender exists.
 *
 * Only `lib/app/channels` and (as a type only, fully erased) `lib/data/types` are imported, so
 * this can still be read from a server component, a client component or a test alike.
 */

import type { ChannelKey } from "@/lib/app/channels";
import type { WorkspaceSettings } from "@/lib/data/types";

/* ---------- the tabs ------------------------------------------------------ */

export type ConfigTab =
  | "overview"
  | "li"
  | "mail"
  | "wa"
  | "call"
  | "sms"
  | "variables"
  | "sending"
  | "compliance";

/** Tab key and label. The issue count on a tab's badge comes from `lib/data/setup.ts`. */
export const CONFIG_TABS: [ConfigTab, string][] = [
  ["overview", "Overview"],
  ["li", "LinkedIn"],
  ["mail", "Email"],
  ["wa", "WhatsApp"],
  ["call", "Calls"],
  ["sms", "SMS"],
  ["variables", "Variables"],
  ["sending", "Sending rules"],
  ["compliance", "Compliance"],
];

/* ---------- rules ---------------------------------------------------------- */

export type ToggleRow = {
  id: string;
  label: string;
  hint?: string;
  on: boolean;
  /** A rule the product keeps on: shown with a padlock and no switch. */
  locked?: boolean;
};

export const LINKEDIN_ACCOUNT_RULES: ToggleRow[] = [
  {
    id: "warmup",
    label: "Warm up new accounts",
    hint: "Starts at 5 invites a day and adds 3 a day until it reaches the limit",
    on: true,
  },
  {
    id: "spread",
    label: "Spread leads across accounts",
    hint: "Each lead stays with one sender for the whole sequence",
    on: true,
  },
  { id: "skip-connected", label: "Skip the invite if already connected", on: true, locked: true },
  {
    id: "human",
    label: "Human-like timing",
    hint: "Random 2–7 minute gaps and no sends in exact bursts",
    on: true,
  },
  { id: "stop-reply", label: "Stop when the lead replies", on: true, locked: true },
];

export const LINKEDIN_NUMBER_RULES = [
  { id: "weekly", label: "Weekly invite ceiling per account", value: 100, max: 200, unit: "" },
  {
    id: "withdraw",
    label: "Withdraw pending invites after",
    hint: "Keeps your pending count low, which LinkedIn watches",
    value: 14,
    max: 60,
    unit: "days",
  },
];

/* ---------- sequences (LinkedIn, email) and call scripts ------------------ */


export const EMAIL_TRACKING: ToggleRow[] = [
  {
    id: "opens",
    label: "Track opens",
    hint: "Default for every connected domain. Apple Mail pre-loads images, so opens read high — judge by replies. Override per domain in Mailboxes & domains.",
    on: true,
  },
  {
    id: "clicks",
    label: "Track link clicks",
    hint: "Default for every connected domain. Override per domain in Mailboxes & domains.",
    on: true,
  },
  {
    id: "custom-domain",
    label: "Custom tracking domain",
    hint: "Links point to your domain, not a shared one",
    on: false,
  },
  {
    id: "plain-text",
    label: "Send as plain text",
    hint: "Best inbox placement for cold email; turns off open tracking",
    on: false,
  },
];

export const EMAIL_FOOTER: ToggleRow[] = [
  { id: "one-click", label: "One-click unsubscribe header", on: true, locked: true },
  { id: "optout-line", label: "Opt-out line", hint: "Added under the signature", on: true },
  {
    id: "postal",
    label: "Postal address",
    hint: "CAN-SPAM needs a physical address in commercial email",
    on: true,
  },
];

/* ---------- WhatsApp ------------------------------------------------------ */


/* ---------- Variables and snippets ---------------------------------------- */

export type Variable = {
  token: string;
  /** Which field on the lead it reads. */
  from: string;
  /** Text used when the lead has no value, or null for "blank if missing". */
  fallback: string | null;
  /** Channels it is available on; a single channel makes it channel-specific. */
  channels: ChannelKey[];
};

export const VARIABLES: Variable[] = [
  { token: "{first_name}", from: "First name", fallback: "there", channels: ["li", "mail", "wa", "call", "sms"] },
  { token: "{company}", from: "Company", fallback: "your team", channels: ["li", "mail", "wa", "call", "sms"] },
  { token: "{title}", from: "Job title", fallback: null, channels: ["li", "mail"] },
  { token: "{city}", from: "City", fallback: null, channels: ["li"] },
  { token: "{headline}", from: "LinkedIn headline", fallback: null, channels: ["li"] },
  {
    token: "{meeting_time}",
    from: "Next meeting time",
    fallback: null,
    channels: ["mail", "wa", "call", "sms"],
  },
  { token: "{renewal_date}", from: "CRM · Renewal date", fallback: "soon", channels: ["mail", "call"] },
  { token: "{event_name}", from: "Event attended", fallback: "the event", channels: ["mail", "wa"] },
];

/** Channels a variable can be scoped to, in the order the sub-tabs show them. */
export const VARIABLE_CHANNELS: ChannelKey[] = ["li", "mail", "wa", "call", "sms"];

/* ---------- Sending rules ------------------------------------------------- */

export const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SENDING_RULES = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  from: "09:00",
  to: "18:00",
  /** `lead` sends in each lead's own time zone; `workspace` in the workspace's. */
  timezone: "lead" as "lead" | "workspace",
  holidays: ["India", "US"],
  perDay: 1,
  perWeek: 4,
  cooloff: 90,
};

export const HOLIDAY_COUNTRIES = ["India", "US", "UK", "UAE", "Singapore"];

export const STOP_RULES: ToggleRow[] = [
  { id: "reply", label: "Lead replies on any channel", on: true, locked: true },
  { id: "unsub", label: "Lead unsubscribes or opts out", on: true, locked: true },
  { id: "meeting", label: "Meeting is booked", on: true },
  {
    id: "bounce",
    label: "Email hard-bounces",
    hint: "Other channels continue when off",
    on: true,
  },
  {
    id: "ooo",
    label: "Out-of-office reply",
    hint: "Pauses and resumes the day after the return date in the reply",
    on: true,
  },
  { id: "assign", label: "Assign positive replies to the lead owner", on: true },
];

export const AUDIENCE_RULES: ToggleRow[] = [
  {
    id: "skip-active",
    label: "Skip leads active in another campaign",
    hint: "Applied when you upload leads: anyone already in a journey in another campaign is left out and you are told how many",
    on: true,
    locked: true,
  },
  {
    id: "skip-customers",
    label: "Skip existing customers",
    hint: "Matched on email domain from your CRM",
    on: true,
  },
];

export const GUARDRAILS = {
  bounceRate: 3,
  spamComplaints: "0.1%",
  acceptance: 15,
  slowWhatsApp: true,
};

/* ---------- Compliance ---------------------------------------------------- */

export type ConsentBasis = {
  k: ChannelKey;
  /** The choices, when there is one to make; empty when the law decides. */
  options: string[];
  /** The fixed basis, when there is no choice. */
  fixed?: string;
  /** Index of the chosen option. */
  chosen?: number;
};

export const CONSENT: ConsentBasis[] = [
  { k: "mail", options: ["Legitimate interest (B2B)", "Explicit opt-in"], chosen: 0 },
  { k: "wa", options: [], fixed: "Opt-in required" },
  { k: "sms", options: [], fixed: "Opt-in required" },
  { k: "call", options: ["Business hours, honour DNC", "Opt-in required"], chosen: 0 },
];

export const REGIONAL_RULES: ToggleRow[] = [
  {
    id: "gdpr",
    label: "GDPR · EU & UK",
    hint: "Identity and opt-out line in first touch; erase data within 30 days on request",
    on: true,
  },
  {
    id: "trai",
    label: "TRAI · India",
    hint: "DLT templates for SMS; no promotional calls or texts 9pm–9am",
    on: true,
  },
  {
    id: "tcpa",
    label: "TCPA · US",
    hint: "Opt-in for SMS; calls only 8am–9pm local; honour the national DNC",
    on: true,
  },
  {
    id: "canspam",
    label: "CAN-SPAM · US email",
    hint: "Postal address and working unsubscribe in every email",
    on: true,
  },
];

export const RETENTION_OPTIONS = ["12 months", "24 months", "36 months", "Never"];

/* ---------- defaults for the real settings store --------------------------- */

/**
 * What a workspace reads from `/api/settings` before it has ever saved anything (and what
 * `MemoryRepository` seeds). Single source of truth: built from the same tables the UI shows, so
 * the starting values the Configuration screen displays and the row a save merges into never
 * drift apart.
 */
export function defaultWorkspaceSettings(): WorkspaceSettings {
  return {
    variableFallbacks: Object.fromEntries(VARIABLES.map((v) => [v.token, v.fallback])),
    sendingRules: {
      days: [...SENDING_RULES.days],
      from: SENDING_RULES.from,
      to: SENDING_RULES.to,
      timezone: SENDING_RULES.timezone,
      holidays: [...SENDING_RULES.holidays],
      limitOn: true,
      perDay: SENDING_RULES.perDay,
      perWeek: SENDING_RULES.perWeek,
      cooloff: SENDING_RULES.cooloff,
      stops: Object.fromEntries(STOP_RULES.map((r) => [r.id, r.on])),
      audience: Object.fromEntries(AUDIENCE_RULES.map((r) => [r.id, r.on])),
      bounceRate: GUARDRAILS.bounceRate,
      acceptance: GUARDRAILS.acceptance,
      slowWhatsApp: GUARDRAILS.slowWhatsApp,
    },
    compliance: {
      domains: [],
      consent: Object.fromEntries(CONSENT.map((c) => [c.k, c.chosen ?? 0])),
      regional: Object.fromEntries(REGIONAL_RULES.map((r) => [r.id, r.on])),
      retention: RETENTION_OPTIONS[1],
    },
  };
}

