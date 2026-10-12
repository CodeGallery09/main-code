"use client";

import { useState } from "react";
import { Screen } from "./AppShell";
import { Avatar, Meter, SideTabs, Switch } from "./ui";
import { CHANNEL } from "@/lib/app/channels";
import {
  CHANNEL_SETTINGS,
  DOMAINS,
  PLAN,
  SENDING_WINDOW,
  SETTINGS_SECTIONS,
  TEAM,
  type SettingsSection,
} from "@/lib/app/workspace";

export function SettingsScreen() {
  const [section, setSection] = useState<SettingsSection>("channels");
  const [off, setOff] = useState<string[]>([]);

  return (
    <Screen title="Settings">
      <div className="set">
        <SideTabs<SettingsSection>
          value={section}
          onChange={setSection}
          items={SETTINGS_SECTIONS.map(([k, label]) => [k, label])}
        />

        <div className="stack">
          {section === "channels" && (
            <section className="card">
              {CHANNEL_SETTINGS.map((row) => {
                const channel = CHANNEL[row.k];
                const on = row.on && !off.includes(row.k);
                return (
                  <div className="chrow" key={row.k}>
                    <i className="cdot" style={{ background: channel.hex }} />
                    <div style={{ minWidth: 0 }}>
                      <b>{channel.name}</b>
                      <small>{row.via}</small>
                    </div>
                    <span className="lim row" style={{ gap: 10 }}>
                      <span className={"tag " + row.status.tone}>{row.status.label}</span>
                      <span className="muted num" style={{ fontSize: 12.5, minWidth: 64, textAlign: "right" }}>
                        {row.cap}/day
                      </span>
                    </span>
                    <Switch
                      on={on}
                      label={channel.name}
                      onChange={() =>
                        setOff((o) => (o.includes(row.k) ? o.filter((k) => k !== row.k) : [...o, row.k]))
                      }
                    />
                  </div>
                );
              })}
            </section>
          )}

          {section === "sending" && (
            <>
              <section className="card">
                <div className="card-h">
                  <h3>Sending window</h3>
                </div>
                <div className="card-b">
                  <p>
                    {SENDING_WINDOW.days.join(" · ")}, {SENDING_WINDOW.from} to {SENDING_WINDOW.to} (
                    {SENDING_WINDOW.timezone}).
                  </p>
                  <p className="muted">
                    {SENDING_WINDOW.skipOther
                      ? "Leads already in another campaign are skipped, so nobody is double-touched."
                      : "Leads can appear in more than one campaign."}
                  </p>
                </div>
              </section>

              <section className="card">
                <div className="card-h">
                  <h3>Sending domains</h3>
                </div>
                {DOMAINS.map((d) => (
                  <div className="chrow" key={d.host}>
                    <i className="cdot" style={{ background: d.ok ? "var(--pos)" : "var(--hl)" }} />
                    <div style={{ minWidth: 0 }}>
                      <b>{d.host}</b>
                      <small>{d.note}</small>
                    </div>
                    <span className="lim row" style={{ gap: 10 }}>
                      <span className={"tag " + (d.ok ? "pos" : "hl")}>{d.ok ? "Verified" : "Pending"}</span>
                    </span>
                  </div>
                ))}
              </section>
            </>
          )}

          {section === "team" && (
            <section className="card">
              {TEAM.map((person) => (
                <div className="chrow" key={person.email}>
                  <Avatar name={person.name} />
                  <div style={{ minWidth: 0 }}>
                    <b>{person.name}</b>
                    <small>{person.email}</small>
                  </div>
                  <span className="lim row" style={{ gap: 10 }}>
                    <span className="tag">{person.role}</span>
                    <span className="muted num" style={{ fontSize: 12.5, minWidth: 96, textAlign: "right" }}>
                      replies in {person.respondsIn}
                    </span>
                  </span>
                </div>
              ))}
            </section>
          )}

          {section === "plan" && (
            <section className="card">
              <div className="card-h">
                <h3>{PLAN.name} plan</h3>
                <span className="muted">Renews {PLAN.renews}</span>
              </div>
              <div className="card-b cap">
                <div>
                  <div className="t">
                    <span>Seats</span>
                    <span className="num muted">
                      {PLAN.seats} / {PLAN.seatCap}
                    </span>
                  </div>
                  <Meter value={PLAN.seats} max={PLAN.seatCap} color="var(--accent)" />
                </div>
                <div>
                  <div className="t">
                    <span>Active leads</span>
                    <span className="num muted">
                      {PLAN.leads.toLocaleString("en-US")} / {PLAN.leadCap.toLocaleString("en-US")}
                    </span>
                  </div>
                  <Meter value={PLAN.leads} max={PLAN.leadCap} color="var(--accent)" />
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </Screen>
  );
}
