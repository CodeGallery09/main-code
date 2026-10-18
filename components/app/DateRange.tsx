"use client";

/**
 * The window picker in the Home header.
 *
 * It reports an inclusive `from`/`to` pair of UTC calendar days, because that is the grain the
 * rollups are stored at (`daily_rollups.day`). Days are handled as `YYYY-MM-DD` strings
 * throughout rather than `Date` objects: a `Date` carries the viewer's offset, and a window that
 * shifts by a time zone would quietly report a different day's figures than the server counted.
 *
 * Nothing in the future is selectable — there are no rollups for it — and the preset chips cover
 * the windows the API serves without a round trip to the calendar.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { dayOf, daysBetween, shiftDay } from "@/lib/data/query";

export type Window = { from: string; to: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** `2026-10-18` -> `18 Oct`. */
export function dayLabel(day: string): string {
  const [, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1]}`;
}

export function windowLabel(w: Window): string {
  if (w.from === w.to) return dayLabel(w.to);
  return `${dayLabel(w.from)} – ${dayLabel(w.to)}`;
}

/** The presets, as day counts ending today. */
const PRESETS: [label: string, days: number][] = [
  ["Today", 1],
  ["7 days", 7],
  ["30 days", 30],
  ["90 days", 90],
];

export function presetWindow(days: number, today = dayOf(Date.now())): Window {
  return { from: shiftDay(today, -(days - 1)), to: today };
}

export function DateRange({ value, onChange }: { value: Window; onChange: (next: Window) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => value.to.slice(0, 7));
  // Half-finished selections live here until a second day lands, so the chart does not redraw
  // for a range the user has not finished choosing.
  const [anchor, setAnchor] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const today = useMemo(() => dayOf(Date.now()), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const days = useMemo(() => grid(month), [month]);
  const activePreset = PRESETS.find(([, n]) => value.to === today && daysBetween(value.from, value.to) === n);

  function pick(day: string) {
    if (day > today) return;
    if (!anchor) {
      setAnchor(day);
      return;
    }
    const next = anchor <= day ? { from: anchor, to: day } : { from: day, to: anchor };
    setAnchor(null);
    onChange(next);
    setOpen(false);
  }

  const preview = anchor ? { from: anchor, to: anchor } : value;

  return (
    <div className="drp" ref={root}>
      <button
        type="button"
        className={"drbtn" + (open ? " on" : "")}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setMonth(value.to.slice(0, 7));
          setAnchor(null);
          setOpen((o) => !o);
        }}
      >
        {windowLabel(value)}
        <span className="chev" aria-hidden="true">
          ⌄
        </span>
      </button>

      {open && (
        <div className="drpop" role="dialog" aria-label="Choose a date range">
          <div className="drq">
            {PRESETS.map(([label, n]) => (
              <button
                type="button"
                key={label}
                className={activePreset?.[0] === label ? "on" : ""}
                onClick={() => {
                  setAnchor(null);
                  onChange(presetWindow(n, today));
                  setOpen(false);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="calh">
            <button
              type="button"
              className="ib"
              aria-label="Previous month"
              onClick={() => setMonth(addMonths(month, -1))}
            >
              ‹
            </button>
            <b>
              {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
            </b>
            <button
              type="button"
              className="ib"
              aria-label="Next month"
              disabled={month >= today.slice(0, 7)}
              onClick={() => setMonth(addMonths(month, 1))}
            >
              ›
            </button>
          </div>

          <div className="cal">
            {WEEKDAYS.map((w, i) => (
              <span className="wd" key={i}>
                {w}
              </span>
            ))}
            {days.map((day, i) =>
              day === null ? (
                <span key={`pad-${i}`} />
              ) : (
                <button
                  type="button"
                  key={day}
                  disabled={day > today}
                  className={[
                    "cd",
                    day >= preview.from && day <= preview.to ? "in" : "",
                    day === preview.from ? "lo" : "",
                    day === preview.to ? "hi" : "",
                    day === preview.from || day === preview.to ? "end" : "",
                    day === today ? "today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={day}
                  onClick={() => pick(day)}
                >
                  <span>{Number(day.slice(8))}</span>
                </button>
              ),
            )}
          </div>

          <div className="drfoot">
            <span className="muted">
              {anchor ? "Pick the end of the range" : `${daysBetween(value.from, value.to)} days · ${windowLabel(value)}`}
            </span>
            <button type="button" className="sortb" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** `2026-10` shifted by whole months, staying a `YYYY-MM` string. */
function addMonths(month: string, by: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The month's days, padded so the first lands under Monday. */
function grid(month: string): (string | null)[] {
  const first = new Date(`${month}-01T00:00:00.000Z`);
  const lead = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
}
