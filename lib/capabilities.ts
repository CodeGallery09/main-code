/**
 * What the product can actually do today, in one place.
 *
 * **LinkedIn really sends.** A launched strategy enrols its audience and runs the plan: a LinkedIn
 * invite step sends a real connection request, a LinkedIn message step sends a real message, and a
 * call step becomes a to-do for a person. Everything is held to the workspace's own limits — the
 * lead's recorded consent, the account's daily caps, and the plan's sending window.
 *
 * **Nothing else sends.** Email, WhatsApp and SMS steps are written down as what they would have
 * sent, with the reason, because no mailbox or number can be connected yet. A workspace with no
 * healthy LinkedIn account behaves the same way: the plan runs and every touch says why it did not
 * go out, so a plan is never silently doing nothing.
 */
export const SENDING_ENABLED = true;

/** One line for a screen that is about to start, or has started, real outreach. */
export const LIVE_SEND_NOTE =
  "Launching sends real LinkedIn invites and messages from your connected account.";

/** Shown where a workspace cannot send yet, in place of the line above. */
export const SENDING_OFF_NOTE =
  "No LinkedIn account is connected, so a launched plan records what it would have sent instead of sending it.";

/** Channels that can genuinely be sent on today. Everything else is written down, not sent. */
export const SENDING_CHANNELS = ["linkedin"] as const;
