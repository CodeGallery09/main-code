import test from "node:test";
import assert from "node:assert/strict";
import {
  deltaPercent,
  matchesFacet,
  matchesText,
  normalise,
  paginate,
  rangeDays,
  sortBy,
  trendOf,
} from "../lib/data/query.ts";

test("text search ignores case and accents", () => {
  assert.equal(matchesText(["Tomás Silva", "Rivera Logistics"], "tomas"), true);
  assert.equal(matchesText(["Maya Reyes"], "REY"), true);
  assert.equal(matchesText(["Maya Reyes"], "kenji"), false);
});

test("an empty or missing search matches everything", () => {
  assert.equal(matchesText(["anything"], undefined), true);
  assert.equal(matchesText(["anything"], "   "), true);
});

test("normalise strips accents, case and surrounding space", () => {
  assert.equal(normalise("  Tomás  "), "tomas");
});

test("facets treat 'all' and undefined as no filter", () => {
  assert.equal(matchesFacet("live", "all"), true);
  assert.equal(matchesFacet("live", undefined), true);
  assert.equal(matchesFacet("live", "paused"), false);
  assert.equal(matchesFacet(null, "paused"), false);
});

test("sortBy orders numbers and strings in both directions", () => {
  const rows = [{ n: 2, s: "b" }, { n: 10, s: "a" }, { n: 5, s: "c" }];
  assert.deepEqual(sortBy(rows, (r) => r.n, "desc").map((r) => r.n), [10, 5, 2]);
  assert.deepEqual(sortBy(rows, (r) => r.s).map((r) => r.s), ["a", "b", "c"]);
});

test("sortBy does not mutate its input", () => {
  const rows = [{ n: 2 }, { n: 1 }];
  sortBy(rows, (r) => r.n);
  assert.deepEqual(rows.map((r) => r.n), [2, 1]);
});

test("paginate slices a page and reports totals", () => {
  const rows = Array.from({ length: 12 }, (_, i) => i);
  const page = paginate(rows, 2, 5);
  assert.deepEqual(page.items, [5, 6, 7, 8, 9]);
  assert.equal(page.total, 12);
  assert.equal(page.page, 2);
});

test("paginate clamps out-of-range pages and sizes", () => {
  const rows = Array.from({ length: 12 }, (_, i) => i);
  assert.equal(paginate(rows, 99, 5).page, 3);
  assert.equal(paginate(rows, 0, 5).page, 1);
  assert.equal(paginate(rows, 1, 9999).pageSize, 200);
  assert.deepEqual(paginate([], 1, 10).items, []);
});

test("deltaPercent returns null without a baseline", () => {
  assert.equal(deltaPercent(10, 0), null);
  assert.equal(deltaPercent(110, 100), 10);
  assert.equal(deltaPercent(90, 100), -10);
});

test("trendOf maps a delta to a direction", () => {
  assert.equal(trendOf(4), "up");
  assert.equal(trendOf(-4), "down");
  assert.equal(trendOf(null), "flat");
  assert.equal(trendOf(0), "flat");
});

test("rangeDays falls back to 30 for anything unknown", () => {
  assert.equal(rangeDays("7d"), 7);
  assert.equal(rangeDays("90d"), 90);
  assert.equal(rangeDays("nonsense"), 30);
  assert.equal(rangeDays(undefined), 30);
});
