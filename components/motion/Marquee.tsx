"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * A single line of text that drifts sideways forever. The content is rendered
 * twice so the loop has no seam; the copy is hidden from assistive tech.
 * Paused entirely under `prefers-reduced-motion` (see app/motion.css).
 */
export function Marquee({
  children,
  duration = 42,
  reverse = false,
  className = "",
}: {
  children: ReactNode;
  /** Seconds for one full pass. */
  duration?: number;
  reverse?: boolean;
  className?: string;
}) {
  return (
    <div className={`mo-marquee ${className}`} data-reverse={reverse ? "true" : undefined}>
      <div className="mo-marquee-track" style={{ "--mo-duration": `${duration}s` } as CSSProperties}>
        <span className="mo-marquee-part">{children}</span>
        <span className="mo-marquee-part" aria-hidden="true">
          {children}
        </span>
      </div>
    </div>
  );
}
