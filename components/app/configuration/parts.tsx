"use client";

/**
 * The small pieces every Configuration tab is built from: a settings row, a
 * panel, a stepper, a meter and the warn boxes.
 *
 * They exist so each tab reads as a list of settings rather than a pile of
 * divs, and so the whole screen shares one row rhythm. The classes are the
 * `.cf-*` block at the end of `app/app.css`, lifted from the configuration
 * design reference.
 */

import { useState } from "react";
import { Glyph } from "../icons";
import { Switch } from "../ui";
import type { ToggleRow } from "@/lib/app/configuration";

/* ---------- state --------------------------------------------------------- */

/**
 * Holds a list of switches for the length of the visit. Seeded from the demo
 * data's own `on` values, so a reload puts every switch back where it started —
 * there is no configuration store behind this screen yet, and the tabs say so.
 */
export function useToggles(rows: ToggleRow[]) {
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.on])),
  );
  return { on, toggle: (id: string) => setOn((o) => ({ ...o, [id]: !o[id] })) };
}

/* ---------- panels -------------------------------------------------------- */

/** A card with a heading, an optional sub-line and an optional action. */
export function Panel({
  title,
  sub,
  action,
  children,
  className = "",
}: {
  title?: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"card cf-card " + className}>
      {title && (
        <div className="card-h">
          <div>
            <h3>{title}</h3>
            {sub && <span className="cf-sub">{sub}</span>}
          </div>
          {action}
        </div>
      )}
      <div className="cf-body">{children}</div>
    </section>
  );
}

/** One setting: a label and hint on the left, the control on the right. */
export function Row({
  label,
  hint,
  locked,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  /** A rule the product keeps on: shows a padlock instead of a control. */
  locked?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="cf-row">
      <div className="cf-rl">
        <b>
          {label}
          {locked && (
            <span className="cf-lock" title="Always on">
              <Glyph n="lock" />
            </span>
          )}
        </b>
        {hint && <small>{hint}</small>}
      </div>
      <div className="cf-rc">{children}</div>
    </div>
  );
}

/** A row whose control is a switch, driven by the screen's toggle state. */
export function ToggleRowView({
  id,
  label,
  hint,
  locked,
  on,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  locked?: boolean;
  on: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <Row label={label} hint={hint} locked={locked}>
      <Switch on={on} label={label} disabled={locked} onChange={() => onChange(id)} />
    </Row>
  );
}

/* ---------- controls ------------------------------------------------------ */

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  className = "",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <div className={"stepper" + (className ? " " + className : "")}>
      <button type="button" aria-label="Decrease" onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span>{value}</span>
      <button type="button" aria-label="Increase" onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}

/** A bar showing a value against its ceiling; it turns alert when it is over. */
export function Meter({ value, max, className = "" }: { value: number; max: number; className?: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={"cf-meter" + (className ? " " + className : "")}>
      <i className={value > max ? "over" : ""} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * A per-day limit on a tile: the caption, a compact stepper and the bar under
 * it, with a tick at the figure the channel is safe up to.
 */
export function TileLimit({
  label,
  unit,
  value,
  onChange,
  max,
  safe,
  hint,
}: {
  label: string;
  unit?: string;
  value: number;
  onChange: (next: number) => void;
  max: number;
  /** The figure the channel is comfortable with, drawn as a tick on the bar. */
  safe?: number;
  hint?: string;
}) {
  return (
    <div className="cf-list" title={hint}>
      <TileLabel label={label} unit={unit} />
      <div className="cf-limit-c">
        <Stepper value={value} onChange={onChange} max={max} className="xs" />
        <div className="cf-meter sm">
          <i className={safe && value > safe ? "over" : ""} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
          {safe != null && <b style={{ left: `${(safe / max) * 100}%` }} />}
        </div>
      </div>
    </div>
  );
}

/** The same figure when there is nothing to set — a read-only count on a tile. */
export function TileFigure({ label, unit, value }: { label: string; unit?: string; value: React.ReactNode }) {
  return (
    <div className="cf-list">
      <TileLabel label={label} unit={unit} />
      <b className="cf-tilenum num">{value}</b>
    </div>
  );
}

/* ---------- notices ------------------------------------------------------- */

/** The alert strip: something is stopping messages sending or landing. */
export function Issue({ children, soft }: { children: React.ReactNode; soft?: boolean }) {
  return (
    <div className={"cf-issues" + (soft ? " soft" : "")}>
      <Glyph n="alert" />
      <span>{children}</span>
    </div>
  );
}

/**
 * The note every tab carries: this screen is a prototype, so edits last for
 * the length of the visit and the figures are sample data, not measurements.
 */
export function DemoNote({ what = "figures" }: { what?: string }) {
  return (
    <p className="cf-nocontent">
      Illustrative demo data — the {what} here are samples, not measurements, and changes last for
      this visit only. There is no configuration store behind this screen yet.
    </p>
  );
}

/**
 * The channels the product does not run yet. Integrations lists WhatsApp,
 * Twilio and the CRMs as planned, so these tabs preview their settings and say
 * plainly that nothing is connected — the UI never offers a connection the
 * product cannot honour.
 */
export function PlannedNote({ channel }: { channel: string }) {
  return (
    <div className="warnbox">
      <b>{channel} is planned, not connected</b>
      These settings are a preview of how {channel} will be configured. Nothing sends on this channel
      today, and nothing here is saved.
    </div>
  );
}

/* ---------- labels -------------------------------------------------------- */

/** The mono caption over a figure on a tile. */
export function TileLabel({ label, unit }: { label: string; unit?: string }) {
  return (
    <span className="cf-lilabel">
      {label}
      {unit && <small>{unit}</small>}
    </span>
  );
}
