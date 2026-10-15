/**
 * What the product can actually do today, in one place.
 *
 * There is no sending engine yet: no LinkedIn or email connection, no scheduler. A campaign can be
 * built, saved and previewed, but nothing is sent. Marking one "live" would claim otherwise, so the
 * UI gates every path to "live" on this flag (the builder's Launch, the Campaigns switch, the
 * campaign editor's status list). Pausing is always allowed — stopping is never a false claim.
 *
 * Flip it to `true` in the commit that lands the sender, and nowhere else.
 */
export const SENDING_ENABLED = false;

export const SENDING_OFF_NOTE =
  "Sending isn't connected yet. You can build and save campaigns and workflows; nothing is sent until LinkedIn and email are connected.";
