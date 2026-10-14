/**
 * The Configuration screen's content: everything a workspace sets up once so
 * campaigns can run — channel accounts and limits, reusable sequences and
 * templates, personalisation variables, sending rules and compliance.
 *
 * This is illustrative demo data, like the rest of `lib/app/`. Nothing here is
 * written anywhere: the screen holds its edits in component state for the
 * length of the visit, and says so. Figures (health scores, reply rates, read
 * rates) are sample numbers, not measurements.
 *
 * Only `lib/app/channels` is imported, so this can be read from a server
 * component, a client component or a test alike.
 */

import type { ChannelKey } from "@/lib/app/channels";

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

/** Tab label, and the issue count its badge shows. */
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

/* ---------- overview: the setup checks ------------------------------------ */

export type CheckTone = "bad" | "info" | "ok";

export type SetupCheck = {
  id: string;
  /** `bad` blocks sending or landing, `info` is worth knowing, `ok` has passed. */
  tone: CheckTone;
  title: string;
  detail: string;
  /** The button on the right; absent on a passing check. */
  action?: string;
  /** Where the button goes. */
  goes?: ConfigTab;
};

export const SETUP_CHECKS: SetupCheck[] = [
  {
    id: "li-accounts",
    tone: "bad",
    title: "LinkedIn accounts connected",
    detail: "Neha Sharma needs to log in again. Their steps are paused.",
    action: "Reconnect",
    goes: "li",
  },
  {
    id: "mail-dns",
    tone: "bad",
    title: "Email domains authenticated",
    detail: "getacme.io, acmehq.com missing DMARC · SPF/DKIM/DMARC. Mail from these lands in spam.",
    action: "Fix DNS",
    goes: "mail",
  },
  {
    id: "wa-templates",
    tone: "bad",
    title: "WhatsApp templates approved",
    detail: "followup_nudge was rejected by Meta.",
    action: "Review",
    goes: "wa",
  },
  {
    id: "sms-dlt",
    tone: "bad",
    title: "SMS sender registered (DLT)",
    detail: "DLT entity isn't verified yet. SMS to Indian numbers won't deliver.",
    action: "Verify",
    goes: "sms",
  },
  {
    id: "fallbacks",
    tone: "bad",
    title: "Fallbacks for personal fields",
    detail: "{title}, {city}, {headline} have no fallback. Leads without them see a blank.",
    action: "Add fallbacks",
    goes: "variables",
  },
  {
    id: "warmup",
    tone: "info",
    title: "Mailbox warm-up",
    detail: "sales@getacme.io is on day 9 of 14",
    action: "View",
    goes: "mail",
  },
  {
    id: "drafts",
    tone: "info",
    title: "Unpublished drafts",
    detail: "2 sequence or script drafts not live yet",
    action: "View",
    goes: "li",
  },
  {
    id: "window",
    tone: "ok",
    title: "Sending window set",
    detail: "Mon–Fri, 09:00–18:00 in each lead's own time zone.",
  },
  {
    id: "limits",
    tone: "ok",
    title: "Contact limit per lead",
    detail: "1 a day and 4 a week, counted across every campaign.",
  },
  {
    id: "dnc",
    tone: "ok",
    title: "Do-not-contact list in force",
    detail: "1,248 emails and numbers are never contacted on any channel.",
  },
];

export const PASSING_CHECKS = SETUP_CHECKS.filter((c) => c.tone === "ok").length;
export const BLOCKING_CHECKS = SETUP_CHECKS.filter((c) => c.tone === "bad").length;

/** The rail badge: everything that can stop a message sending or landing. */
export const CONFIG_ISSUES = BLOCKING_CHECKS;

/** Issue counts per tab, shown on the tab badges. */
export const TAB_ISSUES: Partial<Record<ConfigTab, number>> = {
  li: 1,
  mail: 1,
  wa: 1,
  sms: 1,
  variables: 1,
};

/* ---------- overview: the channel tiles ----------------------------------- */

export type ChannelTile = {
  k: ChannelKey;
  /** "1 issue", or "Ready" when nothing is wrong. */
  state: string;
  ok: boolean;
  lines: string[];
};

