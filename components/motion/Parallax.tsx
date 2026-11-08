"use client";

import type { ElementType, ReactNode } from "react";
import { useRef } from "react";
import { lerp } from "@/lib/motion/core";
import { useReducedMotion, useScrollRange } from "@/lib/motion/useMotion";

type Props = {
  children: ReactNode;
  as?: ElementType;
  /** Total travel in px across the whole scroll window. Negative moves up. */
  distance?: number;
  /** Scale at the start and end of the window. */
  scale?: [number, number];
  /** Opacity at the start and end of the window. */
  fade?: [number, number];
  className?: string;
};

/**
 * Scroll-driven transform. Writes `transform`/`opacity` straight to the node
 * from the shared frame loop, so nothing re-renders while you scroll, and does
 * nothing at all under `prefers-reduced-motion`.
 */
export function Parallax({ children, as: Tag = "div", distance = 60, scale, fade, className = "" }: Props) {
  const reduced = useReducedMotion();
  const node = useRef<HTMLElement | null>(null);

  const ref = useScrollRange<HTMLElement>(
    (p) => {
      const el = node.current;
      if (!el) return;
      const y = lerp(distance / 2, -distance / 2, p);
      const s = scale ? lerp(scale[0], scale[1], p) : 1;
      el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)${s === 1 ? "" : ` scale(${s.toFixed(4)})`}`;
      if (fade) el.style.opacity = lerp(fade[0], fade[1], p).toFixed(3);
    },
    { enabled: !reduced },
  );

  return (
    <Tag
      ref={(el: HTMLElement | null) => {
        node.current = el;
        ref.current = el;
      }}
      className={`mo-parallax ${className}`}
    >
      {children}
    </Tag>
  );
}
