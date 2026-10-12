"use client";

/**
 * Small SVG chart set for the workspace. Everything is drawn straight to paths —
 * no chart library — so the marks inherit the app's type and colour tokens.
 */

/** Smooth path through points, using Catmull-Rom segments converted to cubics. */
function smooth(points: [number, number][]) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
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
}: {
  series: Series[];
  labels: { at: number; text: string }[];
  hidden?: string[];
}) {
  const W = 1126;
  const H = 300;
  const padL = 40;
  const padR = 10;
  const padT = 14;
  const padB = 28;

  const shown = series.filter((s) => !hidden.includes(s.key));
  const count = series[0]?.values.length ?? 0;
  const step = axisStep(Math.max(1, ...shown.flatMap((s) => s.values)), 4);
  const top = step * 4;

  const x = (i: number) => padL + (count > 1 ? (i / (count - 1)) * (W - padL - padR) : 0);
  const y = (v: number) => H - padB - (v / top) * (H - padT - padB);

  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
  const clipId = "trend-clip";

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Campaign trend" tabIndex={0}>
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
      </svg>
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
