/**
 * The motion layer: a small set of reusable primitives the marketing pages
 * compose, so entrances, parallax and pointer physics behave the same way
 * everywhere and are tuned in one place.
 *
 * No animation library is involved — the primitives share one rAF loop
 * (lib/motion/useMotion.ts) and one stylesheet (app/motion.css), and every one
 * of them stands still under `prefers-reduced-motion`.
 */
export { Appear, Stagger, type AppearFrom } from "./Appear";
export { TextReveal } from "./TextReveal";
export { Parallax } from "./Parallax";
export { Magnetic } from "./Magnetic";
export { Marquee } from "./Marquee";
export { CountUp } from "./CountUp";
export { Orb } from "./Orb";
