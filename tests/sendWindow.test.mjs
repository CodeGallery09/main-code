import test from "node:test";
import assert from "node:assert/strict";
import { insideWindow, localClock, minutesOf, nextOpening } from "../lib/engine/window.ts";

const weekdays = { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], from: "09:00", to: "18:00" };
// 2026-10-29 is a Thursday. 06:00 UTC is 11:30 in Kolkata.
const thursday = (hhmm) => new Date(`2026-10-29T${hhmm}:00Z`);

test("minutes are read only from HH:MM", () => {
  assert.equal(minutesOf("09:30"), 570);
  assert.equal(minutesOf("9:05"), 545);
  assert.equal(minutesOf("24:00"), null);
  assert.equal(minutesOf("nope"), null);
});

test("the clock is read in the member's own zone", () => {
  assert.deepEqual(localClock(thursday("06:00"), "Asia/Kolkata"), { day: 4, minutes: 11 * 60 + 30 });
  assert.deepEqual(localClock(thursday("06:00"), "UTC"), { day: 4, minutes: 6 * 60 });
  // A zone nobody has falls back to UTC rather than throwing.
  assert.deepEqual(localClock(thursday("06:00"), "Mars/Olympus"), { day: 4, minutes: 6 * 60 });
});

test("inside the window on a working day, outside it at night and at the weekend", () => {
  assert.equal(insideWindow(thursday("06:00"), "Asia/Kolkata", weekdays), true);
  assert.equal(insideWindow(thursday("01:00"), "Asia/Kolkata", weekdays), false); // 06:30 local
  assert.equal(insideWindow(thursday("14:00"), "Asia/Kolkata", weekdays), false); // 19:30 local
  assert.equal(insideWindow(new Date("2026-10-31T06:00:00Z"), "Asia/Kolkata", weekdays), false); // Saturday
});

test("an unusable window never holds a step back", () => {
  assert.equal(insideWindow(thursday("23:00"), "UTC", { days: [], from: "09:00", to: "18:00" }), true);
  assert.equal(insideWindow(thursday("23:00"), "UTC", { days: ["Thu"], from: "18:00", to: "09:00" }), true);
});

test("the next opening is the next chosen day at the start hour", () => {
  const friEvening = new Date("2026-10-30T14:00:00Z"); // 19:30 Friday in Kolkata
  const opens = nextOpening(friEvening, "Asia/Kolkata", weekdays);
  assert.equal(insideWindow(opens, "Asia/Kolkata", weekdays), true);
  assert.deepEqual(localClock(opens, "Asia/Kolkata").day, 1); // Monday
  assert.equal(localClock(opens, "Asia/Kolkata").minutes, 9 * 60);
  // Already open: nothing moves.
  assert.equal(nextOpening(thursday("06:00"), "Asia/Kolkata", weekdays).getTime(), thursday("06:00").getTime());
});
