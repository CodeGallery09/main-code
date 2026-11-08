"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { clamp, easeOutCubic } from "@/lib/motion/core";
import { onFrame, useReducedMotion } from "@/lib/motion/useMotion";

type Props = {
  children: ReactNode;
  /** How far the section travels on the way in, in px. */
  rise?: number;
  /** How far it drifts on the way out, in px. */
  lift?: number;
  /** How far down it settles and how much it dims on the way out. */
  dim?: number;
  className?: string;
};

/**
 * The page's sense of flow: a section rises and settles as it comes into view,
 * then sinks and dims as it leaves, both driven straight from scroll position
 * rather than from a trigger. Because there is no threshold, scrolling back up
 * plays it backwards and stopping halfway leaves it halfway — which is what
 * makes the page feel continuous rather than a stack of triggered reveals.
 *
 * It writes transform and opacity to its own node from the shared frame loop,
 * so nothing re-renders. Under `prefers-reduced-motion` it does nothing at all.
 */
export function ScrollScene({ children, rise = 54, lift = 46, dim = 0.62, className = "" }: Props) {
  const reduced = useReducedMotion();
  const node = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = node.current;
    if (!el || reduced) return;
    let visible = false;
    let last = "";
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: "20% 0px" });
    io.observe(el);

    const write = () => {
      const vh = window.innerHeight;
      const r = el.getBoundingClientRect();
      // In: the top edge climbing from just below the fold.
      const enter = easeOutCubic(clamp((vh * 0.94 - r.top) / (vh * 0.46)));
      // Out: the bottom edge passing up through the top of the window.
      const exit = clamp((vh * 0.2 - r.bottom) / (vh * 0.45));
      const y = (1 - enter) * rise - exit * lift;
      const s = 0.982 + enter * 0.018 - exit * 0.022;
      const o = clamp(enter * 1.5) * (1 - exit * dim);
      const next = `translate3d(0,${y.toFixed(1)}px,0) scale(${s.toFixed(4)})`;
      if (next === last) return;
      last = next;
      el.style.transform = next;
      el.style.opacity = o.toFixed(3);
    };

    write();
    const stop = onFrame(() => { if (visible) write(); });
    return () => {
      io.disconnect();
      stop();
      el.style.transform = "";
      el.style.opacity = "";
    };
  }, [reduced, rise, lift, dim]);

  return (
    <div ref={node} className={`mo-scene ${className}`}>
      {children}
    </div>
  );
}
