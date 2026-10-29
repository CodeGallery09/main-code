import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HOURS,
  JITTER,
  MIN_GAP_MS,
  WARMUP_DAYS,
  jittered,
  nextTouchAt,
  paceGapMs,
  readHours,
  warmupCap,
} from "../lib/engine/pacing.ts";
import { minutesLeftInWindow, nextDayOpening } from "../lib/engine/window.ts";

test("a new account starts well under its ceiling and reaches it over a fortnight", () => {
  assert.equal(warmupCap(20, 0), 4);
  assert.ok(warmupCap(20, 7) > warmupCap(20, 0));
  assert.ok(warmupCap(20, 7) < 20);
  assert.equal(warmupCap(20, WARMUP_DAYS), 20);
  assert.equal(warmupCap(20, 400), 20);
});

test("warm-up never exceeds the configured cap, and never starves a small one", () => {
  assert.equal(warmupCap(3, 0), 2);
  assert.equal(warmupCap(1, 0), 1);
  assert.equal(warmupCap(0, 0), 0);
  for (let day = 0; day <= WARMUP_DAYS; day++) assert.ok(warmupCap(20, day) <= 20);
});

test("the gap spreads what is left across the day, and never drops below the floor", () => {
  // 10 touches left, 300 minutes left → roughly half an hour apart.
  const gap = paceGapMs(10, 300);
  assert.ok(gap > 20 * 60_000 && gap < 30 * 60_000, `gap was ${gap}`);
  assert.equal(paceGapMs(1, 300), MIN_GAP_MS);
  assert.equal(paceGapMs(50, 0), MIN_GAP_MS);
  // A busy day paces tighter than a quiet one.
  assert.ok(paceGapMs(40, 300) < paceGapMs(4, 300));
});

test("jitter stays inside its band and never goes under the floor", () => {
  const base = 10 * 60_000;
  for (const r of [0, 0.25, 0.5, 0.75, 1]) {
    const out = jittered(base, () => r);
    assert.ok(out >= MIN_GAP_MS);
    assert.ok(out <= base * (1 + JITTER) + 1, `${out} above the band`);
    assert.ok(out >= base * (1 - JITTER) - 1 || out === MIN_GAP_MS);
  }
  assert.notEqual(jittered(base, () => 0), jittered(base, () => 1));
});

test("the first touch of the day goes now; the next one waits out a gap", () => {
  const now = Date.UTC(2026, 0, 5, 10, 0);
  assert.equal(nextTouchAt({ now, lastSentAt: null, remaining: 20, minutesLeft: 400 }), now);

  const soon = nextTouchAt({ now, lastSentAt: now - 1000, remaining: 10, minutesLeft: 300, rand: () => 0.5 });
  assert.ok(soon > now, "a touch straight after another must wait");

  // An account that has been idle for hours catches up at once rather than owing itself the gaps.
  const idle = nextTouchAt({ now, lastSentAt: now - 5 * 3_600_000, remaining: 10, minutesLeft: 300, rand: () => 0.5 });
  assert.equal(idle, now);
});

test("stored hours fill their gaps from the default working day", () => {
  assert.deepEqual(readHours(null), { ...DEFAULT_HOURS, days: [...DEFAULT_HOURS.days] });
  assert.deepEqual(readHours({ days: [], from: "", to: "18:00", zone: "Asia/Kolkata" }), {
    days: [...DEFAULT_HOURS.days],
    from: DEFAULT_HOURS.from,
    to: "18:00",
    zone: "Asia/Kolkata",
  });
});

test("a spent day rolls to the next working morning, skipping the weekend", () => {
  const hours = { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], from: "09:30", to: "17:30" };
  // Friday 2026-01-02, 11:00 UTC.
  const friday = new Date(Date.UTC(2026, 0, 2, 11, 0));
  const next = nextDayOpening(friday, "UTC", hours);
  assert.equal(next.getUTCDay(), 1, "should land on a Monday");
  assert.ok(next.getTime() > friday.getTime());
  assert.equal(next.getUTCHours(), 9);
  assert.equal(next.getUTCMinutes(), 30);
});

test("minutes left run out at closing time", () => {
  const hours = { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], from: "09:30", to: "17:30" };
  const monday = new Date(Date.UTC(2026, 0, 5, 16, 30));
  assert.equal(minutesLeftInWindow(monday, "UTC", hours), 60);
  assert.equal(minutesLeftInWindow(new Date(Date.UTC(2026, 0, 5, 20, 0)), "UTC", hours), 0);
  assert.equal(minutesLeftInWindow(new Date(Date.UTC(2026, 0, 3, 11, 0)), "UTC", hours), 0);
});
