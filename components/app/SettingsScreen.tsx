"use client";

/**
 * Settings: the workspace's channels, sending domains, team and plan.
 *
 * Read from the workspace itself (`/api/workspace`, `/api/accounts`): the people are its members,
 * the channels are its accounts and daily limits, the domains are its sending domains. Channel
 * on/off switches, a sending window and billing are not stored yet, so they are not shown as if
 * they were.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Screen } from "./AppShell";
import { SampleBanner } from "./SampleBanner";
import { Avatar, Meter, SideTabs } from "./ui";
import { api } from "@/lib/api";
import { CHANNEL, type ChannelKey } from "@/lib/app/channels";
import { toChannelKey } from "@/lib/app/adapt";
import { CONFIGURATION_HREF } from "@/lib/nav";
import { missingRecords } from "@/lib/data/setup";
import type { AccountsSnapshot, Channel, Workspace } from "@/lib/data/types";

const SECTIONS = [
  ["channels", "Channels"],
  ["sending", "Sending"],
  ["team", "Team"],
  ["plan", "Plan"],
] as const;
type Section = (typeof SECTIONS)[number][0];

const ALL: Channel[] = ["linkedin", "email", "whatsapp", "call", "sms"];

export function SettingsScreen() {
  const [section, setSection] = useState<Section>("channels");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [accounts, setAccounts] = useState<AccountsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [ws, acc] = await Promise.all([api.workspace(), api.accounts()]);
      setWorkspace(ws.workspace);
      setAccounts(acc);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your settings.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Screen title="Settings">
      <SampleBanner onRemoved={() => void load()} />
      {error && (
        <p className="empty" role="status">
          {error}{" "}
          <button className="sortb" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}
      <div className="set">
        <SideTabs<Section> value={section} onChange={setSection} items={SECTIONS.map(([k, label]) => [k, label])} />

        <div className="stack">
          {!workspace || !accounts ? (
            !error && <p className="empty">Loading…</p>
          ) : (
            <>
              {section === "channels" && <Channels workspace={workspace} accounts={accounts} />}
              {section === "sending" && <Sending accounts={accounts} />}
              {section === "team" && <Team workspace={workspace} />}
              {section === "plan" && <Plan workspace={workspace} />}
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}

function Channels({ workspace, accounts }: { workspace: Workspace; accounts: AccountsSnapshot }) {
  return (
    <section className="card">
      {ALL.map((channel) => {
        const key: ChannelKey = toChannelKey(channel);
        const meta = CHANNEL[key];
        const live = workspace.liveChannels.includes(channel);
        const mine = accounts.accounts.filter((a) => a.channel === channel);
        const quota = workspace.quotas.find((q) => q.channel === channel);
        const via = !live
          ? "Planned. Not available yet"
          : mine.length
            ? mine.map((a) => (a.channel === "email" ? a.handle : a.name)).join(" · ")
            : "Nothing connected yet";
        const out = mine.some((a) => a.channel === "linkedin" && a.state === "signed_out");
        const status = !live
          ? { label: "Planned", tone: "" }
          : !mine.length
            ? { label: "Not connected", tone: "hl" }
            : out
              ? { label: "Log in again", tone: "alert" }
              : { label: "Ready", tone: "pos" };
        return (
          <div className="chrow" key={channel}>
            <i className="cdot" style={{ background: meta.hex }} />
            <div style={{ minWidth: 0 }}>
              <b>{meta.name}</b>
              <small>{via}</small>
            </div>
            <span className="lim row" style={{ gap: 10 }}>
              <span className={"tag " + status.tone}>{status.label}</span>
              {live && quota && (
                <span className="muted num" style={{ fontSize: 12.5, minWidth: 64, textAlign: "right" }}>
                  {quota.cap}/day
                </span>
              )}
            </span>
          </div>
        );
      })}
      <p className="empty" style={{ textAlign: "left" }}>
        Accounts and daily limits are managed in <Link href={CONFIGURATION_HREF}>Configuration</Link>.
      </p>
    </section>
  );
}

function Sending({ accounts }: { accounts: AccountsSnapshot }) {
  return (
    <>
      <section className="card">
        <div className="card-h">
          <h3>Sending window</h3>
        </div>
        <div className="card-b">
          <p className="muted">
            Sending days and hours, and the rule that skips leads already in another campaign, are in{" "}
            <Link href={CONFIGURATION_HREF}>Configuration</Link>.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="card-h">
          <h3>Sending domains</h3>
        </div>
        {accounts.domains.length === 0 ? (
          <p className="empty">No sending domain yet. A domain appears here once you connect a mailbox.</p>
        ) : (
          accounts.domains.map((d) => {
            const missing = missingRecords(d);
            const ok = missing.length === 0;
            return (
              <div className="chrow" key={d.id}>
                <i className="cdot" style={{ background: ok ? "var(--pos)" : "var(--hl)" }} />
                <div style={{ minWidth: 0 }}>
                  <b>
                    {d.host}
                    {d.isSample && (
                      <span className="tag" style={{ marginLeft: 6 }}>
                        Sample
                      </span>
                    )}
                  </b>
                  <small>{ok ? "SPF · DKIM · DMARC verified" : `Missing ${missing.join(", ")}`}</small>
                </div>
                <span className="lim row" style={{ gap: 10 }}>
                  <span className={"tag " + (ok ? "pos" : "hl")}>{ok ? "Verified" : "Pending"}</span>
                </span>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}

function Team({ workspace }: { workspace: Workspace }) {
  return (
    <section className="card">
      {workspace.members.map((person) => (
        <div className="chrow" key={person.id}>
          <Avatar name={person.name} />
          <div style={{ minWidth: 0 }}>
            <b>{person.name}</b>
            <small>{person.email}</small>
          </div>
          <span className="lim row" style={{ gap: 10 }}>
            <span className="tag">{person.role}</span>
          </span>
        </div>
      ))}
      <p className="empty" style={{ textAlign: "left" }}>
        Inviting teammates to this workspace isn&apos;t available yet.
      </p>
    </section>
  );
}

function Plan({ workspace }: { workspace: Workspace }) {
  return (
    <section className="card">
      <div className="card-h">
        <h3>{workspace.plan} plan</h3>
        <span className="muted">{workspace.name}</span>
      </div>
      <div className="card-b cap">
        <div>
          <div className="t">
            <span>Seats</span>
            <span className="num muted">
              {workspace.seatsUsed} / {workspace.seats}
            </span>
          </div>
          <Meter value={workspace.seatsUsed} max={Math.max(workspace.seats, 1)} color="var(--accent)" />
        </div>
        <small className="muted">Billing isn&apos;t set up yet. Every workspace is on the Free plan for now.</small>
      </div>
    </section>
  );
}
