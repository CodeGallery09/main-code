/**
 * The integrations catalogue: what a workspace can connect, and the state of
 * each connection.
 *
 * LinkedIn and email are the channels the product actually runs today, so they
 * are the only ones that connect. WhatsApp Business, Twilio and the CRMs are on
 * the roadmap and say so — the UI never offers a connection the product cannot
 * honour. Everything here is illustrative demo data; a real build would read it
 * from the provider APIs.
 *
 * Import-free apart from the shared channel vocabulary, so it can be read from
 * server components, client components and tests alike.
 */

import type { ChannelKey } from "@/lib/app/channels";

export type ProviderState = "connected" | "attention" | "disconnected" | "planned";

export type ProviderKey =
  | "linkedin"
  | "email"
  | "waba"
  | "twilio"
  | "calendar"
  | "hubspot"
  | "salesforce"
  | "webhooks";

export type Provider = {
  k: ProviderKey;
  name: string;
  /** One line on what connecting it unlocks. */
  blurb: string;
  /** The channel it powers, when it powers one. */
  ch?: ChannelKey;
  state: ProviderState;
  /** Short status line under the name, e.g. "2 accounts · warming". */
  detail: string;
  /** What the primary button does in this state. */
  action: string;
  /** Category heading in the grid. */
  group: "Channels" | "Calendar" | "CRM" | "Developer";
  /** How the connection is made, shown in the drawer. */
  how: string;
  /** What Flightpath will and will not do with the connection. */
  scopes: string[];
};

export const STATE_TAG: Record<ProviderState, { label: string; tone: string }> = {
  connected: { label: "Connected", tone: "pos" },
  attention: { label: "Needs attention", tone: "hl" },
  disconnected: { label: "Not connected", tone: "" },
  planned: { label: "Planned", tone: "" },
};

export const PROVIDERS: Provider[] = [
  {
    k: "linkedin",
    name: "LinkedIn",
    blurb: "Send connection requests and messages from your team's own profiles.",
    ch: "li",
    state: "connected",
    detail: "1 seat connected · healthy",
    action: "Manage",
    group: "Channels",
    how: "Sign in once per seat. Flightpath sends at human pace from that profile and respects LinkedIn's own weekly invite limit.",
    scopes: [
      "Send invites and messages from the connected profile",
      "Read replies and acceptances for the inbox",
      "Never scrapes profiles or exports connections",
    ],
  },
  {
    k: "email",
    name: "Email",
    blurb: "Send from your own domains, with deliverability checks before the first send.",
    ch: "mail",
    state: "attention",
    detail: "2 domains verified · 1 pending DNS",
    action: "Manage",
    group: "Channels",
    how: "Add a sending domain, publish the three DNS records, then connect each mailbox over OAuth. New mailboxes warm up for two weeks before they carry full volume.",
    scopes: [
      "Send on behalf of connected mailboxes",
      "Read replies to threads Flightpath started",
      "Never reads the rest of the inbox",
    ],
  },
  {
    k: "waba",
    name: "WhatsApp Business",
    blurb: "Template messages and two-way chat through a WhatsApp Business account.",
    ch: "wa",
    state: "planned",
    detail: "On the roadmap",
    action: "Notify me",
    group: "Channels",
    how: "Will connect a Meta Business account and a registered sender number, with templates approved by Meta before use.",
    scopes: [
      "Send approved templates to opted-in contacts",
      "Receive replies inside the 24-hour service window",
    ],
  },
  {
    k: "twilio",
    name: "Twilio",
    blurb: "SMS sending and call tasks through your own Twilio project.",
    ch: "sms",
    state: "planned",
    detail: "On the roadmap",
    action: "Notify me",
    group: "Channels",
    how: "Will take an Account SID and an API key, then use your own numbers and messaging service so sending stays on your account.",
    scopes: ["Send SMS from your numbers", "Create call tasks for owners"],
  },
  {
    k: "calendar",
    name: "Calendar",
    blurb: "Put booked meetings straight on the owner's calendar.",
    state: "planned",
    detail: "On the roadmap",
    action: "Notify me",
    group: "Calendar",
    how: "Will connect Google or Microsoft calendars to read free/busy and write meetings Flightpath books.",
    scopes: ["Read free/busy", "Create meetings Flightpath books"],
  },
  {
    k: "hubspot",
    name: "HubSpot",
    blurb: "Two-way sync for contacts, owners and activity.",
    state: "planned",
    detail: "On the roadmap",
    action: "Notify me",
    group: "CRM",
    how: "Will sync contacts and log every touch as an activity, with field mapping you control.",
    scopes: ["Read and write contacts", "Log activity against the contact timeline"],
  },
  {
    k: "salesforce",
    name: "Salesforce",
    blurb: "Sync leads and contacts, and log activity against them.",
    state: "planned",
    detail: "On the roadmap",
    action: "Notify me",
    group: "CRM",
    how: "Will sync leads and contacts, with field mapping you control.",
    scopes: ["Read and write leads and contacts", "Log tasks and activity"],
  },
  {
    k: "webhooks",
    name: "Webhooks",
    blurb: "Post every reply, meeting and status change to your own endpoint.",
    state: "disconnected",
    detail: "No endpoint set",
    action: "Add endpoint",
    group: "Developer",
    how: "Give Flightpath an HTTPS endpoint. Each event is signed so you can verify it came from us, and failures retry with backoff.",
    scopes: ["Sends events out", "Never reads anything from your systems"],
  },
];

