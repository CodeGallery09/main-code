"use client";

import * as React from "react";
import { motion, useReducedMotion, type Transition } from "framer-motion";
import { cn } from "@/lib/ws/utils";

/**
 * Motion for the workspace.
 *
 * Three rules: transform and opacity only, under 220ms, and nothing that moves
 * more than a few pixels. `prefers-reduced-motion` turns every one of these
 * into a plain render — the CSS block in app/workspace.css covers anything
 * animated outside these helpers.
 */
export const EASE_OUT: Transition = { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] };

/** Shared-layout spring for the segmented thumb and tab underline. */
export const THUMB: Transition = { type: "spring", stiffness: 520, damping: 42, mass: 0.7 };

/** One section easing in. `index` staggers a column of them by 30ms each. */
export function Appear({
  children,
  index = 0,
  className,
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  const still = useReducedMotion();
  if (still) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...EASE_OUT, delay: Math.min(index, 6) * 0.03 }}
    >
      {children}
    </motion.div>
  );
}

/** Cross-fade a panel whose whole contents change — a filtered list, a thread. */
export function Swap({ children, keyed, className }: { children: React.ReactNode; keyed: string; className?: string }) {
  const still = useReducedMotion();
  if (still) return <div className={className}>{children}</div>;
  return (
    <motion.div key={keyed} className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={EASE_OUT}>
      {children}
    </motion.div>
  );
}

/** A row that eases in when it joins a list, and collapses when it leaves. */
export function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  const still = useReducedMotion();
  if (still) return <li className={className}>{children}</li>;
  return (
    <motion.li
      layout
      className={className}
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={EASE_OUT}
    >
      {children}
    </motion.li>
  );
}

/** A panel that opens in place — the composer, the add-a-touch picker. */
export function Expand({ children, className }: { children: React.ReactNode; className?: string }) {
  const still = useReducedMotion();
  if (still) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={cn("overflow-hidden", className)}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={EASE_OUT}
    >
      {children}
    </motion.div>
  );
}

export { motion, useReducedMotion };
