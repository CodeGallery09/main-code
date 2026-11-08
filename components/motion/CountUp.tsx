"use client";

import { useEffect, useRef } from "react";
import { clamp, easeOutQuart } from "@/lib/motion/core";
import { onFrame, useInViewRef, useReducedMotion } from "@/lib/motion/useMotion";

/**
 * Counts up to `to` the first time it is seen. The server renders the final
 * value, so the number is correct without JS and under reduced motion.
 */
export function CountUp({
  to,
  decimals = 0,
  suffix = "",
  prefix = "",
  duration = 1400,
  delay = 0,
  className = "",
}: {
  to: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const { ref, inView } = useInViewRef<HTMLSpanElement>({ threshold: 0.4 });
  const out = useRef<HTMLSpanElement | null>(null);
  const format = (v: number) =>
    prefix + v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;

  useEffect(() => {
    const el = out.current;
    if (!el || !inView || reduced) return;
    let t0 = 0;
    const stop = onFrame((now) => {
      if (!t0) t0 = now + delay;
      const k = easeOutQuart(clamp((now - t0) / duration));
      el.textContent = format(to * k);
      if (k >= 1) stop();
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduced, to, duration, delay]);

  return (
    <span ref={ref} className={className}>
      <span ref={out}>{format(to)}</span>
    </span>
  );
}
