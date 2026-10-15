"use client";

/**
 * Configuration · the five channel tabs.
 *
 * LinkedIn and email are the channels the product runs. Their accounts and mailboxes belong to the
 * **workspace** and are read from the database: the daily caps and which campaigns use each account
 * are saved as you change them, and any number of campaigns can share one account. WhatsApp, Calls
 * and SMS carry the planned note Integrations uses, because the UI never offers a connection the
 * product cannot honour.
 */

import { useEffect, useRef, useState } from "react";
import { CHANNEL } from "@/lib/app/channels";
import {
  EMAIL_FOOTER,
  EMAIL_TRACKING,
  LINKEDIN_ACCOUNT_RULES,
  LINKEDIN_NUMBER_RULES,
} from "@/lib/app/configuration";
import { api, fieldErrorsOf } from "@/lib/api";
import { missingRecords } from "@/lib/data/setup";
import { EMAIL_CAP_MAX, LINKEDIN_LIMITS, type AccountSettingsPatch } from "@/lib/data/validate";
import type {
  AccountsSnapshot,
  Campaign,
  ChannelAccount,
  EmailAccount,
  LinkedInAccount,
  SendingDomain,
} from "@/lib/data/types";
import { Avatar, Segmented, Switch } from "../ui";
import { CheckIcon, Glyph } from "../icons";
import {
  DemoNote,
  Issue,
  Panel,
  PlannedNote,
  Row,
  Stepper,
  TileFigure,
  TileLabel,
  TileLimit,
  ToggleRowView,
  useToggles,
} from "./parts";

type TabProps = {
  snapshot: AccountsSnapshot;
  campaigns: Campaign[];
  /** Re-reads the workspace after a change that other tabs depend on. */
  onChange: () => void;
};

/* ---------- saving ---------------------------------------------------------- */

/**
 * A value the user can nudge, saved a moment after the last nudge. The new value shows at once; if
 * the save fails it says so rather than pretending, and the next nudge tries again.
 */
function useSavedSetting(initial: number, save: (value: number) => Promise<unknown>) {
  const [value, setValue] = useState(initial);
  const [failed, setFailed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(save);
  latest.current = save;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const set = (next: number) => {
    setValue(next);
    setFailed(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      latest.current(next).catch((caught) => {
        const fields = fieldErrorsOf(caught);
        setFailed(fields ? Object.values(fields)[0] : "Couldn't save that. Try again.");
      });
    }, 500);
  };
  return { value, set, failed };
}

