/**
 * The seam between the product and whoever actually drives LinkedIn.
 *
 * Driving LinkedIn means holding a member session and replaying actions against LinkedIn's own
 * internal endpoints. We rent that (Unipile today) rather than build it, and every call goes
 * through this interface so the vendor can be replaced — by a competitor, or by our own
 * session-custody service — without touching a route, a screen or the database.
 *
 * Nothing here sends anything: `SENDING_ENABLED` in `lib/capabilities.ts` is still false. This
 * phase connects an account and reports its state truthfully; the send methods land with the
 * sender.
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
