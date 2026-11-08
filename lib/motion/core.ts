/**
 * Pure maths behind the motion primitives.
 *
 * Import-free and written in erasable TypeScript on purpose, so `node --test`
 * can load it directly (see tests/motionCore.test.mjs) and so no primitive has
 * to pull React in to do arithmetic.
 */

export const clamp = (v: number, min = 0, max = 1): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Maps `v` from [inMin,inMax] onto [outMin,outMax], clamped at both ends. */
export function mapRange(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  return lerp(outMin, outMax, clamp((v - inMin) / (inMax - inMin)));
}

/**
 * Frame-rate independent approach, the standard replacement for `v += (t - v) * 0.1`:
 * `smoothing` is the fraction of the remaining distance left after one second.
 */
export function damp(current: number, target: number, smoothing: number, dt: number): number {
  return lerp(target, current, Math.pow(smoothing, dt));
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4);
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** The one easing curve the whole motion layer uses for entrances. */
export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Progress of an element through a scroll window, 0 before and 1 after.
 * `start`/`end` are fractions of the viewport height at which the element's
 * top edge begins and finishes the move (1 = bottom of the viewport).
 */
export function scrollProgress(
  rectTop: number,
  rectHeight: number,
  viewportHeight: number,
  start = 1,
  end = 0,
): number {
  const from = viewportHeight * start;
  const to = viewportHeight * end - rectHeight;
  if (from === to) return 1;
  return clamp((from - rectTop) / (from - to));
}

/** Splits text into words, keeping the trailing space with each word. */
export function splitWords(text: string): string[] {
  return text.split(/(\s+)/).filter((s) => s.length > 0);
}
