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
