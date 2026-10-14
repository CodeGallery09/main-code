"use client";

/**
 * Configuration · Overview — what is set up, and what is stopping messages.
 *
 * The setup checks are the point of the tab: each blocking check names the
 * thing that is broken and takes you to the tab that fixes it. Passing checks
 * are folded away, because a list of green rows is noise.
 */

import { CHANNEL } from "@/lib/app/channels";
import {
  CHANNEL_TILES,
  CONTENT_SUMMARY,
  PASSING_CHECKS,
  RULES_SUMMARY,
  SETUP_CHECKS,
  type ConfigTab,
} from "@/lib/app/configuration";
import { useState } from "react";
import { CheckIcon } from "../icons";
import { DemoNote } from "./parts";

export function Overview({ go }: { go: (tab: ConfigTab) => void }) {
  const [open, setOpen] = useState(false);
  const total = SETUP_CHECKS.length;
  const blocking = SETUP_CHECKS.filter((c) => c.tone === "bad").length;
  const shown = SETUP_CHECKS.filter((c) => c.tone !== "ok");

  return (
    <div className="cf-stack">
      <section className="card cf-health">
        <div className="cf-hl">
          <span className="eyebrow">Setup health</span>
          <div className="cf-score">
            <b>{PASSING_CHECKS}</b>
            <span>/ {total} checks passing</span>
          </div>
          <div className="cf-bar">
            <i style={{ width: `${(PASSING_CHECKS / total) * 100}%` }} />
          </div>
          <small className="muted">
            {blocking} things can stop messages from sending or landing.
          </small>
        </div>

        <ul className="cf-checks">
          {shown.map((check) => (
            <li className={check.tone} key={check.id}>
              <span className="cf-dot" />
              <div>
                <b>{check.title}</b>
                <small>{check.detail}</small>
              </div>
              {check.action && (
                <button
                  type="button"
                  className={"btn sm " + (check.tone === "bad" ? "pri" : "ghost")}
                  onClick={() => check.goes && go(check.goes)}
                >
                  {check.action}
                </button>
              )}
            </li>
          ))}
          {open &&
            SETUP_CHECKS.filter((c) => c.tone === "ok").map((check) => (
              <li className="ok" key={check.id}>
                <CheckIcon />
                <div>
                  <b>{check.title}</b>
                  <small>{check.detail}</small>
                </div>
              </li>
            ))}
          <li className="more">
            <button type="button" className="link" onClick={() => setOpen((o) => !o)}>
              {open ? "Hide" : "Show"} {PASSING_CHECKS} passing checks
            </button>
          </li>
        </ul>
      </section>

      <div className="cf-chgrid">
        {CHANNEL_TILES.map((tile) => {
          const channel = CHANNEL[tile.k];
          return (
            <button type="button" className="card cf-ch" key={tile.k} onClick={() => go(tile.k)}>
              <span className="between">
                <span className="row" style={{ gap: 8 }}>
                  <i className="cdot" style={{ background: channel.hex }} />
                  <b>{channel.name}</b>
                </span>
                <span className={"tag " + (tile.ok ? "pos" : "alert")}>{tile.state}</span>
              </span>
              <span className="cf-chs">
                {tile.lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid2 cf-g2">
        <Summary title="Content" rows={CONTENT_SUMMARY} onOpen={() => go("li")} />
        <Summary title="Rules in force" rows={RULES_SUMMARY} onOpen={() => go("sending")} />
      </div>

      <DemoNote />
    </div>
  );
}

function Summary({
  title,
  rows,
  onOpen,
}: {
  title: string;
  rows: [string, string][];
  onOpen: () => void;
}) {
  return (
    <section className="card cf-card">
      <div className="card-h">
        <div>
          <h3>{title}</h3>
        </div>
        <button type="button" className="link" onClick={onOpen}>
          Open
        </button>
      </div>
      <div className="cf-body">
        {rows.map(([label, value]) => (
          <div className="cf-sum" key={label}>
            <span>{label}</span>
            <span className="muted">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
