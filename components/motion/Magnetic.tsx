"use client";

import { useRef, type ReactNode } from "react";
import { damp } from "@/lib/motion/core";
import { onFrame, useReducedMotion } from "@/lib/motion/useMotion";
import { useEffect } from "react";

type Props = {
  children: ReactNode;
  /** How far the element is allowed to be pulled, in px. */
  strength?: number;
  /** How far outside its own box the pull starts to act, in px. */
  radius?: number;
  className?: string;
};

/**
 * Pulls its child a little towards the pointer and lets it spring back. Used on
 * the hero call to action and the section links — the small piece of physics
 * that makes a page feel hand-built rather than generated.
 */
export function Magnetic({ children, strength = 10, radius = 90, className = "" }: Props) {
  const reduced = useReducedMotion();
  const host = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || reduced) return;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };

    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const near = Math.abs(dx) < r.width / 2 + radius && Math.abs(dy) < r.height / 2 + radius;
      target.x = near ? (dx / (r.width / 2 + radius)) * strength : 0;
      target.y = near ? (dy / (r.height / 2 + radius)) * strength : 0;
    };
    const reset = () => {
      target.x = 0;
      target.y = 0;
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", reset);
    const stop = onFrame((_now, dt) => {
      cur.x = damp(cur.x, target.x, 0.0008, dt);
      cur.y = damp(cur.y, target.y, 0.0008, dt);
      el.style.transform =
        Math.abs(cur.x) < 0.05 && Math.abs(cur.y) < 0.05
          ? ""
          : `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)`;
    });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", reset);
      stop();
      el.style.transform = "";
    };
  }, [reduced, strength, radius]);

  return (
    <span ref={host} className={`mo-magnetic ${className}`}>
      {children}
    </span>
  );
}
