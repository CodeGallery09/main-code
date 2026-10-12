/**
 * Illustrative performance data for the signed-in app.
 *
 * Numbers are simulated, not measured: a seeded PRNG walks 180 days and, for
 * each campaign and channel, produces a funnel of
 * [reached, engaged, replied, positive, meetings]. It is deterministic, so the
 * dashboard, the campaign table and analytics always agree with each other.
 */

import { ALL_CHANNELS, type ChannelKey } from "./channels";

/** Days of history the demo data covers; index DAYS-1 is today. */
export const DAYS = 180;

/** Index into the funnel tuple each stage occupies. */
export const REACHED = 0;
export const ENGAGED = 1;
export const REPLIED = 2;
export const POSITIVE = 3;
export const MEETINGS = 4;

export type Funnel = [number, number, number, number, number];

/** Per-channel shape: daily volume and the conversion between funnel stages. */
const CHANNEL_MODEL: Record<ChannelKey, { base: number; e: number; r: number; p: number; m: number }> = {
  li: { base: 24, e: 0.48, r: 0.092, p: 0.55, m: 0.42 },
  mail: { base: 46, e: 0.56, r: 0.038, p: 0.5, m: 0.4 },
  wa: { base: 14, e: 0.84, r: 0.17, p: 0.52, m: 0.36 },
  call: { base: 6, e: 0.44, r: 0.36, p: 0.45, m: 0.52 },
  sms: { base: 9, e: 0.9, r: 0.055, p: 0.4, m: 0.3 },
};

/** Which campaign ran on which channels, over which window. */
type Run = { id: number; mix: Partial<Record<ChannelKey, number>>; from: number; to: number; vol?: number };

const RUNS: Run[] = [
  { id: 1, mix: { li: 1, mail: 1, call: 0.5 }, from: 40, to: 999 },
  { id: 2, mix: { mail: 0.6, wa: 1, call: 1 }, from: 0, to: 999 },
  { id: 3, mix: { mail: 0.8, li: 0.4, sms: 1 }, from: 120, to: 999 },
  { id: 4, mix: { wa: 0.7, call: 0.4, mail: 0.4 }, from: 60, to: 120 },
  { id: 11, mix: { wa: 1 }, from: 152, to: 157, vol: 330 },
  { id: 12, mix: { mail: 1 }, from: 165, to: 999, vol: 150 },
  { id: 13, mix: { li: 1 }, from: 170, to: 999, vol: 21 },
  { id: 14, mix: { mail: 1 }, from: 160, to: 999, vol: 36 },
  { id: 15, mix: { sms: 1 }, from: 120, to: 165, vol: 11 },
  { id: 16, mix: { call: 1 }, from: 150, to: 999, vol: 3 },
];

/** Small deterministic PRNG, so every render of the demo agrees. */
function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 1831565813) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

/** Calendar date for a day index (DAYS-1 is today). */
export function dayDate(index: number) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - (DAYS - 1 - index));
  return d;
}

type DaySeries = Record<number, Partial<Record<ChannelKey, Funnel>>>;

const SERIES: DaySeries[] = (() => {
  const steady = rng(42);
  const bursty = rng(7);
  const days: DaySeries[] = [];

  for (let day = 0; day < DAYS; day++) {
    const weekday = dayDate(day).getDay();
    const weekend = weekday === 0 || weekday === 6;
    // The book grows over the window, and replies improve alongside it.
    const growth = 0.62 + 0.38 * (day / (DAYS - 1));
    const replyLift = 0.85 + 0.3 * (day / (DAYS - 1));
    const today: DaySeries = {};

    RUNS.forEach((run) => {
      today[run.id] = {};
      if (day < run.from || day > run.to) return;
      // Campaigns ramp over their first fortnight rather than starting flat out.
      const ramp = Math.min(1, (day - run.from + 1) / 14);

      (Object.entries(run.mix) as [ChannelKey, number][]).forEach(([ch, weight]) => {
        const model = CHANNEL_MODEL[ch];
        const dayFactor = weekend ? (ch === "call" ? 0.02 : 0.12) : 1;

        if (run.vol) {
          const reached = run.vol * dayFactor * (0.8 + bursty() * 0.4);
          const engaged = reached * model.e * (0.9 + bursty() * 0.2);
          const replied = reached * model.r * 0.6 * (0.75 + bursty() * 0.5);
          const positive = replied * model.p;
          today[run.id][ch] = [reached, engaged, replied, positive, positive * model.m * 0.6];
          return;
        }

        const reached = model.base * weight * growth * dayFactor * ramp * (0.8 + steady() * 0.4);
        const engaged = reached * model.e * (0.9 + steady() * 0.2);
        const replied = reached * model.r * replyLift * (0.75 + steady() * 0.5);
        const positive = replied * model.p * (0.85 + steady() * 0.3);
        today[run.id][ch] = [reached, engaged, replied, positive, positive * model.m * (0.8 + steady() * 0.4)];
      });
    });

    days.push(today);
  }
  return days;
})();

