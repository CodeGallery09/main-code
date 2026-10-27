import type { Metric, RangeKey } from "@/lib/data/types";
import { fmt } from "./utils";

/** How a range reads in a footer: "7d" → "last week". */
const PERIOD: Record<RangeKey, string> = {
  "7d": "last week",
  "30d": "the previous 30 days",
  "90d": "the previous 90 days",
};

/** The headline value exactly as the metric describes it — count or percentage. */
export function metricValue(m: Metric) {
  return m.format === "percent" ? `${m.value.toFixed(m.decimals)}%` : fmt(m.value);
}

/**
 * The line under a metric, pre-signed and in words.
 *
 * Deliberately not an arrow or a colour: a strategy that is falling gets the
 * same treatment as one that is rising, so the operator reads the number
 * rather than the decoration. A metric with nothing to compare against says
 * so instead of showing a fabricated 0%.
 */
export function metricFooter(m: Metric, range: RangeKey) {
  if (m.delta === null) return m.value === 0 ? "Nothing yet" : `No comparison for ${PERIOD[range]}`;
  if (m.delta === 0) return `No change vs ${PERIOD[range]}`;
  const sign = m.delta > 0 ? "+" : "−";
  const size = Math.abs(m.delta);
  const unit = m.deltaUnit === "points" ? `${size.toFixed(1)} pts` : `${size}%`;
  return `${sign}${unit} vs ${PERIOD[range]}`;
}

/** A date as the workspace writes them: "19 Oct". */
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function shortDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : DAY.format(d);
}

/** "started 19 Oct" / "starts 27 Oct" / "edited 19 Oct", depending on the status. */
export function whenLabel(status: string, startedAt: string) {
  const day = shortDate(startedAt);
  if (!day) return "";
  if (status === "scheduled") return `starts ${day}`;
  if (status === "draft") return `edited ${day}`;
  return `started ${day}`;
}
