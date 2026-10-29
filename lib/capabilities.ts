/**
 * What the product can actually do today, in one place.
 *
 * **Nothing is sent to anyone yet.** LinkedIn connects, but there is no send call behind it. What
 * does exist is the dry-run engine (`lib/engine/`): Launch enrols a strategy's audiences and runs
 * their plan, logging what each step *would* send and turning call steps into real to-dos, with
 * days compressed to minutes. A launched strategy is therefore "live" in the sense that its plan is
 * running, and every screen that shows it says "dry run" while this flag is false.
 *
 * Flip `SENDING_ENABLED` to `true` in the commit that lands the sender, and nowhere else.
 */
export const SENDING_ENABLED = false;

/** One line for any screen that shows a running strategy. */
export const DRY_RUN_NOTE = "Dry run: the plan runs and logs what it would send, but nobody is contacted.";

export const SENDING_OFF_NOTE =
  "Sending isn't connected yet. You can build and save strategies and workflows; nothing is sent until LinkedIn and email are connected.";
