"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clamp, damp, scrollProgress } from "./core";

/**
 * One rAF loop for the whole page.
 *
 * Every scroll- and pointer-driven primitive subscribes here instead of
 * starting its own loop, and each subscriber writes straight to the DOM —
 * React never re-renders per frame.
 */
type Frame = (now: number, dt: number) => void;

const subs = new Set<Frame>();
let raf = 0;
let last = 0;

function loop(now: number) {
  const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
  last = now;
  subs.forEach((fn) => fn(now, dt));
  raf = subs.size ? requestAnimationFrame(loop) : 0;
}

export function onFrame(fn: Frame): () => void {
  subs.add(fn);
  if (!raf) {
    last = 0;
    raf = requestAnimationFrame(loop);
  }
  return () => {
    subs.delete(fn);
    if (!subs.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}

/** `true` when the visitor has asked for reduced motion. Re-reads on change. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return reduced;
}

type InViewOptions = { rootMargin?: string; threshold?: number; once?: boolean };

/** Reports whether the referenced element has entered the viewport. */
export function useInViewRef<T extends Element>({
  rootMargin = "0px 0px -10% 0px",
  threshold = 0.2,
  once = true,
}: InViewOptions = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, threshold, once]);

  return { ref, inView };
}

/**
 * Calls `onProgress(0..1)` every frame the element is on screen, with the
 * element's progress through its scroll window. The callback writes to the
 * DOM itself; nothing re-renders.
 */
export function useScrollRange<T extends HTMLElement>(
  onProgress: (p: number) => void,
  { start = 1, end = 0, enabled = true }: { start?: number; end?: number; enabled?: boolean } = {},
) {
  const ref = useRef<T | null>(null);
  const cb = useRef(onProgress);
  cb.current = onProgress;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!enabled) {
      cb.current(1);
      return;
    }
    let visible = false;
    let last = -1;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(el);
    const stop = onFrame(() => {
      if (!visible) return;
      const r = el.getBoundingClientRect();
      const p = scrollProgress(r.top, r.height, window.innerHeight, start, end);
      if (Math.abs(p - last) < 0.0005) return;
      last = p;
      cb.current(p);
    });
    // One synchronous pass so the first paint is already correct.
    const r = el.getBoundingClientRect();
    cb.current(scrollProgress(r.top, r.height, window.innerHeight, start, end));
    return () => {
      io.disconnect();
      stop();
    };
  }, [start, end, enabled]);

  return ref;
}

export type Pointer = { x: number; y: number };

/**
 * Smoothed pointer position relative to the element's centre, in -1..1 on each
 * axis. `onMove` is called per frame while the pointer is near; the value eases
 * back to the centre when it leaves.
 */
export function usePointerParallax<T extends HTMLElement>(
  onMove: (p: Pointer) => void,
  { enabled = true, smoothing = 0.0015, scope = "self" }: { enabled?: boolean; smoothing?: number; scope?: "self" | "window" } = {},
) {
  const ref = useRef<T | null>(null);
  const cb = useRef(onMove);
  cb.current = onMove;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    const read = (e: PointerEvent) => {
      const r = (scope === "window" ? document.documentElement : el).getBoundingClientRect();
      const w = scope === "window" ? window.innerWidth : r.width;
      const h = scope === "window" ? window.innerHeight : r.height;
      const cx = scope === "window" ? w / 2 : r.left + r.width / 2;
      const cy = scope === "window" ? h / 2 : r.top + r.height / 2;
      target.x = clamp(((e.clientX - cx) / (w / 2)) as number, -1, 1);
      target.y = clamp(((e.clientY - cy) / (h / 2)) as number, -1, 1);
    };
    const leave = () => {
      target.x = 0;
      target.y = 0;
    };
    const host: HTMLElement | Window = scope === "window" ? window : el;
    host.addEventListener("pointermove", read as EventListener, { passive: true });
    host.addEventListener("pointerleave", leave as EventListener);
    const stop = onFrame((_now, dt) => {
      cur.x = damp(cur.x, target.x, smoothing, dt);
      cur.y = damp(cur.y, target.y, smoothing, dt);
      cb.current(cur);
    });
    return () => {
      host.removeEventListener("pointermove", read as EventListener);
      host.removeEventListener("pointerleave", leave as EventListener);
      stop();
    };
  }, [enabled, smoothing, scope]);

  return ref;
}

/** Sets a CSS custom property on an element without going through React. */
export function useCssVar<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const set = useCallback((name: string, value: string | number) => {
    ref.current?.style.setProperty(name, String(value));
  }, []);
  return { ref, set };
}