export const GROUPS: Provider["group"][] = ["Channels", "Calendar", "CRM", "Developer"];

/* ---------- LinkedIn seats ------------------------------------------------ */

export type LinkedInSeat = {
  name: string;
  headline: string;
  state: "healthy" | "warming" | "paused";
  invitesUsed: number;
  invitesCap: number;
  /** Weekly invite allowance LinkedIn itself enforces. */
  weekly: number;
};

export const LINKEDIN_SEATS: LinkedInSeat[] = [
  { name: "Aarav Kapoor", headline: "Founder · Acme Growth", state: "healthy", invitesUsed: 18, invitesCap: 25, weekly: 100 },
];

/* ---------- email domains and mailboxes ----------------------------------- */

export type DnsRecord = { type: "TXT" | "CNAME"; host: string; ok: boolean };

export type SendingDomain = {
  host: string;
  state: "verified" | "pending";
  records: DnsRecord[];
  mailboxes: { address: string; state: "sending" | "warming"; day: number; cap: number }[];
};

export const SENDING_DOMAINS: SendingDomain[] = [
  {
    host: "acme.co",
    state: "verified",
    records: [
      { type: "TXT", host: "@ (SPF)", ok: true },
      { type: "CNAME", host: "fp._domainkey (DKIM)", ok: true },
      { type: "TXT", host: "_dmarc (DMARC)", ok: true },
    ],
    mailboxes: [
      { address: "aarav@acme.co", state: "sending", day: 92, cap: 120 },
      { address: "sales@acme.co", state: "sending", day: 50, cap: 80 },
    ],
  },
  {
    host: "getacme.io",
    state: "verified",
    records: [
      { type: "TXT", host: "@ (SPF)", ok: true },
      { type: "CNAME", host: "fp._domainkey (DKIM)", ok: true },
      { type: "TXT", host: "_dmarc (DMARC)", ok: false },
    ],
    mailboxes: [{ address: "neha@getacme.io", state: "warming", day: 6, cap: 20 }],
  },
  {
    host: "acmehq.com",
    state: "pending",
    records: [
      { type: "TXT", host: "@ (SPF)", ok: false },
      { type: "CNAME", host: "fp._domainkey (DKIM)", ok: false },
      { type: "TXT", host: "_dmarc (DMARC)", ok: false },
    ],
    mailboxes: [],
  },
];

/**
 * Counts for the summary tiles. `connected` counts anything already wired up,
 * including a connection that needs attention, so it matches the Connected tab.
 */
export function integrationCounts() {
  const by = (s: ProviderState) => PROVIDERS.filter((p) => p.state === s).length;
  return {
    connected: by("connected") + by("attention"),
    attention: by("attention"),
    available: by("disconnected"),
    planned: by("planned"),
  };
}
