import test from "node:test";
import assert from "node:assert/strict";
import { clamp, damp, easeOutCubic, lerp, mapRange, scrollProgress, splitWords } from "../lib/motion/core.ts";

test("clamp holds a value inside its bounds", () => {
  assert.equal(clamp(-2), 0);
  assert.equal(clamp(2), 1);
  assert.equal(clamp(5, 0, 10), 5);
});

test("mapRange is clamped at both ends", () => {
  assert.equal(mapRange(5, 0, 10, 0, 100), 50);
  assert.equal(mapRange(-5, 0, 10, 0, 100), 0);
  assert.equal(mapRange(50, 0, 10, 0, 100), 100);
  // A zero-width input range cannot divide, so it reports the start.
  assert.equal(mapRange(3, 2, 2, 7, 9), 7);
});

test("damp converges on the target and never overshoots", () => {
  let v = 0;
  for (let i = 0; i < 200; i++) v = damp(v, 1, 0.001, 1 / 60);
  assert.ok(v > 0.999 && v <= 1, `expected to settle on 1, got ${v}`);
});

test("damp is frame-rate independent", () => {
  let slow = 0;
  for (let i = 0; i < 30; i++) slow = damp(slow, 1, 0.001, 1 / 30);
  let fast = 0;
  for (let i = 0; i < 60; i++) fast = damp(fast, 1, 0.001, 1 / 60);
  assert.ok(Math.abs(slow - fast) < 1e-9, `${slow} vs ${fast}`);
});

test("easings start at 0 and finish at 1", () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(lerp(10, 20, 0.5), 15);
});

test("scrollProgress runs 0 below the fold to 1 once the element has passed", () => {
  const vh = 1000;
  // Element top still below the viewport: nothing has happened yet.
  assert.equal(scrollProgress(1200, 400, vh), 0);
  // Top at the bottom edge: the window is only just opening.
  assert.equal(scrollProgress(1000, 400, vh), 0);
  // Fully past the top: finished.
  assert.equal(scrollProgress(-600, 400, vh), 1);
  const mid = scrollProgress(300, 400, vh);
  assert.ok(mid > 0 && mid < 1, `expected a partial value, got ${mid}`);
});

test("splitWords keeps the gaps so a reveal can re-space the line", () => {
  assert.deepEqual(splitWords("on autopilot."), ["on", " ", "autopilot."]);
  assert.equal(splitWords("a  b").join(""), "a  b");
  assert.deepEqual(splitWords(""), []);
});
