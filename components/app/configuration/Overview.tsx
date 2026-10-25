"use client";

/**
 * Configuration · Overview — what is set up, and what is stopping messages.
 *
 * Every row is computed from the workspace's own accounts and domains (`lib/data/setup.ts`): a new
 * workspace with nothing connected sees exactly that, not a list of invented problems. Each
 * blocking check names the thing that is wrong and, where there is something to do, takes you to
 * the tab that handles it. Passing checks are folded away, because a list of green rows is noise.
 */

import { useState } from "react";
import { CHANNEL } from "@/lib/app/channels";
import type { ConfigTab } from "@/lib/app/configuration";
import { blockingCount, type SetupCheck } from "@/lib/data/setup";
import type { AccountsSnapshot } from "@/lib/data/types";
import { CheckIcon } from "../icons";

export function Overview({
  go,
  checks,
  snapshot,
}: {
  go: (tab: ConfigTab) => void;
  checks: SetupCheck[];
  snapshot: AccountsSnapshot;
}) {
  const [open, setOpen] = useState(false);
  const passing = checks.filter((c) => c.tone === "ok");
  const shown = checks.filter((c) => c.tone !== "ok");
  const blocking = blockingCount(checks);
  // Information-only rows (planned channels) are not checks that can pass or fail.
  const scored = checks.filter((c) => c.tone !== "info");

  const linkedin = snapshot.accounts.filter((a) => a.channel === "linkedin");
  const mailboxes = snapshot.accounts.filter((a) => a.channel === "email");
  const campaignsUsing = (channel: "linkedin" | "email") =>
    new Set(snapshot.accounts.filter((a) => a.channel === channel).flatMap((a) => a.campaignIds)).size;

  return (
    <div className="cf-stack">
      <section className="card cf-health">
        <div className="cf-hl">
          <span className="eyebrow">Setup health</span>
          <div className="cf-score">
            <b>{passing.length}</b>
            <span>/ {scored.length} checks passing</span>
          </div>
          <div className="cf-bar">
            <i style={{ width: `${scored.length ? (passing.length / scored.length) * 100 : 0}%` }} />
          </div>
          <small className="muted">
            {blocking === 0
              ? "Nothing is stopping messages from sending or landing."
              : `${blocking} ${blocking === 1 ? "thing" : "things"} can stop messages from sending or landing.`}
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
              {!check.action && check.goes && check.tone === "bad" && (
                <button type="button" className="btn sm ghost" onClick={() => go(check.goes as ConfigTab)}>
                  View
                </button>
              )}
            </li>
          ))}
          {open &&
            passing.map((check) => (
              <li className="ok" key={check.id}>
                <CheckIcon />
                <div>
                  <b>{check.title}</b>
                  <small>{check.detail}</small>
                </div>
              </li>
            ))}
          {passing.length > 0 && (
            <li className="more">
              <button type="button" className="link" onClick={() => setOpen((o) => !o)}>
                {open ? "Hide" : "Show"} {passing.length} passing {passing.length === 1 ? "check" : "checks"}
              </button>
            </li>
          )}
        </ul>
      </section>

      <div className="cf-chgrid">
        <ChannelTile
          channel="li"
          ready={linkedin.length > 0 && linkedin.every((a) => a.state !== "signed_out")}
          lines={[
            plural(linkedin.length, "account"),
            `${campaignsUsing("linkedin")} ${campaignsUsing("linkedin") === 1 ? "campaign" : "campaigns"} using it`,
          ]}
          onOpen={() => go("li")}
        />
        <ChannelTile
          channel="mail"
          ready={mailboxes.length > 0}
          lines={[
            plural(mailboxes.length, "mailbox", "mailboxes"),
            `${campaignsUsing("email")} ${campaignsUsing("email") === 1 ? "campaign" : "campaigns"} using it`,
          ]}
          onOpen={() => go("mail")}
        />
        {/* Planned channels have nothing to configure, so they open the Connections list rather
            than a tab of their own saying there is nothing here. */}
        {(["wa", "call", "sms"] as const).map((k) => (
          <ChannelTile
            key={k}
            channel={k}
            planned
            lines={["Planned", "Not available yet"]}
            onOpen={() => go("connections")}
          />
        ))}
      </div>

      <p className="cf-nocontent">
        LinkedIn accounts and mailboxes belong to your workspace. Any number of campaigns can send from
        the same one.
      </p>
    </div>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ChannelTile({
  channel,
  ready,
  planned,
  lines,
  onOpen,
}: {
  channel: "li" | "mail" | "wa" | "call" | "sms";
  ready?: boolean;
  planned?: boolean;
  lines: string[];
  onOpen: () => void;
}) {
  const meta = CHANNEL[channel];
  return (
    <button type="button" className="card cf-ch" onClick={onOpen}>
      <span className="between">
        <span className="row" style={{ gap: 8 }}>
          <i className="cdot" style={{ background: meta.hex }} />
          <b>{meta.name}</b>
        </span>
        <span className={"tag " + (planned ? "" : ready ? "pos" : "alert")}>
          {planned ? "Planned" : ready ? "Ready" : "Not set up"}
        </span>
      </span>
      <span className="cf-chs">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
    </button>
  );
}
