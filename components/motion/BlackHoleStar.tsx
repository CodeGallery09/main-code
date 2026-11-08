"use client";

import { useEffect, useRef } from "react";
import { clamp, lerp } from "@/lib/motion/core";
import { onFrame, usePointerParallax, useReducedMotion, useScrollRange } from "@/lib/motion/useMotion";

/**
 * MoM-BH*-1 — the JWST "black hole star" candidate: a black hole wrapped in a
 * star-sized envelope of hydrogen, which is why it reads as one dark body with
 * a single bright point rather than a bare accretion disc.
 *
 * Drawn to a canvas on the shared frame loop, in four passes:
 *
 *  1. the far side of the accretion disc, bent up over the top of the hole by
 *     its own gravity — the lensed arc that makes a black hole look like a halo;
 *  2. the event horizon, a hole punched in everything behind it, ringed by the
 *     photon sphere;
 *  3. the near side of the disc, passing in front of the horizon;
 *  4. the hydrogen envelope over all of it, so the disc is seen *through* the
 *     cocoon rather than in open space.
 *
 * Particles orbit at Keplerian speed (w ∝ r^-1.5), so the inner disc shears
 * past the outer — that differential is what sells it. Doppler beaming
 * brightens the limb turning toward the viewer.
 *
 * Greyscale throughout: temperature, not hue, carries the form.
 */

/** Radii as fractions of the drawing radius R. */
const R_HORIZON = 0.19;
const R_PHOTON = 0.225;
const R_DISC_IN = 0.28;
const R_DISC_OUT = 0.8;
/** Rings the disc is drawn from. Each is one stroke per half, not a cloud of points. */
const RINGS = 108;
/** Bright motes riding on top of the rings, for the grain real plasma has. */
const MOTES = 520;
/** How flat the disc is: 0 is edge-on, 1 is face-on. */
const TILT = 0.2;
/** Filaments in the hydrogen envelope wrapped around the whole thing. */
const FILAMENTS = 44;

type Ring = { r: number; w: number; ry: number; a0: number; amp: number; lift: number };
type Mote = { r: number; a: number; w: number; j: number; s: number };
type Filament = { a: number; reach: number; bow: number; o: number; w: number };