/** Totals over a day range, overall and split by channel. */
export function totals(
  from: number,
  to: number,
  channels: ChannelKey[] = ALL_CHANNELS,
  campaign: number | "all" = "all",
) {
  const tot: Funnel = [0, 0, 0, 0, 0];
  const byCh = Object.fromEntries(channels.map((c) => [c, [0, 0, 0, 0, 0] as Funnel])) as Record<ChannelKey, Funnel>;

  for (let day = Math.max(0, from); day <= Math.min(DAYS - 1, to); day++) {
    RUNS.forEach((run) => {
      if (campaign !== "all" && run.id !== campaign) return;
      channels.forEach((ch) => {
        const f = SERIES[day][run.id]?.[ch];
        if (!f) return;
        for (let i = 0; i < 5; i++) {
          tot[i] += f[i];
          byCh[ch][i] += f[i];
        }
      });
    });
  }
  return { tot, byCh };
}

/** Totals bucketed across a range — the shape the charts consume. */
export function buckets(
  from: number,
  to: number,
  channels: ChannelKey[],
  campaign: number | "all",
  stage: number,
  size: number,
) {
  const out: { start: number; end: number; v: Record<string, number> }[] = [];
  for (let start = from; start <= to; start += size) {
    const end = Math.min(to, start + size - 1);
    const { byCh } = totals(start, end, channels, campaign);
    out.push({ start, end, v: Object.fromEntries(channels.map((c) => [c, byCh[c][stage]])) });
  }
  return out;
}

/** Percentage, guarding the empty-denominator case. */
export const rate = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Oct" */
export const shortDate = (index: number) => {
  const d = dayDate(index);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** "6 – 12 Oct", collapsing the month when both ends share one. */
export function rangeLabel(from: number, to: number) {
  const a = dayDate(from);
  const b = dayDate(to);
  const left = a.getMonth() === b.getMonth() ? String(a.getDate()) : shortDate(from);
  return `${left} – ${shortDate(to)}`;
}

/** Share of sends that reach the recipient, per channel. */
const DELIVERABILITY: Record<ChannelKey, number> = { li: 1, mail: 0.97, wa: 0.96, sms: 0.95, call: 0.62 };

/** Channels where "opened" is a thing we can observe. */
const TRACKS_OPENS: Partial<Record<ChannelKey, boolean>> = { mail: true, wa: true };

/** Share of engaged recipients who click a link. */
const CLICK_RATE: Partial<Record<ChannelKey, number>> = { mail: 0.3, wa: 0.24, sms: 0.14 };

export type CampaignMetrics = {
  sent: number;
  delivered: number;
  opened: number;
  /** Delivered volume on channels that report opens — the open-rate denominator. */
  openBase: number;
  replied: number;
  positive: number;
  meetings: number;
  clicks: number;
};

/** Delivery funnel for one campaign over a day range. */
export function campaignMetrics(
  id: number,
  channels: ChannelKey[],
  from: number,
  to: number,
): CampaignMetrics {
  const { tot, byCh } = totals(from, to, channels, id);
  let delivered = 0;
  let openBase = 0;
  let opened = 0;
  let clicks = 0;

  channels.forEach((ch) => {
    const f = byCh[ch];
    delivered += f[REACHED] * DELIVERABILITY[ch];
    if (TRACKS_OPENS[ch]) {
      openBase += f[REACHED] * DELIVERABILITY[ch];
      opened += f[ENGAGED];
    }
    // SMS has no engagement signal, so clicks come off what was sent.
    clicks += (ch === "sms" ? f[REACHED] : f[ENGAGED]) * (CLICK_RATE[ch] || 0);
  });

  return {
    sent: tot[REACHED],
    delivered,
    opened,
    openBase,
    replied: tot[REPLIED],
    positive: tot[POSITIVE],
    meetings: tot[MEETINGS],
    clicks,
  };
}

/** 1,284 */
export const formatNum = (n: number) => Math.round(n).toLocaleString("en-US");
