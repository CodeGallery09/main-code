"use client";

import { useState } from "react";

/**
 * Small SVG chart set for the workspace. Everything is drawn straight to paths —
 * no chart library — so the marks inherit the app's type and colour tokens.
 */

/**
 * Smooth path through points that never overshoots them (a monotone cubic, after Fritsch and
 * Carlson). A plain Catmull-Rom spline swings below zero beside a spike in sparse count data, which
 * draws a dip that is not in the numbers.
 */
function smooth(points: [number, number][]) {
  const n = points.length;
  if (n < 2) return "";
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1][0] - points[i][0];
    m[i] = dx[i] === 0 ? 0 : (points[i + 1][1] - points[i][1]) / dx[i];
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const r = a * a + b * b;
    if (r > 9) {
      const tau = 3 / Math.sqrt(r);
      t[i] = tau * a * m[i];
      t[i + 1] = tau * b * m[i];
    }
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    d += `C${x0 + dx[i] / 3},${y0 + (t[i] * dx[i]) / 3} ${x1 - dx[i] / 3},${y1 - (t[i + 1] * dx[i]) / 3} ${x1},${y1}`;
  }
  return d;
}

/** Thumbnail trend line for a KPI card. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points: [number, number][] = values.map((v, i) => [
    (i / (values.length - 1)) * 200,
    31 - ((v - min) / span) * 28,
  ]);
  const last = points[points.length - 1];

  return (
    <div className="spark">
      <svg
        viewBox="0 0 200 34"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ width: "100%", height: 34, display: "block", overflow: "visible" }}
      >
        <polyline
          points={points.map((p) => p.join(",")).join(" ")}
          fill="none"
          stroke="var(--ink-2)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={last[0]} cy={last[1]} r="3" fill="var(--ink-2)" />
      </svg>
    </div>
  );
}

export type Series = { key: string; label: string; color: string; fill: string; values: number[] };

/** A readable gridline step: the smallest 1/2/2.5/5 x 10^n that clears max/divisions. */
function axisStep(max: number, divisions: number) {
  if (max <= 0) return 1;
  const rough = max / divisions;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const mult of [1, 2, 2.5, 5, 10]) {
    if (magnitude * mult >= rough) return magnitude * mult;
  }
  return magnitude * 10;
}

/**
 * Overlapping area chart. The series are nested stages of one funnel rather than
 * parts of a whole, so they are drawn on top of each other, widest first.
 */