export const CHANNEL_TILES: ChannelTile[] = [
  { k: "li", state: "1 issue", ok: false, lines: ["2 accounts", "45 invites/day", "3 sequences"] },
  { k: "mail", state: "1 issue", ok: false, lines: ["3 mailboxes", "130 emails/day", "3 sequences"] },
  {
    k: "wa",
    state: "1 issue",
    ok: false,
    lines: ["Quality High", "640/1,000 today", "3 approved templates"],
  },
  { k: "call", state: "Ready", ok: true, lines: ["Recording on", "3 attempts max", "3 scripts"] },
  { k: "sms", state: "1 issue", ok: false, lines: ["Sender ACMEGR", "DLT pending", "2 templates"] },
];

export const CONTENT_SUMMARY: [string, string][] = [
  ["LinkedIn sequences", "2 live · 1 draft"],
  ["Email sequences", "3 live"],
  ["Call scripts", "2 live · 1 draft"],
  ["WhatsApp templates", "3 approved · 1 in review · 1 rejected"],
];

export const RULES_SUMMARY: [string, string][] = [
  ["Sending window", "Mon–Fri · 09:00–18:00 lead's time"],
  ["Contact limit per lead", "1/day · 4/week · all campaigns"],
  ["Stops on", "Reply · unsubscribe · meeting · bounce"],
  ["DND list", "1,248 contacts never contacted"],
];

/* ---------- LinkedIn ------------------------------------------------------ */

export type LinkedInSeat = {
  id: string;
  name: string;
  profile: string;
  /** `healthy` runs; `signed_out` has its steps paused until it reconnects. */
  state: "healthy" | "signed_out";
  connections: number;
  messages: number;
  visits: number;
  /** InMail credits left, or null when the seat cannot report them. */
  inmail: number | null;
  /**
   * Campaign ids (from `lib/app/campaigns`) this seat currently sends for.
   * A LinkedIn seat is shared: it can carry more than one campaign at once.
   */
  campaignIds: number[];
};

export const LINKEDIN_SEATS: LinkedInSeat[] = [
  {
    id: "aarav",
    name: "Aarav Kapoor",
    profile: "linkedin.com/in/aarav-kapoor",
    state: "healthy",
    connections: 25,
    messages: 60,
    visits: 80,
    inmail: 38,
    campaignIds: [1, 13],
  },
  {
    id: "neha",
    name: "Neha Sharma",
    profile: "linkedin.com/in/neha-sharma-growth",
    state: "signed_out",
    connections: 20,
    messages: 50,
    visits: 60,
    inmail: null,
    campaignIds: [3],
  },
];

/** The daily ceiling each slider is measured against. */
export const LINKEDIN_CAPS = { connections: 30, messages: 100, visits: 120 };

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

export type Sequence = {
  id: string;
  name: string;
  status: "live" | "draft";
  version: number;
  /** Step kinds in order, as the card's chain reads. */
  steps: string[];
  usedBy: string[];
  /** Reply rate for the live version, in percent; null for a draft. */
  rate: number | null;
  edited: string;
};

export const LINKEDIN_SEQUENCES: Sequence[] = [
  {
    id: "li-founder",
    name: "Founder outreach · warm note",
    status: "live",
    version: 3,
    steps: ["Profile visit", "Connection request", "Message", "Message"],
    usedBy: ["Net-new outbound", "Q1 founders"],
    rate: 9.4,
    edited: "2d ago",
  },
  {
    id: "li-event",
    name: "Event follow-up · SaaSBoomi",
    status: "live",
    version: 1,
    steps: ["Connection request", "Message"],
    usedBy: ["SaaSBoomi follow-up"],
    rate: 14.4,
    edited: "9d ago",
  },
  {
    id: "li-closed",
    name: "Closed-lost · soft check-in",
    status: "draft",
    version: 0,
    steps: ["Profile visit", "Message"],
    usedBy: [],
    rate: null,
    edited: "Today",
  },
];

export const EMAIL_SEQUENCES: Sequence[] = [
  {
    id: "mail-cold",
    name: "Cold intro · problem first",
    status: "live",
    version: 2,
    steps: ["New email", "Reply in thread", "New email"],
    usedBy: ["Net-new outbound", "Closed-lost re-engage"],
    rate: 3.7,
    edited: "5d ago",
  },
  {
    id: "mail-inbound",
    name: "Inbound demo follow-up",
    status: "live",
    version: 4,
    steps: ["New email", "Reply in thread"],
    usedBy: ["Inbound follow-up"],
    rate: 31.2,
    edited: "3d ago",
  },
  {
    id: "mail-webinar",
    name: "Webinar invite + reminders",
    status: "live",
    version: 1,
    steps: ["New email", "New email"],
    usedBy: ["Q4 webinar invite"],
    rate: 2.4,
    edited: "3d ago",
  },
];

