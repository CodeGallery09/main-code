"use client";

import * as React from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/ws/utils";

/* ---------- Avatar ---------- */

export function Initials({ text, size = 34, className }: { text: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[11px] font-medium text-body",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {text}
    </span>
  );
}

/* ---------- Meter ---------- */

/** 6px usage bar, square ends on purpose. The label is what a screen reader hears. */
export function Meter({ pct, label, className }: { pct: number; label: string; className?: string }) {
  return (
    <span role="img" aria-label={label} className={cn("block h-[6px] w-full overflow-hidden bg-border", className)}>
      <span
        className="block h-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </span>
  );
}

/* ---------- Switch ---------- */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
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
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-[22px] w-[38px] shrink-0 items-center rounded-full px-[3px] transition-colors duration-150 disabled:opacity-50",
        checked ? "justify-end bg-primary" : "justify-start bg-sunken",
      )}
    >
      <span className="size-[16px] rounded-full bg-white transition-transform duration-150" />
    </button>
  );
}

/* ---------- Select (native) ---------- */

export function NativeSelect({
  id,
  label,
  hideLabel,
  value,
  onChange,
  options,
  className,
  selectClassName,
  disabled,
}: {
  id: string;
  label: string;
  hideLabel?: boolean;
  value?: string;
  onChange?: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  selectClassName?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-[10px]", className)}>
      <label htmlFor={id} className={cn("label-mono", hideLabel && "sr-only")}>
        {label}
      </label>
      <span className="relative inline-flex min-w-0 items-center">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn(
            "h-[36px] w-full appearance-none truncate rounded-lg border border-input bg-card pl-[12px] pr-[34px] text-[12px] font-medium text-foreground disabled:opacity-50",
            selectClassName,
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-[11px] size-[15px] text-muted-foreground" />
      </span>
    </div>
  );
}

/* ---------- Search input ---------- */

export function SearchInput({
  id,
  placeholder,
  value,
  onChange,
  className,
}: {
  id: string;
  placeholder: string;
  value?: string;
  onChange?: (v: string) => void;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <Search aria-hidden className="pointer-events-none absolute left-[11px] size-[15px] text-muted-foreground" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="h-[36px] w-full rounded-lg border border-input bg-card pl-[34px] pr-[12px] text-[12px] placeholder:text-muted-foreground"
      />
    </span>
  );
}

/* ---------- Sparkline ---------- */

/** 72×26 grey line with a black end dot. Decorative: the value sits beside it. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 72;
  const h = 26;
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const flat = max === min;
  const points = values.map((v, i) => {
    const x = 2 + (i * (w - 4)) / (values.length - 1);
    const y = flat ? h / 2 : h - 3 - ((v - min) / (max - min)) * (h - 6);
    return [x, y] as const;
  });
  const last = points[points.length - 1];
  return (
    <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={cn("block shrink-0", className)} fill="none">
      <polyline
        points={points.map((p) => p.join(",")).join(" ")}
        stroke="#C9C5BC"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.4} fill="var(--primary)" />
    </svg>
  );
}

/* ---------- Metric tile ---------- */

export function MetricTile({
  label,
  value,
  footer,
  series,
  aside,
}: {
  label: string;
  value: string;
  footer: string;
  series?: number[];
  aside?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 pb-[10px] pt-3">
      <span className="label-mono">{label}</span>
      <div className="flex items-end justify-between gap-3">
        <span className="font-mono text-[24px] font-bold leading-none tracking-[-0.02em]">{value}</span>
        {series && series.length > 1 ? (
          <Sparkline values={series} />
        ) : aside ? (
          <span className="font-mono text-[11.5px] text-muted-foreground">{aside}</span>
        ) : null}
      </div>
      <span className="font-mono text-[11px] text-body">{footer}</span>
    </div>
  );
}

/* ---------- Empty state ---------- */

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("px-4 py-6 text-center text-[12px] text-muted-foreground", className)}>{children}</p>;
}

/* ---------- Tag ---------- */

export function Tag({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
  className?: string;
}) {
  const t = {
    neutral: "bg-muted text-body",
    success: "bg-success-bg text-success",
    warning: "bg-warning-bg text-warning",
    danger: "bg-destructive-bg text-destructive",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[4px] px-[6px] py-[2px] font-mono text-[9.5px] font-medium uppercase tracking-[0.06em]",
        t,
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Channel chip used in lists — mono uppercase on accent. */
export function ChannelChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[5px] bg-accent px-[7px] py-[3px] font-mono text-[10.5px] uppercase tracking-[0.05em] text-body">
      {children}
    </span>
  );
}

/* ---------- Loading and error ---------- */

/** Placeholder block that keeps a card's height while its data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-md bg-accent", className)} />;
}

/** What a card shows when its request failed. Always offers the retry. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-[10px] px-4 py-[34px] text-center">
      <p className="text-[12px] text-body">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="h-[30px] rounded-md border border-input bg-card px-[11px] text-[11.5px] font-medium hover:bg-accent"
      >
        Try again
      </button>
    </div>
  );
}