/** The campaigns that send from one account: chips to remove, a menu to add. Saved on each change. */
function UsedBy({
  account,
  campaigns,
  onChange,
}: {
  account: ChannelAccount;
  campaigns: Campaign[];
  onChange: () => void;
}) {
  const [ids, setIds] = useState(account.campaignIds);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only campaigns that run on this account's channel are offered, and a workflow is what makes a
  // multichannel campaign send, so standalone ones are listed too if they use the channel.
  const addable = campaigns.filter((c) => c.channels.includes(account.channel) && !ids.includes(c.id));
  const byId = new Map(campaigns.map((c) => [c.id, c]));

  async function commit(next: string[]) {
    const before = ids;
    setIds(next);
    setBusy(true);
    setError(null);
    try {
      await api.setAccountCampaigns(account.id, next);
      onChange();
    } catch {
      setIds(before);
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cf-list cf-span2">
      <TileLabel label="Used by campaigns" />
      <div className="cf-chips" style={{ marginTop: 4 }}>
        {ids.length === 0 && <small className="muted">Not used by any campaign</small>}
        {ids.map((id) => {
          const campaign = byId.get(id);
          if (!campaign) return null;
          return (
            <button
              type="button"
              className="tag acc"
              key={id}
              disabled={busy}
              onClick={() => void commit(ids.filter((x) => x !== id))}
              aria-label={`Stop using ${account.name} for ${campaign.name}`}
            >
              {campaign.name}
              <Glyph n="x" className="i" />
            </button>
          );
        })}
      </div>
      {addable.length > 0 && (
        <select
          className="sel"
          style={{ marginTop: 6 }}
          value=""
          disabled={busy}
          aria-label={`Add a campaign to ${account.name}`}
          onChange={(e) => {
            if (e.target.value) void commit([...ids, e.target.value]);
          }}
        >
          <option value="">Add to a campaign…</option>
          {addable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      {error && <small className="cf-bad">{error}</small>}
    </div>
  );
}

const SampleTag = () => <span className="tag">Sample</span>;

/** Shown when a workspace has no account on a channel. Connecting is not built yet, and says so. */
function NothingConnected({ what }: { what: string }) {
  return (
    <Panel title={`No ${what} connected`}>
      <p className="cf-nocontent">
        Connect {what === "mailbox" ? "a" : "a"} {what} to send from it. Connecting isn&apos;t available yet, so
        there is nothing to set up here until it is. Campaigns you build now will use any account you
        connect later.
      </p>
      <button type="button" className="btn sm pri" disabled title="Connecting isn't available yet">
        Connect {what}
      </button>
    </Panel>
  );
}

/* ========== LinkedIn ====================================================== */

export function LinkedInTab({ snapshot, campaigns, onChange }: TabProps) {
  const rules = useToggles(LINKEDIN_ACCOUNT_RULES);
  const [numbers, setNumbers] = useState(() =>
    Object.fromEntries(LINKEDIN_NUMBER_RULES.map((r) => [r.id, r.value])),
  );
  const accounts = snapshot.accounts.filter((a): a is LinkedInAccount => a.channel === "linkedin");

  return (
    <div className="cf-stack">
      {accounts.length === 0 ? (
        <NothingConnected what="LinkedIn account" />
      ) : (
        <>
          <p className="cf-nocontent">
            These accounts belong to your workspace. Any campaign can send from any of them, and one
            account can run several campaigns at once.
          </p>
          <div className="cf-cardgrid">
            {accounts.map((account) => (
              <Seat key={account.id} account={account} campaigns={campaigns} onChange={onChange} />
            ))}
          </div>
        </>
      )}

      <Panel
        title="All accounts"
        sub="Account-level limits and sequence behaviour that apply across every LinkedIn account"
      >
        {LINKEDIN_ACCOUNT_RULES.slice(0, 2).map((r) => (
          <ToggleRowView key={r.id} {...r} on={rules.on[r.id]} onChange={rules.toggle} />
        ))}
        {LINKEDIN_NUMBER_RULES.map((r) => (
          <Row key={r.id} label={r.label} hint={r.hint}>
            <span className="row" style={{ gap: 8 }}>
              <Stepper
                value={numbers[r.id]}
                max={r.max}
                onChange={(v) => setNumbers((n) => ({ ...n, [r.id]: v }))}
              />
              {r.unit && <span className="muted">{r.unit}</span>}
            </span>
          </Row>
        ))}
        {LINKEDIN_ACCOUNT_RULES.slice(2).map((r) => (
          <ToggleRowView key={r.id} {...r} on={rules.on[r.id]} onChange={rules.toggle} />
        ))}
      </Panel>

      <DemoNote what="rules above" />
    </div>
  );
}

function Seat({
  account,
  campaigns,
  onChange,
}: {
  account: LinkedInAccount;
  campaigns: Campaign[];
  onChange: () => void;
}) {
  const out = account.state === "signed_out";
  const patch = (body: AccountSettingsPatch) => api.updateAccount(account.id, body);
  const connections = useSavedSetting(account.settings.connections, (v) => patch({ connections: v }));
  const messages = useSavedSetting(account.settings.messages, (v) => patch({ messages: v }));
  const visits = useSavedSetting(account.settings.visits, (v) => patch({ visits: v }));
  const failed = connections.failed || messages.failed || visits.failed;

  return (
    <section className="card cf-tile">
      <div className="cf-tileh">
        <Avatar name={account.name} size="sm" />
        <span className="cf-tilename">
          <b>{account.name}</b>
          <span className={"tag " + (out ? "alert" : "pos")}>{out ? "Log in again" : "Healthy"}</span>
          {account.isSample && <SampleTag />}
        </span>
        {out && (
          <button type="button" className="btn xs pri" disabled title="Reconnecting isn't available yet">
            Reconnect
          </button>
        )}
      </div>

      <a className="cf-liprofile" href={`https://${account.handle}`} target="_blank" rel="noreferrer">
        <i className="cdot" style={{ background: CHANNEL.li.hex }} />
        {account.handle}
      </a>

      {out && <Issue>Signed out. Steps that use this account are paused until it reconnects.</Issue>}
      {failed && <Issue>{failed}</Issue>}

      <div className="cf-tilegrid">
        <TileLimit
          label="Connections"
          unit="/day"
          hint="LinkedIn caps invites around 100 a week"
          value={connections.value}
          onChange={connections.set}
          max={LINKEDIN_LIMITS.connections}
          safe={25}
        />
        <TileLimit
          label="Messages"
          unit="/day"
          hint="To first-degree connections"
          value={messages.value}
          onChange={messages.set}
          max={LINKEDIN_LIMITS.messages}
          safe={80}
        />
        <TileLimit
          label="Visits"
          unit="/day"
          value={visits.value}
          onChange={visits.set}
          max={LINKEDIN_LIMITS.visits}
          safe={100}
        />
        <TileFigure label="InMail" unit="left" value={account.settings.inmail ?? "—"} />

        <UsedBy account={account} campaigns={campaigns} onChange={onChange} />
      </div>
    </section>
  );
}

/* ========== Email ========================================================= */

export function EmailTab({ snapshot, campaigns, onChange }: TabProps) {
  const [sub, setSub] = useState<"mailboxes" | "tracking">("mailboxes");

  return (
    <div className="cf-stack">
      <Segmented
        value={sub}
        onChange={setSub}
        items={[
          ["mailboxes", "Mailboxes & domains"],
          ["tracking", "Tracking & footer"],
        ]}
      />

      {sub === "mailboxes" && <Mailboxes snapshot={snapshot} campaigns={campaigns} onChange={onChange} />}
      {sub === "tracking" && (
        <>
          <Tracking />
          <DemoNote what="rules above" />
        </>
      )}
    </div>
  );
}

function Mailboxes({ snapshot, campaigns, onChange }: TabProps) {
  const mailboxes = snapshot.accounts.filter((a): a is EmailAccount => a.channel === "email");

  return (
    <>
      {snapshot.domains.length > 0 && (
        <Panel
          title="Sending domains"
          sub="SPF, DKIM and DMARC must all pass, or mail from the domain lands in spam."
        >
          <div className="cf-cardgrid">
            {snapshot.domains.map((d) => (
              <DomainCard key={d.id} domain={d} />
            ))}
          </div>
        </Panel>
      )}

      {mailboxes.length === 0 ? (
        <NothingConnected what="mailbox" />
      ) : (
        <Panel
          title="Mailboxes"
          sub="These belong to your workspace. Any campaign can send from any mailbox, and one mailbox can serve several campaigns. Keep each under 60 a day for cold email."
        >
          <div className="cf-cardgrid">
            {mailboxes.map((m) => (
              <MailboxCard key={m.id} account={m} campaigns={campaigns} onChange={onChange} />
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

function DomainCard({ domain }: { domain: SendingDomain }) {
  const ok = missingRecords(domain).length === 0;
  return (
    <article className="card cf-tile">
      <div className="cf-tileh">
        <span className="cf-tilename">
          <b className="cf-domname mono">{domain.host}</b>
          {domain.isSample && <SampleTag />}
        </span>
        {ok ? <span className="tag pos">Verified</span> : <span className="tag alert">Needs DNS records</span>}
      </div>
      <div className="cf-chips">
        {(["spf", "dkim", "dmarc"] as const).map((rec) => (
          <span className={"tag " + (domain[rec] ? "pos" : "alert")} key={rec}>
            {domain[rec] && <CheckIcon />}
            {rec.toUpperCase()}
          </span>
        ))}
      </div>
    </article>
  );
}

function MailboxCard({
  account,
  campaigns,
  onChange,
}: {
  account: EmailAccount;
  campaigns: Campaign[];
  onChange: () => void;
}) {
  const cap = useSavedSetting(account.settings.cap, (v) => api.updateAccount(account.id, { cap: v }));
  const [rotate, setRotate] = useState(account.settings.rotate);
  const [rotateError, setRotateError] = useState(false);

  async function toggleRotate() {
    const next = !rotate;
    setRotate(next);
    setRotateError(false);
    try {
      await api.updateAccount(account.id, { rotate: next });
    } catch {
      setRotate(!next);
      setRotateError(true);
    }
  }

  const { health, provider, warmDay } = account.settings;
  const warm = account.state === "warm";

  return (
    <article className="card cf-tile">
      <div className="cf-tileh">
        <span className="cf-mbico">
          <Glyph n="mail" />
        </span>
        <span className="cf-tilename">
          <b>{account.handle}</b>
          <span className={"tag " + (warm ? "pos" : "hl")}>{warm ? "Warm" : "Warming"}</span>
          {account.isSample && <SampleTag />}
        </span>
      </div>
      <span className="cf-tilesub">
        {provider}
        {warmDay ? ` · day ${warmDay}/14` : ""}
      </span>
      {(cap.failed || rotateError) && <Issue>{cap.failed ?? "Couldn't save that. Try again."}</Issue>}

      <div className="cf-tilegrid">
        <div className="cf-list">
          <TileLabel label="Health" unit="/100" />
          <b className={"cf-tilenum num" + (health < 80 ? " cf-bad" : "")}>{health}</b>
        </div>
        <TileLimit
          label="Daily cap"
          value={cap.value}
          onChange={cap.set}
          max={EMAIL_CAP_MAX}
          safe={60}
          hint="Keep each mailbox under 60/day for cold email"
        />
        <div className="cf-list cf-span2 row" style={{ justifyContent: "space-between" }}>
          <TileLabel label="Rotate into sending pool" />
          <Switch on={rotate} label={`Rotate ${account.handle}`} onChange={() => void toggleRotate()} />
        </div>
        <UsedBy account={account} campaigns={campaigns} onChange={onChange} />
      </div>
    </article>
  );
}

function Tracking() {
  const tracking = useToggles(EMAIL_TRACKING);
  const footer = useToggles(EMAIL_FOOTER);
  const [retries, setRetries] = useState(2);

  return (
    <>
      <Panel title="Tracking">
        {EMAIL_TRACKING.map((r) => (
          <ToggleRowView key={r.id} {...r} on={tracking.on[r.id]} onChange={tracking.toggle} />
        ))}
      </Panel>

      <Panel title="Footer & unsubscribe">
        {EMAIL_FOOTER.map((r) => (
          <ToggleRowView key={r.id} {...r} on={footer.on[r.id]} onChange={footer.toggle} />
        ))}
      </Panel>

      <Panel title="Bounces">
        <Row label="Hard bounce">
          <span className="tag">Stop &amp; suppress</span>
        </Row>
        <Row label="Retry soft bounces">
          <span className="row" style={{ gap: 8 }}>
            <Stepper value={retries} max={5} onChange={setRetries} />
            <span className="muted">times</span>
          </span>
        </Row>
      </Panel>
    </>
  );
}

/* ========== The planned channels ========================================== */

function Planned({ channel, what }: { channel: string; what: string }) {
  return (
    <div className="cf-stack">
      <PlannedNote channel={channel} />
      <p className="cf-nocontent">{what}</p>
    </div>
  );
}

export function WhatsAppTab() {
  return (
    <Planned
      channel="WhatsApp"
      what="WhatsApp needs a business number and Meta-approved templates. None of that exists yet, so there is nothing to configure."
    />
  );
}

export function CallsTab() {
  return (
    <Planned
      channel="Calling"
      what="Calls will add a dialer, call scripts and outcomes. Today a call step in a workflow creates a to-do for a person; nothing dials."
    />
  );
}

export function SmsTab() {
  return (
    <Planned
      channel="SMS"
      what="SMS needs a registered sender and approved templates. Nothing is registered yet, so there is nothing to configure."
    />
  );
}
