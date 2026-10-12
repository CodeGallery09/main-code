"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Channel, Metric } from "@/lib/data/types";
import {
  LinkedInIcon,
  MailIcon,
  PhoneIcon,
  SmsIcon,
  WhatsAppIcon,
} from "@/components/app/icons";

/* ---------- formatting ----------------------------------------------------
   One place for number and date rendering, so every screen reads the same. */

export const fmtNumber = (value: number, decimals = 0) =>
  value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export function fmtMetric(metric: Pick<Metric, "value" | "format" | "decimals">) {
  const text = fmtNumber(metric.value, metric.decimals);
  return metric.format === "percent" ? `${text}%` : text;
}

export function fmtDelta(metric: Pick<Metric, "delta" | "deltaUnit">) {
  if (metric.delta === null) return null;
  const size = Math.abs(metric.delta).toFixed(1);
  return metric.deltaUnit === "points" ? `${size}pp` : `${size}%`;
}

/** Short relative time, e.g. "20m", "3h", "Yesterday". */
export function fmtAgo(iso: string, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Same as fmtAgo, but phrased for a column ("20m ago", "Yesterday"). */
export function fmtSince(iso: string, now = Date.now()) {
  const label = fmtAgo(iso, now);
  return /^(now|Yesterday)$/.test(label) || /[A-Za-z]{3}$/.test(label) ? label : `${label} ago`;
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/* ---------- channels ------------------------------------------------------ */

export const CHANNEL_LABEL: Record<Channel, string> = {
  linkedin: "LinkedIn",
  email: "Email",
  whatsapp: "WhatsApp",
  call: "Calls",
  sms: "SMS",
};

/** Channel dots stay neutral; only state (live, paused, score) carries colour. */
export const CHANNEL_DOT: Record<Channel, string> = {
  linkedin: "#0a0a0a",
  email: "#52525b",
  whatsapp: "#71717a",
  call: "#a1a1aa",
  sms: "#d4d4d8",
};

export function ChannelMark({ channel, className = "h-4 w-4" }: { channel: Channel; className?: string }) {
  const Icon =
    channel === "linkedin"
      ? LinkedInIcon
      : channel === "email"
        ? MailIcon
        : channel === "whatsapp"
          ? WhatsAppIcon
          : channel === "call"
            ? PhoneIcon
            : SmsIcon;
  return <Icon className={className} />;
}

export function ChannelDots({ channels }: { channels: Channel[] }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {channels.map((channel) => (
        <span
          key={channel}
          className="h-[7px] w-[7px] rounded-full"
          style={{ background: CHANNEL_DOT[channel] }}
        />
      ))}
    </span>
  );
}

/* ---------- segmented control --------------------------------------------- */

export type SegItem = { id: string; label: string; count?: number };

/**
 * iOS-style segmented control. The selected thumb is one element that slides, so switching
 * tabs animates; its position is measured from the real buttons to survive text wrapping.
 */
export function Segmented({
  items,
  value,
  onChange,
  label,
}: {
  items: SegItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 0, w: 0 });

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const measure = () => {
      const active = root.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active) return;
      setThumb({ x: active.offsetLeft - 3, w: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [value, items]);

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      className="segmented"
      style={{ "--seg-x": `${thumb.x}px`, "--seg-w": `${thumb.w}px` } as React.CSSProperties}
    >
      <span className="seg-thumb" aria-hidden="true" />
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count !== undefined && <span className="seg-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- switch -------------------------------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

/* ---------- sparkline ----------------------------------------------------- */

export function Sparkline({
  data,
  className = "h-8 w-full",
  strokeWidth = 1.6,
}: {
  data: number[];
  className?: string;
  strokeWidth?: number;
}) {
  if (data.length < 2) return <svg className={className} aria-hidden="true" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 26 - ((value - min) / span) * 22;
    return [x, y] as const;
  });
  const line = smoothPath(points);
  const area = `${line} L100,30 L0,30 Z`;
  return (
    <svg className={className} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill="currentColor" opacity="0.08" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Draws a rounded path through points using Catmull-Rom converted to cubic beziers, so series
 * read as a curve rather than a jagged polyline. Shared by the sparkline and the trend chart.
 */
export function smoothPath(points: readonly (readonly [number, number])[], tension = 0.85): string {
  if (points.length < 2) return "";
  const parts = [`M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;
    parts.push(
      `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`,
    );
  }
  return parts.join(" ");
}

/* ---------- metric tile --------------------------------------------------- */

export function MetricTile({ metric, index = 0 }: { metric: Metric; index?: number }) {
  const delta = fmtDelta(metric);
  const arrow = metric.trend === "up" ? "▲" : metric.trend === "down" ? "▼" : "–";
  return (
    <div
      className="lg lg-sheen lg-in r-lg p-4 sm:p-5"
      style={{ "--i": index } as React.CSSProperties}
    >
      <p className="thead">{metric.label}</p>
      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <span className="metric-value">{fmtMetric(metric)}</span>
        {delta && (
          <span className={`mb-1 whitespace-nowrap text-[12.5px] font-semibold delta-${metric.trend}`}>
            <span aria-hidden="true">{arrow}</span> {delta}
          </span>
        )}
      </div>
      <div className="mt-3 text-ink">
        <Sparkline data={metric.spark} className="h-7 w-full" />
      </div>
    </div>
  );
}

/* ---------- misc ---------------------------------------------------------- */

export function ScoreBadge({ score }: { score: number }) {
  return <span className={`score ${score >= 70 ? "score-high" : ""}`}>{score}</span>;
}

export function Avatar({ initials, className = "" }: { initials: string; className?: string }) {
  return (
    <span className={`avatar ${className}`} aria-hidden="true">
      {initials}
    </span>
  );
}

/** Every figure in this workspace is invented, so each screen says so once. */
export function DemoDataNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12px] text-muted ${className}`}>
      Illustrative demo data — not customer results.
    </p>
  );
}

/** Small helper for screens that fetch on mount. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let live = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    load()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error: Error) => live && setState({ data: null, error: error.message, loading: false }));
    return () => {
      live = false;
    };
    // The caller owns the dependency list; `load` is recreated on every render by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-[14px] bg-white/45"
          style={{ animation: "lg-pulse 1.4s ease-in-out infinite", animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="lg-thin r-md p-4 text-[13.5px] text-ink-2" role="alert">
      {message}
    </div>
  );
}