export function TrendChart({
  series,
  labels,
  hidden = [],
  tooltip,
  title = "Campaign trend",
}: {
  series: Series[];
  labels: { at: number; text: string }[];
  hidden?: string[];
  /**
   * What to show beside the pointer, for the day under it. Passing nothing leaves the chart
   * static — the Analytics screen reads its detail from the funnel card instead.
   */
  tooltip?: (index: number) => React.ReactNode;
  title?: string;
}) {
  const W = 1126;
  const H = 300;
  const padL = 40;
  const padR = 10;
  const padT = 14;
  const padB = 28;

  const [hover, setHover] = useState<number | null>(null);
  const shown = series.filter((s) => !hidden.includes(s.key));
  const count = series[0]?.values.length ?? 0;
  const step = axisStep(Math.max(1, ...shown.flatMap((s) => s.values)), 4);
  const top = step * 4;

  const x = (i: number) => padL + (count > 1 ? (i / (count - 1)) * (W - padL - padR) : 0);
  const y = (v: number) => H - padB - (v / top) * (H - padT - padB);

  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
  const clipId = "trend-clip";

  // The pointer is read off the SVG's own box rather than the day's pixel position, so the
  // nearest day is picked the same way whatever the chart has been scaled to.
  const at = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!tooltip || count < 1) return;
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * (count - 1));
    setHover(Math.max(0, Math.min(count - 1, i)));
  };

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        tabIndex={0}
        onMouseMove={at}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (!tooltip) return;
          if (e.key === "ArrowRight") setHover((i) => Math.min(count - 1, (i ?? -1) + 1));
          if (e.key === "ArrowLeft") setHover((i) => Math.max(0, (i ?? count) - 1));
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={W} height={H} />
          </clipPath>
        </defs>

        {ticks.map((t) => (
          <g className="tick" key={t}>
            <line className="gl" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
            <text className="ax" x={padL - 10} y={y(t) + 3.5} textAnchor="end">
              {Math.round(t).toLocaleString("en-US")}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {shown.map((s) => {
            const points: [number, number][] = s.values.map((v, i) => [x(i), y(v)]);
            const line = smooth(points);
            const base = H - padB;
            return (
              <g key={s.key} opacity="1">
                <path d={`${line}L${x(count - 1)},${base}L${x(0)},${base}Z`} fill={s.fill} />
                <path
                  d={line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </g>

        {labels.map((l, i) => {
          const first = i === 0;
          const last = i === labels.length - 1;
          return (
            <text
              className="ax"
              key={l.at}
              x={first ? padL : last ? W - padR : x(l.at)}
              y={H - 8}
              textAnchor={first ? "start" : last ? "end" : "middle"}
            >
              {l.text}
            </text>
          );
        })}

        {hover != null && tooltip && (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padT}
              y2={H - padB}
              stroke="var(--ink)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity=".45"
            />
            {shown.map((s) => (
              <circle
                key={s.key}
                cx={x(hover)}
                cy={y(s.values[hover] ?? 0)}
                r="4.5"
                fill="var(--surface)"
                stroke={s.color}
                strokeWidth="2"
              />
            ))}
          </g>
        )}
      </svg>

      {hover != null && tooltip && (
        <div
          className="tip"
          style={
            // Flip to the left of the crosshair once it is past the middle, so the readout never
            // hangs off the card.
            (x(hover) / W) * 100 > 62
              ? { top: 6, right: `calc(${100 - (x(hover) / W) * 100}% + 14px)` }
              : { top: 6, left: `calc(${(x(hover) / W) * 100}% + 14px)` }
          }
        >
          {tooltip(hover)}
        </div>
      )}
    </div>
  );
}

/** Grouped bars, one group per bucket and one bar per channel. */
export function BarChart({
  groups,
  channels,
}: {
  groups: { label: string; values: Record<string, number> }[];
  channels: { k: string; name: string; hex: string }[];
}) {
  const W = 720;
  const H = 240;
  const padL = 34;
  const padB = 26;
  const padT = 10;

  const step = axisStep(Math.max(1, ...groups.flatMap((g) => channels.map((c) => g.values[c.k] ?? 0))), 4);
  const top = step * 4;
  const slot = (W - padL - 8) / Math.max(1, groups.length);
  const barW = Math.max(3, (slot - 6) / channels.length);
  const y = (v: number) => H - padB - (v / top) * (H - padT - padB);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Activity by channel">
        {[0, 1, 2, 3, 4].map((i) => (
          <g className="tick" key={i}>
            <line className="gl" x1={padL} x2={W - 8} y1={y(i * step)} y2={y(i * step)} />
            <text className="ax" x={padL - 8} y={y(i * step) + 3.5} textAnchor="end">
              {Math.round(i * step)}
            </text>
          </g>
        ))}

        {groups.map((g, gi) =>
          channels.map((c, ci) => {
            const v = g.values[c.k] ?? 0;
            const x = padL + gi * slot + 3 + ci * barW;
            return (
              <rect
                key={`${gi}-${c.k}`}
                x={x}
                y={y(v)}
                width={Math.max(2, barW - 1)}
                height={Math.max(0, H - padB - y(v))}
                fill={c.hex}
                rx="1.5"
              >
                <title>{`${c.name} · ${g.label}: ${Math.round(v)}`}</title>
              </rect>
            );
          }),
        )}

        {groups.map((g, gi) =>
          gi % Math.ceil(groups.length / 6) === 0 ? (
            <text className="ax" key={g.label} x={padL + gi * slot + slot / 2} y={H - 8} textAnchor="middle">
              {g.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