function seed(n: number) {
  let s = n >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function build() {
  const rnd = seed(0x9e3779b9);
  const rings: Ring[] = Array.from({ length: RINGS }, (_, i) => {
    const k = i / (RINGS - 1);
    // Packed toward the inside, where the disc is hottest and densest.
    const r = R_DISC_IN + Math.pow(k, 1.6) * (R_DISC_OUT - R_DISC_IN);
    return {
      r,
      // Keplerian: the inner disc shears past the outer, which is what sells it.
      w: Math.pow(R_DISC_IN / r, 1.5),
      ry: 1 + (rnd() - 0.5) * 0.16,
      a0: rnd() * Math.PI * 2,
      amp: 0.5 + rnd() * 0.5,
      // How far gravity throws this ring's far side up over the horizon.
      lift: 0.04 + (1 - k) * 0.1,
    };
  });
  const motes: Mote[] = Array.from({ length: MOTES }, () => {
    const r = R_DISC_IN + Math.pow(rnd(), 1.8) * (R_DISC_OUT - R_DISC_IN);
    return { r, a: rnd() * Math.PI * 2, w: Math.pow(R_DISC_IN / r, 1.5), j: (rnd() - 0.5) * 0.02, s: 0.3 + rnd() * 0.7 };
  });
  const filaments: Filament[] = Array.from({ length: FILAMENTS }, (_, i) => ({
    a: (i / FILAMENTS) * Math.PI * 2 + rnd() * 0.1,
    reach: 0.34 + Math.pow(rnd(), 0.8) * 0.5,
    bow: (rnd() - 0.5) * 0.7,
    o: 0.015 + Math.pow(rnd(), 2) * 0.075,
    w: 0.3 + Math.pow(rnd(), 2) * 0.9,
  }));
  return { rings, motes, filaments };
}

const WORLD = build();

export function BlackHoleStar({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const host = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const tilt = useRef({ x: 0, y: 0 });
  const drift = useRef(0);

  const pointerRef = usePointerParallax<HTMLDivElement>(
    (p) => {
      tilt.current = p;
      const el = host.current;
      if (!el) return;
      el.style.setProperty("--bh-rx", `${(-p.y * 6).toFixed(2)}deg`);
      el.style.setProperty("--bh-ry", `${(p.x * 8).toFixed(2)}deg`);
      el.style.setProperty("--bh-y", `${drift.current.toFixed(1)}px`);
    },
    { enabled: !reduced, scope: "window" },
  );

  const scrollRef = useScrollRange<HTMLDivElement>(
    (p) => {
      drift.current = lerp(26, -46, p);
      const el = host.current;
      if (!el) return;
      el.style.setProperty("--bh-y", `${drift.current.toFixed(1)}px`);
      el.style.setProperty("--bh-scale", lerp(1.03, 0.94, p).toFixed(4));
    },
    { enabled: !reduced, start: 1.1, end: -0.35 },
  );

  useEffect(() => {
    const cv = canvas.current;
    const el = host.current;
    if (!cv || !el) return;
    const ctx = cv.getContext("2d", { alpha: true });
    if (!ctx) return;

    const { rings, motes, filaments } = WORLD;
    let W = 0, H = 0, R = 0, dpr = 1;

    const resize = () => {
      const rect = el.getBoundingClientRect();
      if (!rect.width) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.round(rect.width);
      H = Math.round(rect.height);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      R = Math.min(W, H) / 2;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    /**
     * A horizontal gradient standing in for Doppler beaming: the limb turning
     * toward us is brighter, the one turning away is dimmer. One gradient per
     * stroke keeps this to a few hundred draws a frame instead of thousands.
     */
    const beamed = (cx: number, rr: number, a: number) => {
      const g = ctx.createLinearGradient(cx - rr, 0, cx + rr, 0);
      g.addColorStop(0, `rgba(255,255,255,${(a * 1.25).toFixed(4)})`);
      g.addColorStop(0.35, `rgba(238,238,246,${(a * 0.8).toFixed(4)})`);
      g.addColorStop(0.72, `rgba(206,206,220,${(a * 0.34).toFixed(4)})`);
      g.addColorStop(1, `rgba(176,176,194,${(a * 0.22).toFixed(4)})`);
      return g;
    };

    const draw = (t: number) => {
      if (!W) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H / 2;
      // The pointer tips the disc: flatter edge-on, opened up as it drops below.
      const tz = clamp(TILT + tilt.current.y * 0.1, 0.07, 0.42);

      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";

      // --- 1. the far side of the disc, bent up over the top of the hole ---
      // This arc is light from behind the black hole, lensed over it. It is the
      // halo that makes a black hole legible as one.
      for (const ring of rings) {
        const rr = ring.r * R;
        const ph = t * ring.w + ring.a0;
        const a = (0.05 + 0.1 * ring.amp) * (0.72 + 0.28 * Math.sin(ph * 0.7));
        ctx.strokeStyle = beamed(cx, rr, a);
        ctx.lineWidth = Math.max(0.6, R * 0.0075 * ring.amp);
        ctx.beginPath();
        ctx.ellipse(cx, cy - ring.lift * R, rr, rr * tz * ring.ry, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
      }

      // --- 2. the horizon: a hole punched in everything behind it ----------
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.arc(cx, cy, R * R_HORIZON, 0, Math.PI * 2);
      ctx.fillStyle = "#000";
      ctx.fill();

      // ...ringed by the photon sphere, the last orbit light can hold.
      ctx.globalCompositeOperation = "lighter";
      const ring = ctx.createRadialGradient(cx, cy, R * R_HORIZON * 0.97, cx, cy, R * R_PHOTON * 1.7);
      ring.addColorStop(0, "rgba(255,255,255,0)");
      ring.addColorStop(0.16, "rgba(255,255,255,0.95)");
      ring.addColorStop(0.3, "rgba(244,244,250,0.42)");
      ring.addColorStop(0.62, "rgba(214,214,228,0.1)");
      ring.addColorStop(1, "rgba(190,190,206,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, R * R_PHOTON * 1.7, 0, Math.PI * 2);
      ctx.fillStyle = ring;
      ctx.fill();

      // --- 3. the near side, crossing in front of the horizon --------------
      for (const ring of rings) {
        const rr = ring.r * R;
        const ph = t * ring.w + ring.a0;
        const a = (0.06 + 0.13 * ring.amp) * (0.72 + 0.28 * Math.sin(ph * 0.7 + 1.9));
        ctx.strokeStyle = beamed(cx, rr, a);
        ctx.lineWidth = Math.max(0.6, R * 0.0085 * ring.amp);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rr, rr * tz * ring.ry, 0, 0, Math.PI);
        ctx.stroke();
      }

      // --- 4. motes of plasma riding the rings -----------------------------
      for (const m of motes) {
        const a = m.a + t * m.w;
        const sin = Math.sin(a);
        const rr = m.r * R;
        const x = cx + Math.cos(a) * rr;
        const y = sin > 0 ? cy + sin * rr * tz : cy - Math.abs(sin) * rr * tz - R * 0.07;
        // Brightest on the approaching limb, on the left.
        const beam = 0.3 + 0.7 * (0.5 - Math.cos(a) * 0.5);
        const heat = 1 - (m.r - R_DISC_IN) / (R_DISC_OUT - R_DISC_IN);
        const g = clamp(m.s * beam * (0.3 + heat * 0.9), 0, 1);
        ctx.fillStyle = `rgba(255,255,255,${(g * 0.34).toFixed(3)})`;
        ctx.fillRect(x, y + m.j * R, 1.1, 1.1);
      }

      // --- 5. the hydrogen envelope the whole thing is wrapped in ----------
      // Filaments first: the drape of the cocoon, turning very slowly.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.012);
      for (const f of filaments) {
        const reach = f.reach * R;
        const ex = Math.cos(f.a) * reach;
        const ey = Math.sin(f.a) * reach;
        const mx = Math.cos(f.a) * reach * 0.55 - Math.sin(f.a) * f.bow * R * 0.3;
        const my = Math.sin(f.a) * reach * 0.55 + Math.cos(f.a) * f.bow * R * 0.3;
        ctx.strokeStyle = `rgba(226,226,238,${f.o.toFixed(3)})`;
        ctx.lineWidth = f.w;
        ctx.beginPath();
        ctx.moveTo(Math.cos(f.a) * R * R_PHOTON, Math.sin(f.a) * R * R_PHOTON);
        ctx.quadraticCurveTo(mx, my, ex, ey);
        ctx.stroke();
      }
      ctx.restore();

      // ...then the body of the envelope over everything, so the disc is seen
      // through it rather than in open space.
      const shell = ctx.createRadialGradient(cx, cy, R * 0.24, cx, cy, R);
      shell.addColorStop(0, "rgba(120,120,136,0)");
      shell.addColorStop(0.6, "rgba(96,96,112,0.09)");
      shell.addColorStop(0.88, "rgba(154,154,172,0.2)");
      shell.addColorStop(1, "rgba(16,16,20,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = shell;
      ctx.fill();
    };

    // At rest the object still has a pose; it simply does not turn.
    if (reduced) {
      const paint = () => draw(6.2);
      paint();
      const ro2 = new ResizeObserver(paint);
      ro2.observe(el);
      return () => {
        ro.disconnect();
        ro2.disconnect();
      };
    }

    let t = 0;
    const stop = onFrame((_now, dt) => {
      t += dt * 0.42;
      draw(t);
    });
    return () => {
      ro.disconnect();
      stop();
    };
  }, [reduced]);

  return (
    <div
      ref={(el) => {
        host.current = el;
        pointerRef.current = el;
        scrollRef.current = el;
      }}
      className={`bh ${className}`}
      aria-hidden="true"
    >
      <span className="bh-halo" />
      <div className="bh-tilt">
        {/* The cocoon is an opaque body, not a window: the room must not be
            visible through it, and the disc glows on top of it. */}
        <span className="bh-body" />
        <canvas ref={canvas} className="bh-canvas" />
        <span className="bh-shell" />
        <span className="bh-limb" />
      </div>
      <svg className="bh-ring" viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="97" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1 7" opacity="0.45" />
      </svg>
    </div>
  );
}
