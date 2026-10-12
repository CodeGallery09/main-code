"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CHANNEL, type ChannelKey } from "@/lib/app/channels";
import { avatarTint, initials } from "@/lib/app/leads";

/* ---------- formatting ---------------------------------------------------- */

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** A rate, or an em dash when there is nothing to divide by. */
export const pct = (part: number, whole: number, digits = 1) =>
  whole ? `${((part / whole) * 100).toFixed(digits)}%` : "—";

/* ---------- primitives ---------------------------------------------------- */

/** Coloured dot standing in for a channel. */
export function Dot({ k, off }: { k: ChannelKey; off?: boolean }) {
  return <i className="cdot" style={{ background: off ? "var(--line-strong)" : CHANNEL[k].hex }} />;
}

export function Avatar({ name, size = "" }: { name: string; size?: string }) {
  const [tint, ink] = avatarTint(name);
  return (
    <span className={"av " + size} style={{ background: tint, color: ink }}>
      {initials(name)}
    </span>
  );
}

/** Up/down movement against the previous period. */
export function Delta({ v, pp, invert }: { v: number | null; pp?: boolean; invert?: boolean }) {
  if (v == null || !isFinite(v)) return <span className="delta flat">—</span>;
  const good = invert ? v < 0 : v > 0;
  const tone = Math.abs(v) < 0.05 ? "flat" : good ? "up" : "down";
  return (
    <span className={"delta " + tone}>
      {v >= 0 ? "▲" : "▼"} {Math.abs(v).toFixed(1)}
      {pp ? "pp" : "%"}
    </span>
  );
}

export function Switch({
  on,
  onChange,
  disabled,
  label,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={"sw" + (on ? " on" : "")}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!on);
      }}
    />
  );
}

export function Meter({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="meter">
      <i style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%`, background: color }} />
    </div>
  );
}

/**
 * Tracks the selected child so the segmented control can slide a thumb to it.
 * Measured after layout, and re-measured whenever the deps change.
 */
export function useThumb(
  ref: React.RefObject<HTMLElement | null>,
  selector: string,
  deps: unknown[],
  axis: "x" | "y" = "x",
) {
  const [box, setBox] = useState<{ a: number; s: number } | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el) return setBox(null);
      setBox(axis === "x" ? { a: el.offsetLeft, s: el.offsetWidth } : { a: el.offsetTop, s: el.offsetHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return box;
}

export type SegItem<T extends string> = [value: T, label: string, count?: number | null];

/** iOS-style segmented control with a glass thumb that slides to the selection. */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  className = "",
}: {
  value: T;
  onChange: (next: T) => void;
  items: SegItem<T>[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const thumb = useThumb(ref, "button.on", [value, items.map((i) => i.join()).join()]);
  return (
    <div className={"seg" + (className ? " " + className : "")} role="tablist" ref={ref}>
      {thumb && <span className="thumb" style={{ transform: `translateX(${thumb.a - 3}px)`, width: thumb.s }} />}
      {items.map(([v, label, count]) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          className={value === v ? "on" : ""}
          onClick={() => onChange(v)}
        >
          {label}
          {count != null && <span className="c">{count}</span>}
        </button>
      ))}
    </div>
  );
}

/** The same control at page-heading size. */
export function Tabs<T extends string>(props: Omit<Parameters<typeof Segmented<T>>[0], "className">) {
  return <Segmented {...props} className="tabs" />;
}

/** Vertical version used by Settings. */
export function SideTabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (next: T) => void;
  items: [T, string][];
}) {
  const ref = useRef<HTMLElement>(null);
  const thumb = useThumb(ref, "button.on", [value], "y");
  return (
    <nav className="setnav pane" ref={ref}>
      {thumb && <span className="vthumb" style={{ transform: `translateY(${thumb.a}px)`, height: thumb.s }} />}
      {items.map(([v, label]) => (
        <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </nav>
  );
}

/** Headline figure in a card. */
export function Kpi({ label, value, delta }: { label: string; value: string; delta?: React.ReactNode }) {
  return (
    <section className="card kpi">
      <span className="eyebrow">{label}</span>
      <span className="v">
        {value}
        {delta}
      </span>
    </section>
  );
}
