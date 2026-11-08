"use client";

import { useRef } from "react";
import { lerp } from "@/lib/motion/core";
import { usePointerParallax, useReducedMotion } from "@/lib/motion/useMotion";

/**
 * The room the object hangs in: a dark concrete chamber, a wedge of structure
 * overhead, a column at the right edge, a polished floor that catches the
 * object's light, and a figure standing on it to give the thing scale.
 *
 * Everything is CSS planes and one small silhouette — no photograph — so it
 * costs nothing to load and scales to any viewport. The planes drift against
 * each other with the pointer, which is what makes it read as depth rather
 * than as wallpaper.
 */
export function HeroChamber() {
  const reduced = useReducedMotion();
  const host = useRef<HTMLDivElement | null>(null);

  const ref = usePointerParallax<HTMLDivElement>(
    (p) => {
      const el = host.current;
      if (!el) return;
      el.style.setProperty("--ch-x", `${lerp(0, -16, (p.x + 1) / 2).toFixed(1)}px`);
      el.style.setProperty("--ch-y", `${lerp(0, -10, (p.y + 1) / 2).toFixed(1)}px`);
    },
    { enabled: !reduced, scope: "window", smoothing: 0.004 },
  );

  return (
    <div
      ref={(el) => {
        host.current = el;
        ref.current = el;
      }}
      className="chamber"
      aria-hidden="true"
    >
      <div className="chamber-wall" />
      <div className="chamber-glow" />
      <div className="chamber-wedge" />
      <div className="chamber-wedge chamber-wedge-2" />
      <div className="chamber-column" />
      <div className="chamber-floor">
        <div className="chamber-reflect" />
      </div>
      {/* A person, for scale. The object behind them is the size of a building. */}
      <svg className="chamber-figure" viewBox="0 0 24 64" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="6" r="4.4" />
        <path d="M12 11c-4 0-6.6 2.6-7 6.4L3.6 34c-.2 2 1 3 2.3 3h.8l.7 24a1.6 1.6 0 0 0 3.2 0l.9-17h.6l.9 17a1.6 1.6 0 0 0 3.2 0l.7-24h.8c1.3 0 2.5-1 2.3-3L19 17.4c-.4-3.8-3-6.4-7-6.4Z" />
      </svg>
      <div className="chamber-grain" />
    </div>
  );
}