export type CallScript = {
  id: string;
  name: string;
  status: "live" | "draft";
  version: number | null;
  usedBy: string[];
  /** Connect-to-meeting rate in percent; null for a draft that has never run. */
  rate: number | null;
  edited: string;
};

export const CALL_SCRIPTS: CallScript[] = [
  {
    id: "warm",
    name: "Warm lead · 20-min demo",
    status: "live",
    version: 2,
    usedBy: ["Net-new outbound", "Inbound follow-up"],
    rate: 18,
    edited: "4d ago",
  },
  {
    id: "renewal",
    name: "Renewal check-in",
    status: "live",
    version: 1,
    usedBy: ["Renewal check-ins"],
    rate: 9,
    edited: "3w ago",
  },
  {
    id: "noshow",
    name: "No-show recovery",
    status: "draft",
    version: null,
    usedBy: [],
    rate: null,
    edited: "Yesterday",
  },
];

/* ---------- email: domains, mailboxes, tracking --------------------------- */

export type SendingDomain = {
  host: string;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
};

export const SENDING_DOMAINS: SendingDomain[] = [
  { host: "acme.co", spf: true, dkim: true, dmarc: true },
  { host: "getacme.io", spf: true, dkim: true, dmarc: false },
  { host: "acmehq.com", spf: false, dkim: false, dmarc: false },
];

export const domainVerified = (d: SendingDomain) => d.spf && d.dkim && d.dmarc;

export type Mailbox = {
  address: string;
  provider: string;
  /** `warm` sends at its cap; `warming` is still building up. */
  state: "warm" | "warming";
  /** Day of the 14-day warm-up, when it is still warming. */
  warmDay?: number;
  health: number;
  cap: number;
  rotate: boolean;
  /**
   * The one campaign (from `lib/app/campaigns`) this mailbox sends for, or
   * null when it is unassigned. Unlike a LinkedIn seat, a mailbox is
   * exclusive to a single campaign at a time, so sending from the same
   * address never crosses two campaigns' reputations.
   */
  campaignId: number | null;
};

export const MAILBOXES: Mailbox[] = [
  {
    address: "aarav@acme.co",
    provider: "Google Workspace",
    state: "warm",
    health: 96,
    cap: 60,
    rotate: true,
    campaignId: 1,
  },
  {
    address: "neha@acme.co",
    provider: "Google Workspace",
    state: "warm",
    health: 91,
    cap: 50,
    rotate: true,
    campaignId: 2,
  },
  {
    address: "sales@getacme.io",
    provider: "Microsoft 365",
    state: "warming",
    warmDay: 9,
    health: 74,
    cap: 20,
    rotate: false,
    campaignId: null,
  },
];

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

export type WhatsAppTemplate = {
  name: string;
  body: string;
  status: "approved" | "review" | "rejected";
  category: "Marketing" | "Utility";
  language: string;
  /** Read rate in percent; null until it has been sent. */
  read: number | null;
  campaigns: number | null;
};

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    name: "intro_outreach",
    body: "Hi {{1}}, Aarav from Flightpath. We help teams like {{2}} run LinkedIn, email and WhatsApp outreach on one clock. Open to a quick look?",
    status: "approved",
    category: "Marketing",
    language: "English",
    read: 84,
    campaigns: 2,
  },
  {
    name: "demo_reminder",
    body: "Hi {{1}}, a reminder about your Flightpath demo today at {{2}}. Reply 1 to confirm or 2 to reschedule.",
    status: "approved",
    category: "Utility",
    language: "English",
    read: 91,
    campaigns: 1,
  },
  {
    name: "festive_offer_hi",
    body: "नमस्ते {{1}}! त्योहारी ऑफ़र: सालाना प्लान पर 25% छूट, 5 नवंबर तक।",
    status: "approved",
    category: "Marketing",
    language: "Hindi",
    read: 79,
    campaigns: 1,
  },
  {
    name: "event_recap",
    body: "Hi {{1}}, thanks for stopping by at {{2}}. Here are the slides and a 2-minute recap.",
    status: "review",
    category: "Marketing",
    language: "English",
    read: null,
    campaigns: null,
  },
  {
    name: "followup_nudge",
    body: "Promotional content isn't allowed in the Utility category. Resubmit it as Marketing.",
    status: "rejected",
    category: "Utility",
    language: "English",
    read: null,
    campaigns: null,
  },
];

