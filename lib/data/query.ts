/**
 * Pure query helpers shared by every repository implementation.
 *
 * A SQL-backed repository would push this work into the database, but keeping the rules here
 * means the in-memory store and any future store sort, filter and page identically — and it
 * makes the behaviour testable without a server. Import-free so `node --test` can load it.
 */

export type SortDir = "asc" | "desc";

/** Case- and accent-insensitive "does this row match what was typed" test. */
export function matchesText(haystack: string[], needle: string | undefined): boolean {
  if (!needle) return true;
  const q = normalise(needle);
  if (!q) return true;
  return haystack.some((value) => normalise(value).includes(q));
}

export function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Narrows by an exact field value, where the sentinel "all" (or undefined) means "don't filter". */
export function matchesFacet<T extends string>(value: T | null, selected: T | "all" | undefined): boolean {
  if (!selected || selected === "all") return true;
  return value === selected;
}

export function sortBy<T>(items: T[], pick: (item: T) => string | number, dir: SortDir = "asc"): T[] {
  const factor = dir === "desc" ? -1 : 1;
  return [...items].sort((a, b) => {
    const left = pick(a);
    const right = pick(b);
    if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
    return String(left).localeCompare(String(right), "en") * factor;
  });
}

/** Clamps a 1-based page window and returns the slice plus the totals a client needs. */
export function paginate<T>(items: T[], page = 1, pageSize = 25) {
  const size = Math.min(Math.max(Math.trunc(pageSize) || 25, 1), 200);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(Math.trunc(page) || 1, 1), pages);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), total: items.length, page: current, pageSize: size };
}

/** Period-over-period change. Returns null when there is no baseline to compare against. */
export function deltaPercent(current: number, previous: number): number | null {
  if (!previous) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function trendOf(delta: number | null): "up" | "down" | "flat" {
  if (delta === null || Math.abs(delta) < 0.05) return "flat";
  return delta > 0 ? "up" : "down";
}

/** Number of days a range key covers, used to slice the daily series. */
export function rangeDays(range: string | undefined): number {
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  return 30;
}

/* ---------------------------------------------------------------- windows -- */

/** `YYYY-MM-DD` in UTC — the grain of `daily_rollups.day`. */
export function dayOf(at: Date | number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** `days` back from `day`, inclusive of both ends, as `YYYY-MM-DD`. */
export function shiftDay(day: string, days: number): string {
  return dayOf(Date.parse(`${day}T00:00:00.000Z`) + days * 86_400_000);
}

/** Whole days from `from` to `to`, inclusive. 1 for a single day. */
export function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000) + 1;
}

/** True for a well-formed, real calendar date. `2026-02-31` is rejected. */
export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(at) && dayOf(at) === value;
}

/**
 * The window a request asked for, clamped to something a workspace can answer.
 *
 * A window is either a range key (the last N days ending today) or an explicit `from`/`to` pair
 * from the date picker. Explicit dates are clamped so a hand-written query cannot ask for a
 * thousand-day scan or a window that runs backwards; an unusable pair falls back to the range key.
 */
export const MAX_WINDOW_DAYS = 366;

export function resolveWindow(
  input: { range?: string | null; from?: string | null; to?: string | null },
  today = dayOf(Date.now()),
): { from: string; to: string } {
  if (isDay(input.from) && isDay(input.to)) {
    const to = input.to > today ? today : input.to;
    let from = input.from > to ? to : input.from;
    if (daysBetween(from, to) > MAX_WINDOW_DAYS) from = shiftDay(to, -(MAX_WINDOW_DAYS - 1));
    return { from, to };
  }
  return { from: shiftDay(today, -(rangeDays(input.range ?? undefined) - 1)), to: today };
}
