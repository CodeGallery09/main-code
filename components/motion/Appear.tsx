"use client";

import type { CSSProperties, ElementType, ReactNode } from "react";
import { useInViewRef } from "@/lib/motion/useMotion";

export type AppearFrom = "up" | "down" | "left" | "right" | "scale" | "none";

type Props = {
  children: ReactNode;
  as?: ElementType;
  /** Direction the element travels in from. */
  from?: AppearFrom;
  /** Milliseconds after it enters the viewport. */
  delay?: number;
  duration?: number;
  /** Travel distance in px (ignored by `scale` and `none`). */
  distance?: number;
  once?: boolean;
  className?: string;
  id?: string;
};

/**
 * The entrance primitive: fades and travels in the first time it is scrolled
 * into view. Without JS the element renders in its final state, and the
 * reduced-motion block in app/motion.css removes the travel.
 */
export function Appear({
  children,
  as: Tag = "div",
  from = "up",
  delay = 0,
  duration = 720,
  distance = 22,
  once = true,
  className = "",
  id,
}: Props) {
  const { ref, inView } = useInViewRef<HTMLElement>({ once });
  return (
    <Tag
      ref={ref}
      id={id}
      className={`mo-appear ${inView ? "is-in" : ""} ${className}`}
      data-from={from}
      style={
        {
          "--mo-delay": `${delay}ms`,
          "--mo-duration": `${duration}ms`,
          "--mo-distance": `${distance}px`,
        } as CSSProperties
      }
    >
      {children}
    </Tag>
  );
}

/**
 * Staggers its children: each direct child becomes one `Appear` step, `step`
 * milliseconds after the one before it.
 */
export function Stagger({
  children,
  step = 80,
  delay = 0,
  from = "up",
  className = "",
  once = true,
}: {
  children: ReactNode[];
  step?: number;
  delay?: number;
  from?: AppearFrom;
  className?: string;
  once?: boolean;
}) {
  return (
    <>
      {children.map((child, i) => (
        <Appear key={i} from={from} delay={delay + i * step} className={className} once={once}>
          {child}
        </Appear>
      ))}
    </>
  );
}
