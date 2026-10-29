/**
 * How fast an account is allowed to act, so it does not get restricted.
 *
 * LinkedIn does not publish a limit; it watches behaviour. The three things that get an account
 * flagged are volume (too many invites in a day), rhythm (touches at a machine-regular interval,
 * or twenty of them inside a minute) and a cold start (an account that has never sent suddenly
 * sending its ceiling). This file answers all three, as pure arithmetic:
 *
 * - `warmupCap` ramps a newly connected account up to its ceiling over a fortnight.
 * - `paceGapMs` spreads whatever is left of today's allowance across whatever is left of the
 *   working day, so an account drips rather than bursts.
 * - `jittered` scatters each gap so the rhythm is not a metronome.
 *
 * Nothing here decides *whether* a touch may go out — the window and the caps do that. This only
 * decides *when*, and a touch that cannot go out today is re-queued for tomorrow, never dropped.
 *
 * Import-free and erasable, so `node --test` can load it directly (see CLAUDE.md).
 */

/** An account's working day. `zone` empty means "the workspace owner's zone". */
export type SendingHours = {
  /** Weekday short names, as the builder stores them: "Mon", "Tue", … */
  days: string[];
  /** "HH:MM", inclusive. */
  from: string;
  /** "HH:MM", exclusive. */
  to: string;
  /** IANA zone, or "" to follow the workspace owner. */
  zone: string;
};

/** A working day a person would recognise: weekday mornings and afternoons, nothing at night. */
export const DEFAULT_HOURS: SendingHours = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  from: "09:30",
  to: "17:30",
  zone: "",
};

/** Conservative ceilings for an account that has finished warming up. */
export const DEFAULT_CAPS = { connections: 20, messages: 40 };

/** How long an account takes to reach its full ceiling. */
export const WARMUP_DAYS = 14;

/** What a brand-new account may do on its first day, as a share of its ceiling. */
export const WARMUP_START = 0.2;

/** Never two touches inside this, whatever the arithmetic says. */
export const MIN_GAP_MS = 90_000;

/** How far each gap may be stretched or squeezed, as a share of itself. */
export const JITTER = 0.4;

/** Read an account's stored hours, filling anything missing from the default working day. */
export function readHours(stored: unknown): SendingHours {
  const raw = (stored ?? {}) as Partial<SendingHours>;
  const days = Array.isArray(raw.days) && raw.days.length ? raw.days.filter((d) => typeof d === "string") : null;
  return {
    days: days && days.length ? days : [...DEFAULT_HOURS.days],
    from: typeof raw.from === "string" && raw.from ? raw.from : DEFAULT_HOURS.from,
    to: typeof raw.to === "string" && raw.to ? raw.to : DEFAULT_HOURS.to,
    zone: typeof raw.zone === "string" ? raw.zone : "",
  };
}

/**
 * Today's ceiling for an account connected `ageDays` ago.
 *
 * A fresh account starts at a fifth of its ceiling and climbs to all of it over `WARMUP_DAYS`.
 * The floor of 2 exists so day one is still useful; the result never exceeds the configured cap,
 * so turning warm-up off is the only way to send more than the operator asked for.
 */
export function warmupCap(cap: number, ageDays: number): number {
  if (!Number.isFinite(cap) || cap <= 0) return 0;
  if (!Number.isFinite(ageDays) || ageDays >= WARMUP_DAYS) return Math.floor(cap);
  const share = WARMUP_START + (1 - WARMUP_START) * (Math.max(0, ageDays) / WARMUP_DAYS);
  return Math.max(Math.min(2, Math.floor(cap)), Math.min(Math.floor(cap), Math.round(cap * share)));
}

/**
 * The average gap that spreads `remaining` touches across the `minutesLeft` still in the window.
 *
 * Bunching an account's whole day into the first ten minutes is what gets it restricted, so the
 * allowance is drip-fed instead. With nothing left of the day, or nothing left to send, the gap is
 * the floor — the caller has already decided the touch waits for tomorrow.
 */
export function paceGapMs(remaining: number, minutesLeft: number): number {
  if (remaining <= 1 || minutesLeft <= 0) return MIN_GAP_MS;
  return Math.max(MIN_GAP_MS, Math.floor(((minutesLeft * 60_000) / remaining) * 0.9));
}

/** A gap scattered by up to `JITTER` either way, so the account's rhythm is not a metronome. */
export function jittered(gapMs: number, rand: () => number = Math.random): number {
  const spread = 1 + (rand() * 2 - 1) * JITTER;
  return Math.max(MIN_GAP_MS, Math.round(gapMs * spread));
}

/**
 * The earliest moment the next touch on this account may go out, from when it last sent.
 *
 * Never earlier than `now`: a long-idle account catches up immediately rather than owing itself
 * the gaps it did not use.
 */
export function nextTouchAt(input: {
  now: number;
  /** Epoch ms of this account's last real send, or null when it has not sent today. */
  lastSentAt: number | null;
  /** How much of today's allowance is left, this touch included. */
  remaining: number;
  /** Minutes still left in today's window. */
  minutesLeft: number;
  rand?: () => number;
}): number {
  if (input.lastSentAt === null) return input.now;
  const gap = jittered(paceGapMs(input.remaining, input.minutesLeft), input.rand ?? Math.random);
  return Math.max(input.now, input.lastSentAt + gap);
}