export const WHATSAPP_NUMBER = {
  name: "Flightpath",
  verified: true,
  number: "+91 80 4567 1200",
  via: "WhatsApp Business API",
  quality: "High",
  started: 640,
  limit: 1000,
  nextTier: 10000,
};

export const WHATSAPP_RULES: ToggleRow[] = [
  { id: "wa-optin", label: "Opt-in required", on: true, locked: true },
  {
    id: "wa-window",
    label: "Free-form replies in the 24-hour window",
    hint: "After a lead replies, follow-ups can be normal messages for 24 hours; after that, only templates",
    on: true,
  },
  {
    id: "wa-handover",
    label: "Hand over to the inbox on reply",
    hint: "Automation stops and the reply shows up in Inbox for a person",
    on: true,
  },
  { id: "wa-autoreply", label: "Auto-reply outside working hours", on: false },
];

/* ---------- Calls --------------------------------------------------------- */

export const CALLER_IDS = ["+91 80 4567 1200", "+1 415 555 0100", "+44 20 7946 0100"];

export const CALL_DIALER: ToggleRow[] = [
  {
    id: "local-presence",
    label: "Local presence",
    hint: "Shows a number from the lead's country when you have one",
    on: true,
  },
];

export const CALL_RECORDING: ToggleRow[] = [
  { id: "record", label: "Record calls", on: true },
  {
    id: "consent",
    label: "Play a consent announcement",
    hint: "Required where both parties must agree to recording",
    on: true,
    locked: true,
  },
  {
    id: "voicemail",
    label: "Voicemail drop",
    hint: "One click leaves a pre-recorded message",
    on: true,
  },
];

export const VOICEMAILS = ["Short intro · 18s", "Event follow-up · 22s", "None"];

/** What a rep can pick after a call, and what the campaign then does. */
export const CALL_OUTCOMES: [string, string][] = [
  ["Meeting booked", "Stop campaign · log meeting"],
  ["Interested, call later", "Mark Hot · keep sequence"],
  ["Call back", "Create a call task at the chosen time"],
  ["No answer", "Retry in 2 days (max 3 tries)"],
  ["Voicemail left", "Send the voicemail follow-up email"],
  ["Wrong number", "Remove phone · continue on other channels"],
  ["Not interested", "Stop campaign · mark lost"],
  ["Do not call", "Add to workspace DND list"],
];

export const OUTCOME_ACTIONS = CALL_OUTCOMES.map(([, action]) => action);

/* ---------- SMS ----------------------------------------------------------- */

export type SmsTemplate = {
  name: string;
  body: string;
  status: "approved" | "review";
  /** DLT template id, or null when it has not been registered. */
  dlt: string | null;
  parts: number;
};

export const SMS_TEMPLATES: SmsTemplate[] = [
  {
    name: "Demo reminder",
    body: "Hi {first_name}, reminder: your Flightpath demo is tomorrow at {meeting_time}. Reply C to confirm. -ACMEGR",
    status: "approved",
    dlt: "1107169823451230011",
    parts: 1,
  },
  {
    name: "Flash sale",
    body: "{first_name}, 24h flash sale: 30% off annual plans. flightpath.app/flash Reply STOP to opt out -ACMEGR",
    status: "review",
    dlt: null,
    parts: 1,
  },
];

export const SMS_SENDER = {
  entityId: "1101234567890123456",
  entityVerified: false,
  header: "ACMEGR",
  us: { registered: true, number: "+1 415 555 0100" },
};

export const SMS_OPT_OUT_KEYWORDS = ["STOP", "UNSUBSCRIBE", "END"];

export const SMS_CONFIRMATION =
  "You're unsubscribed from Acme Growth. You won't get any more texts from us.";

export const SMS_QUIET_HOURS = { from: "21:00", until: "09:00" };

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

export type Snippet = { token: string; body: string };

export const SNIPPETS: Snippet[] = [
  { token: "{{signature}}", body: "Aarav Kapoor\nFounder, Flightpath · flightpath.app" },
  { token: "{{booking_link}}", body: "flightpath.app/aarav" },
  { token: "{{case_study}}", body: "flightpath.app/kitebox" },
  { token: "{{deck_link}}", body: "flightpath.app/deck" },
  { token: "{{webinar_link}}", body: "flightpath.app/webinar" },
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
  { id: "skip-active", label: "Skip leads active in another campaign", on: true },
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

export const DNC_COUNT = 1248;

export const SUPPRESSED_DOMAINS = ["rivalone.com", "competitor.io", "acme.co"];

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
