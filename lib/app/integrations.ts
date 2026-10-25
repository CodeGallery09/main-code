/**
 * The integrations catalogue: what a workspace can connect, and the state of
 * each connection.
 *
 * LinkedIn and email are the channels the product runs, so they are the only
 * ones that can connect. WhatsApp Business, Twilio, calendars, CRMs and webhooks
 * are on the roadmap and say so — the UI never offers a connection the product
 * cannot honour.
 *
 * This file is the static catalogue only. A provider's *state* (connected, needs
 * attention, not connected) is worked out from the workspace's own accounts and
 * domains by `providerView()`, so nothing here describes any particular
 * workspace. **LinkedIn can now actually connect**, through the hosted sign-in in
 * `lib/channels/` — but only where the deployment has a provider configured, which
 * `providerView()` takes as an argument rather than assuming. Connecting a mailbox
 * is still not built.
 *
 * Import-free apart from types, so it can be read from server components,
 * client components and tests alike.
 */

import type { ChannelKey } from "@/lib/app/channels";
import { linkedInNeedsAction, linkedInStateNote } from "@/lib/data/setup";
import type { AccountsSnapshot } from "@/lib/data/types";

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
  /** On the roadmap: shown as Planned, never offered as a connection. */
  planned: boolean;
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
    planned: false,
    name: "LinkedIn",
    blurb: "Send connection requests and messages from your team's own profiles.",
    ch: "li",
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
    planned: false,
    name: "Email",
    blurb: "Send from your own domains, with deliverability checks before the first send.",
    ch: "mail",
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
    planned: true,
    name: "WhatsApp Business",
    blurb: "Template messages and two-way chat through a WhatsApp Business account.",
    ch: "wa",
    group: "Channels",
    how: "Will connect a Meta Business account and a registered sender number, with templates approved by Meta before use.",
    scopes: [
      "Send approved templates to opted-in contacts",
      "Receive replies inside the 24-hour service window",
    ],
  },
  {
    k: "twilio",
    planned: true,
    name: "Twilio",
    blurb: "SMS sending and call tasks through your own Twilio project.",
    ch: "sms",
    group: "Channels",
    how: "Will take an Account SID and an API key, then use your own numbers and messaging service so sending stays on your account.",
    scopes: ["Send SMS from your numbers", "Create call tasks for owners"],
  },
  {
    k: "calendar",
    planned: true,
    name: "Calendar",
    blurb: "Put booked meetings straight on the owner's calendar.",
    group: "Calendar",
    how: "Will connect Google or Microsoft calendars to read free/busy and write meetings Flightpath books.",
    scopes: ["Read free/busy", "Create meetings Flightpath books"],
  },
  {
    k: "hubspot",
    planned: true,
    name: "HubSpot",
    blurb: "Two-way sync for contacts, owners and activity.",
    group: "CRM",
    how: "Will sync contacts and log every touch as an activity, with field mapping you control.",
    scopes: ["Read and write contacts", "Log activity against the contact timeline"],
  },
  {
    k: "salesforce",
    planned: true,
    name: "Salesforce",
    blurb: "Sync leads and contacts, and log activity against them.",
    group: "CRM",
    how: "Will sync leads and contacts, with field mapping you control.",
    scopes: ["Read and write leads and contacts", "Log tasks and activity"],
  },
  {
    k: "webhooks",
    planned: true,
    name: "Webhooks",
    blurb: "Post every reply, meeting and status change to your own endpoint.",
    group: "Developer",
    how: "Will take an HTTPS endpoint. Each event will be signed so you can verify it came from us, and failures will retry with backoff.",
    scopes: ["Sends events out", "Never reads anything from your systems"],
  },
];

export const GROUPS: Provider["group"][] = ["Channels", "Calendar", "CRM", "Developer"];

/* ---------- what each provider looks like for one workspace ---------------- */

export type ProviderView = {
  provider: Provider;
  state: ProviderState;
  /** Short status line under the name. */
  detail: string;
  /** The primary button: `null` when there is nothing to do (planned, or connecting isn't built). */
  action: string | null;
};

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The state of one provider, from the workspace's accounts. Connecting is not built yet, so a
 * provider with nothing connected has no action; one that is connected offers "Manage", which goes
 * to Configuration where its accounts and limits live.
 */
export function providerView(
  provider: Provider,
  snapshot: AccountsSnapshot,
  /** Whether this deployment has a LinkedIn provider configured. Unset means "no". */
  linkedInConfigured = false,
): ProviderView {
  if (provider.planned) {
    return { provider, state: "planned", detail: "On the roadmap", action: null };
  }

  if (provider.k === "linkedin") {
    const seats = snapshot.accounts.filter((a) => a.channel === "linkedin");
    // "Connect" is only offered where a sign-in can actually be opened. A button that 503s is a
    // worse answer than saying the deployment is not set up for it.
    const connect = linkedInConfigured ? "Connect" : null;
    if (!seats.length) {
      return {
        provider,
        state: "disconnected",
        detail: linkedInConfigured ? "No account connected" : "Not configured on this deployment",
        action: connect,
      };
    }
    const blocked = seats.filter((a) => linkedInNeedsAction(a.state));
    return {
      provider,
      state: blocked.length ? "attention" : "connected",
      detail: blocked.length
        ? `${count(seats.length, "account")} · ${blocked.length === 1 ? `${blocked[0].name}: ${linkedInStateNote(blocked[0].state)}` : `${blocked.length} need attention`}`
        : `${count(seats.length, "account")} connected · healthy`,
      action: "Manage",
    };
  }

  const boxes = snapshot.accounts.filter((a) => a.channel === "email");
  const pending = snapshot.domains.filter((d) => !(d.spf && d.dkim && d.dmarc)).length;
  if (!boxes.length && !snapshot.domains.length) {
    return { provider, state: "disconnected", detail: "No mailbox connected", action: null };
  }
  return {
    provider,
    state: pending ? "attention" : "connected",
    detail: pending
      ? `${count(snapshot.domains.length, "domain")} · ${pending} pending DNS`
      : `${count(boxes.length, "mailbox", "mailboxes")} · ${count(snapshot.domains.length, "domain")} verified`,
    action: "Manage",
  };
}

/**
 * Counts for the summary tiles. `connected` counts anything already wired up, including a
 * connection that needs attention, so it matches the Connected tab.
 */
export function integrationCounts(views: ProviderView[]) {
  const by = (s: ProviderState) => views.filter((v) => v.state === s).length;
  return {
    connected: by("connected") + by("attention"),
    attention: by("attention"),
    available: by("disconnected"),
    planned: by("planned"),
  };
}
