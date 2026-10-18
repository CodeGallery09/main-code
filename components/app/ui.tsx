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
 * The sliding glass pill, and the only one in the workspace.
 *
 * Every selector that moves a raised white pill to the current choice — the
 * segmented controls and page tabs, the nav rail, the settings side tabs, the
 * mobile tab bar — renders this. The variant class only supplies the inset
 * (how far the pill is held off the track) and the corner radius; the material
 * itself comes from one `--thumb-bg` / `--thumb-sh` pair in `app.css`, so
 * re-tuning the pill anywhere re-tunes it everywhere.
 *
 * It is a sibling of the buttons rather than a background on the selected one,
 * which is what lets it travel: only its transform changes between selections,
 * so the browser animates one element instead of cross-fading two.
 *
 * It measures from its own parent rather than a ref passed down. React attaches
 * a parent's ref *after* its children's layout effects run, so a thumb handed
 * its track's ref measured nothing on the first pass and never appeared; its
 * own `parentElement` is already there.
 */
export function Thumb({
  selector = "button.on",
  deps,
  axis = "x",
  variant = "thumb",
  inset = 0,
}: {
  /** What to measure inside the track. */
  selector?: string;
  deps: unknown[];
  axis?: "x" | "y";
  /** Which inset/radius variant to wear: thumb | tabthumb | navthumb | vthumb. */
  variant?: "thumb" | "tabthumb" | "navthumb" | "vthumb";
  /** Pulls the pill back by the track's own padding. */
  inset?: number;
}) {
  const self = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ a: number; s: number } | null>(null);
  // The first measurement places the pill; it must not glide in from zero.
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const track = self.current?.parentElement;
    if (!track) return;
    let frame = 0;
    const measure = () => {
      const el = track.querySelector<HTMLElement>(selector);
      if (!el) return setBox(null);
      // Measured against the track's own box rather than `offsetTop`/`offsetLeft`:
      // some rows sit inside a positioned wrapper (the Leads dropdown), which
      // would otherwise be the offset parent and report zero.
      const a = el.getBoundingClientRect();
      const b = track.getBoundingClientRect();
      setBox(
        axis === "x"
          ? { a: a.left - b.left + track.scrollLeft, s: a.width }
          : { a: a.top - b.top + track.scrollTop, s: a.height },
      );
      frame = requestAnimationFrame(() => setReady(true));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Always mounted, so the pill glides between selections instead of
  // re-appearing; it is simply invisible until there is something to sit under.
  return (
    <span
      ref={self}
      className={variant}
      aria-hidden="true"
      style={
        box
          ? {
              ...(axis === "x"
                ? { transform: `translateX(${box.a - inset}px)`, width: box.s }
                : { transform: `translateY(${box.a - inset}px)`, height: box.s }),
              ...(ready ? null : { transition: "none" }),
            }
          : { opacity: 0 }
      }
    />
  );
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
  return (
    <div className={"seg" + (className ? " " + className : "")} role="tablist">
      <Thumb deps={[value, items.map((i) => i.join()).join()]} inset={3} />
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
  return (
    <nav className="setnav pane">
      <Thumb deps={[value]} axis="y" variant="vthumb" />
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
