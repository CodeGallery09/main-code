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
