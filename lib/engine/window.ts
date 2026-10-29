/**
 * When a step is allowed to go out.
 *
 * A plan carries a sending window — which weekdays, and between which hours — because outreach
 * that lands at 03:00 reads as a robot and gets the account restricted. The runner asks this file
 * whether now is inside the window; when it is not, the step is re-queued for the next opening
 * rather than sent late or dropped.
 *
 * The window is the member's local time, so every reading goes through their IANA zone. An
 * unknown zone falls back to UTC rather than throwing: a mistyped setting must not stop a plan.
 *
 * Import-free and erasable, so `node --test` can load it directly (see CLAUDE.md).
 */

export type SendWindow = {
  /** Weekday short names, as the builder stores them: "Mon", "Tue", … */
  days: string[];
  /** "HH:MM", inclusive. */
  from: string;
  /** "HH:MM", exclusive. */
  to: string;
};

const ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Minutes past midnight, or null when the value is not "HH:MM". */
export function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** The weekday index (0 = Sunday) and minutes past midnight, read in `zone`. */
export function localClock(at: Date, zone: string): { day: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone || "UTC",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
  } catch {
    // An unknown zone is a bad setting, not a reason to stop sending.
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
  }
  const of = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  // "24" is midnight in some locales' 24-hour output.
  const hour = Number(of("hour")) % 24;
  return { day: Math.max(0, ORDER.indexOf(of("weekday"))), minutes: hour * 60 + Number(of("minute")) };
}

/** True when `at` falls on a chosen day, inside the hours. An unusable window is always open. */
export function insideWindow(at: Date, zone: string, window: SendWindow): boolean {
  const from = minutesOf(window.from);
  const to = minutesOf(window.to);
  if (from === null || to === null || to <= from || !window.days?.length) return true;
  const { day, minutes } = localClock(at, zone);
  if (!window.days.includes(ORDER[day])) return false;
  return minutes >= from && minutes < to;
}

/**
 * The next moment the window is open, at or after `at`. Searched a day at a time for a fortnight;
 * a window no day satisfies gives `at` back, so a bad setting delays nothing.
 */
export function nextOpening(at: Date, zone: string, window: SendWindow): Date {
  if (insideWindow(at, zone, window)) return at;
  const from = minutesOf(window.from);
  if (from === null) return at;

  const { minutes } = localClock(at, zone);
  // Jump to this local day's opening time, then forward a day at a time until a chosen day lands.
  let candidate = new Date(at.getTime() + (from - minutes) * 60_000);
  if (candidate.getTime() <= at.getTime()) candidate = new Date(candidate.getTime() + 86_400_000);
  for (let step = 0; step < 14; step++) {
    if (insideWindow(candidate, zone, window)) return candidate;
    candidate = new Date(candidate.getTime() + 86_400_000);
  }
  return at;
}
