/**
 * The seam between the product and whoever actually drives LinkedIn.
 *
 * Driving LinkedIn means holding a member session and replaying actions against LinkedIn's own
 * internal endpoints. We rent that (Unipile today) rather than build it, and every call goes
 * through this interface so the vendor can be replaced — by a competitor, or by our own
 * session-custody service — without touching a route, a screen or the database.
 *
 * The send methods really do send: a LinkedIn invite or message posted through here reaches a real
 * person. Everything that calls them must have checked consent, the account's daily cap and the
 * strategy's sending window first — the adapter does none of that, it is the wire.
 */

import type { ProviderAccountStatus } from "./events";

/** A connected account as the provider describes it, in our vocabulary. */
export type ProviderAccount = {
  /** The provider's own id for the connection. Our side of the mapping is `provider_account_id`. */
  id: string;
  status: ProviderAccountStatus;
  /** The provider's own word for the first status that was not OK, or "" when everything was OK. */
  rawStatus: string;
  /** The member's display name, as the provider reports it. Empty when it reports none. */
  name: string;
  /** Profile URL or public identifier. Empty when the provider reports none. */
  handle: string;
  /** When the provider says the connection was made, ISO, or "" when it says nothing. */
  createdAt: string;
};

/** What we ask the provider to host a sign-in for. */
export type HostedAuthRequest = {
  /** `create` for a new connection, `reconnect` to repair an existing one. */
  kind: "create" | "reconnect";
  /**
   * Our own connect-session id. The provider echoes it back on the notify callback, and it is the
   * only thing that maps a provider account id to a workspace — so it must be unguessable and
   * must never be a workspace id.
   */
  reference: string;
  /** The provider account to repair. Required when `kind` is `reconnect`. */
  providerAccountId?: string;
  /** Where the provider sends the member's browser afterwards. */
  successUrl: string;
  failureUrl: string;
  /** Server-to-server callback carrying the new account id and our `reference`. */
  notifyUrl: string;
  /** Short — minutes, not days. A hosted link is a bearer token for connecting an account. */
  expiresAt: Date;
};

export type HostedAuthLink = {
  /** Open this in the member's browser. */
  url: string;
  expiresAt: string;
};

/** One role in a person's work history, as the provider reports it. */
export type ProviderRole = {
  title: string;
  company: string;
  /** Free text as the provider gives it ("2021 - Present"), or "" when it gives none. */
  period: string;
  location: string;
  description: string;
};

export type ProviderSchooling = {
  school: string;
  degree: string;
  field: string;
  period: string;
};

/** A person's profile on the provider, in our vocabulary. Only what a GTM person can act on. */
export type ProviderProfile = {
  /** The provider's internal id (`ACoAAA…`). An invite or a message needs this, not the public slug. */
  providerId: string;
  /** The slug in `linkedin.com/in/<slug>`, when the provider reports one. */
  publicIdentifier: string;
  name: string;
  headline: string;
  /** The "About" text. */
  summary: string;
  location: string;
  /** Current employer and job title, taken from the newest role when the provider names no current one. */
  company: string;
  title: string;
  profileUrl: string;
  /** 1 = a first-degree connection, 2 = second, and so on; 0 when the provider says nothing. */
  degree: number;
  followers: number | null;
  isPremium: boolean;
  isOpenToWork: boolean;
  isHiring: boolean;
  experience: ProviderRole[];
  education: ProviderSchooling[];
  skills: string[];
};

/** A message already on the provider, read back rather than pushed to us. */
export type ProviderMessage = {
  id: string;
  chatId: string;
  /** Provider id of whoever sent it. */
  senderId: string;
  senderName: string;
  text: string;
  /** ISO, or "" when the provider gave none. */
  sentAt: string;
  /** True when the connected account sent it, so it is our own outbound, not a reply. */
  fromMe: boolean;
};

export type ProviderChat = {
  id: string;
  /** Provider id of the person on the other side, when the provider names one. */
  attendeeId: string;
  name: string;
  unread: number;
  /** ISO, or "" when the provider gave none. */
  lastAt: string;
};

/** A webhook registered at the provider. */
export type ProviderWebhook = {
  id: string;
  /** Provider's own source/event key (`messaging`, `account_status`, …). */
  source: string;
  requestUrl: string;
};

export interface LinkedInChannelAdapter {
  /** Stored on the account row, so a workspace's accounts survive a vendor change. */
  readonly provider: string;

  /** A hosted sign-in link. The member's credentials never reach our servers. */
  createHostedAuth(request: HostedAuthRequest): Promise<HostedAuthLink>;

  /** The provider's current view of one connection; `null` when it no longer knows it. */
  getAccount(providerAccountId: string): Promise<ProviderAccount | null>;

  /** Disconnects at the provider. Idempotent: a connection already gone is not an error. */
  deleteAccount(providerAccountId: string): Promise<void>;

  /**
   * One person's profile. `identifier` is their public slug or their provider id; `accountId` is
   * the connected account doing the looking, because LinkedIn shows a profile through a member's
   * own session. `null` when the provider cannot see that profile.
   */
  getProfile(input: { accountId: string; identifier: string }): Promise<ProviderProfile | null>;

  /**
   * Sends a connection invitation. **This reaches a real person.** `message` is the note, which
   * LinkedIn caps at 300 characters; the caller is expected to have cut it already.
   */
  sendInvite(input: { accountId: string; providerId: string; message?: string }): Promise<{ invitationId: string }>;

  /** Sends a direct message, opening a chat if there is none. **This reaches a real person.** */
  sendMessage(input: { accountId: string; providerId: string; text: string }): Promise<{ chatId: string; messageId: string }>;

  /** Recent chats on one connected account, newest first. Used to pull replies in without a webhook. */
  listChats(input: { accountId: string; limit?: number }): Promise<ProviderChat[]>;

  /** The messages of one chat, newest first. */
  listMessages(input: { accountId: string; chatId: string; limit?: number }): Promise<ProviderMessage[]>;

  listWebhooks(): Promise<ProviderWebhook[]>;

  /** Registers a webhook. `secret` is sent back to us as a header on every delivery. */
  createWebhook(input: { source: string; requestUrl: string; secret: string }): Promise<ProviderWebhook>;
}

/** Thrown when the provider answers with something other than success. */
export class ProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
