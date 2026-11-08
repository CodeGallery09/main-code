/**
 * The `events.kind` values written about a connected channel account.
 *
 * They live here, next to the store, because both halves need them: `lib/channels/inbound.ts`
 * writes them when a provider delivers something, and `PgRepository.accountActivity` counts them
 * for the Configuration screen. A string literal duplicated in two files is a reporting screen
 * that silently reads zero.
 *
 * Every one of these is written only when the provider actually told us something. There is no
 * synthetic or illustrative event in this set.
 *
 * Import-free and erasable.
 */
export const ACCOUNT_EVENT = {
  /** A hosted sign-in completed and an account row was created or repaired. */
  connected: "account_connected",
  /** The provider reported a new status for the account (signed out, restricted, healthy again). */
  status: "account_status",
  /** The provider delivered an inbound message on the account. */
  message: "account_message_in",
  /** The account was disconnected from the workspace. */
  disconnected: "account_disconnected",
} as const;

export type AccountEventKind = (typeof ACCOUNT_EVENT)[keyof typeof ACCOUNT_EVENT];

/**
 * The `events.kind` values for something a lead did, as a provider reported it. Each row carries
 * the lead in `audience_id` and the strategy they were in at the time in `strategy_id`.
 *
 * A plan's conditions are decided on these (plus `ACCOUNT_EVENT.message` for a reply), so a kind
 * written here and read under a different spelling is a condition that waits out every window and
 * takes No. Both sides import this one table.
 *
 * Import-free and erasable.
 */
export const LEAD_EVENT = {
  /** They are now a first-degree connection of the sending account: the invite was accepted. */
  accepted: "li_accepted",
  /** They opened an email we sent (a tracking pixel loaded — Apple Mail preloads these). */
  opened: "email_opened",
  /** They clicked a link in an email we sent. */
  clicked: "email_clicked",
  /** Their address bounced: a mail server said it could not deliver to them. */
  bounced: "email_bounced",
} as const;

/** Which condition each kind satisfies. A reply is `ACCOUNT_EVENT.message` that is not an auto-reply. */
export const SIGNAL_OF_KIND: Record<string, "accepted" | "replied" | "opened" | "clicked"> = {
  [LEAD_EVENT.accepted]: "accepted",
  [LEAD_EVENT.opened]: "opened",
  [LEAD_EVENT.clicked]: "clicked",
  [ACCOUNT_EVENT.message]: "replied",
};
