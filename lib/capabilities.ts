/**
 * What the product can actually do today, in one place.
 *
 * **LinkedIn and email really send.** A launched strategy enrols its audience and runs the plan: a
 * LinkedIn invite step sends a real connection request, a LinkedIn message step sends a real
 * message, an email step sends a real email from a connected mailbox (Gmail, Outlook or IMAP,
 * through the same provider), and a call step becomes a to-do for a person. Everything is held to
 * the workspace's own limits — the lead's recorded consent, each account's daily cap and warm-up,
 * and each account's working hours.
 *
 * **Nothing else sends.** WhatsApp and SMS steps are written down as what they would have sent,
 * with the reason, because no number can be connected yet. A workspace with no healthy account for
 * a channel behaves the same way on that channel: the plan runs and every touch says why it did not
 * go out, so a plan is never silently doing nothing.
 */
export const SENDING_ENABLED = true;

/** One line for a screen that is about to start, or has started, real outreach. */
export const LIVE_SEND_NOTE =
  "Launching sends real LinkedIn invites, messages and emails from your connected accounts.";

/** Shown where a workspace cannot send yet, in place of the line above. */
export const SENDING_OFF_NOTE =
  "No LinkedIn account or mailbox is connected, so a launched plan records what it would have sent instead of sending it.";

/** Channels that can genuinely be sent on today. Everything else is written down, not sent. */
export const SENDING_CHANNELS = ["linkedin", "email"] as const;
