"use client";

import { useRef } from "react";
import { lerp } from "@/lib/motion/core";
import { usePointerParallax, useReducedMotion, useScrollRange } from "@/lib/motion/useMotion";

/**
 * The hero's object: a large dark sphere wrapped in a creased membrane, with a
 * single bright point where the creases converge.
 *
 * Everything is greyscale by design — the whole look rests on how light falls
 * across the body, so a hue would flatten it. Three motions run at once:
 *
 *  - the membrane turns, two layers counter-rotating at different speeds
 *    (pure CSS keyframes, so no JS runs when nothing else is happening);
 *  - the pointer tips the whole object a few degrees and slides the rim light;
 *  - scroll drifts and scales it, which is what makes it read as an object in
 *    the room rather than a decal.
 *
 * Under `prefers-reduced-motion` the loops stop and the object sits still, lit
 * exactly as it is at rest.
 */

/** Deterministic PRNG so the server and the client draw the same membrane. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Core of the sphere, in the -100..100 view box: a little right and above centre. */
const CX = 16;
const CY = -6;

/** Creases running out from the core to the rim, like a sheet pulled onto a point. */
function creases(seed: number, count: number) {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + r() * 0.08;
    // Creases reach different distances and most stop short of the rim, so the
    // membrane reads as folded cloth rather than a wheel of spokes.
    const reach = 44 + Math.pow(r(), 0.7) * 92;
    // One control point off the straight line gives each crease its drape.
    const bow = (r() - 0.5) * 54;
    const ex = CX + Math.cos(a) * reach;
    const ey = CY + Math.sin(a) * reach;
    const mx = CX + Math.cos(a) * reach * 0.55 - Math.sin(a) * bow;
    const my = CY + Math.sin(a) * reach * 0.55 + Math.cos(a) * bow;
    return {
      d: `M ${CX} ${CY} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`,
      w: (0.2 + Math.pow(r(), 2) * 0.9).toFixed(2),
      o: (0.06 + Math.pow(r(), 1.6) * 0.46).toFixed(2),
    };
  });
}

const INNER = creases(20260211, 72);
const OUTER = creases(77010304, 38);

export function Orb({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const node = useRef<HTMLDivElement | null>(null);
  const tiltRef = useRef({ x: 0, y: 0 });
  const driftRef = useRef(0);

  const write = () => {
    const el = node.current;
    if (!el) return;
    const { x, y } = tiltRef.current;
    el.style.setProperty("--orb-rx", `${(-y * 7).toFixed(2)}deg`);
    el.style.setProperty("--orb-ry", `${(x * 9).toFixed(2)}deg`);
    el.style.setProperty("--orb-lx", `${(38 - x * 12).toFixed(1)}%`);
    el.style.setProperty("--orb-ly", `${(28 - y * 10).toFixed(1)}%`);
    el.style.setProperty("--orb-y", `${driftRef.current.toFixed(1)}px`);
  };

  const pointerRef = usePointerParallax<HTMLDivElement>(
    (p) => {
      tiltRef.current = p;
      write();
    },
    { enabled: !reduced, scope: "window" },
  );

  const scrollRef = useScrollRange<HTMLDivElement>(
    (p) => {
      driftRef.current = lerp(34, -56, p);
      node.current?.style.setProperty("--orb-scale", lerp(1.04, 0.92, p).toFixed(4));
      write();
    },
    { enabled: !reduced, start: 1.1, end: -0.35 },
  );

  return (
    <div
      ref={(el) => {
        node.current = el;
        pointerRef.current = el;
        scrollRef.current = el;
      }}
      className={`mo-orb ${className}`}
      aria-hidden="true"
    >
      <span className="mo-orb-halo" />
      <div className="mo-orb-tilt">
        <div className="mo-orb-body">
          <svg className="mo-orb-skin" viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice">
            <g className="mo-orb-spin">
              {INNER.map((c, i) => (
                <path key={i} d={c.d} fill="none" stroke="#f4f4f5" strokeWidth={c.w} opacity={c.o} strokeLinecap="round" />
              ))}
            </g>
            <g className="mo-orb-spin mo-orb-spin-back">
              {OUTER.map((c, i) => (
                <path key={i} d={c.d} fill="none" stroke="#d4d4d8" strokeWidth={c.w} opacity={Number(c.o) * 0.55} strokeLinecap="round" />
              ))}
            </g>
          </svg>
          <span className="mo-orb-shade" />
          <span className="mo-orb-rim" />
          <span className="mo-orb-core" />
        </div>
      </div>
      <svg className="mo-orb-ring" viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="97" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1 7" opacity="0.5" />
      </svg>
    </div>
  );
}
