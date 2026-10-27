"use client";

import { useId } from "react";
import { cn } from "@/lib/ws/utils";

/**
 * The two charts the workspace uses.
 *
 * They follow the same rule as everything else here: one near-black accent, a
 * hairline grid, no gradients and no second hue. Series are told apart by
 * position and label, never by colour alone, and every chart carries its
 * figures in text beside it.
 */

const GRID = "#e6e3dd";
const LINE = "#c9c5bc";

export function AreaChart({
  points,
  label,
  height = 180,
}: {
  points: { x: string; y: number }[];
  label: string;
  height?: number;
}) {
  const clip = useId();
  const w = 640;
  const h = height;
  const pad = { top: 12, right: 8, bottom: 20, left: 8 };
  if (points.length < 2) return <p className="py-8 text-center text-[12px] text-muted-foreground">Not enough data yet.</p>;

  const max = Math.max(...points.map((p) => p.y), 1);
  const stepX = (w - pad.left - pad.right) / (points.length - 1);
  const yOf = (v: number) => pad.top + (1 - v / max) * (h - pad.top - pad.bottom);
  const coords = points.map((p, i) => [pad.left + i * stepX, yOf(p.y)] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${h - pad.bottom} L${coords[0][0].toFixed(1)},${h - pad.bottom} Z`;

  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} className="block h-auto w-full" preserveAspectRatio="none">
      <defs>
        <clipPath id={clip}>
          <rect x={0} y={0} width={w} height={h} />
        </clipPath>
      </defs>
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={pad.left} x2={w - pad.right} y1={yOf(max * t)} y2={yOf(max * t)} stroke={GRID} strokeWidth={1} />
      ))}
      <path d={area} fill="var(--accent)" clipPath={`url(#${clip})`} />
      <path d={line} fill="none" stroke="var(--primary)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r={3} fill="var(--primary)" />
    </svg>
  );
}

export function BarRows({
  rows,
  label,
  className,
}: {
  rows: { name: string; value: number; note?: string }[];
  label: string;
  className?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul aria-label={label} className={cn("flex flex-col", className)}>
      {rows.map((row) => (
        <li key={row.name} className="flex items-center gap-[14px] border-b border-divider py-[8px] last:border-b-0">
          <span className="shrink-0 basis-[96px] text-[12px]">{row.name}</span>
          <span
            role="img"
            aria-label={`${row.name}: ${row.value}`}
            className="h-[6px] flex-1 overflow-hidden"
            style={{ background: GRID }}
          >
            <span className="block h-full bg-primary" style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <span className="shrink-0 basis-[120px] text-right font-mono text-[11.5px] text-body">
            {row.note ?? row.value.toLocaleString("en-IN")}
          </span>
        </li>
      ))}
    </ul>
  );
}

export { LINE };
