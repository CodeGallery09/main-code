"use client";

/**
 * Configuration · the five channel tabs.
 *
 * LinkedIn and email are the channels the product runs. Their accounts and mailboxes belong to the
 * **workspace** and are read from the database: the daily caps and which strategies use each account
 * are saved as you change them, and any number of strategies can share one account. WhatsApp, Calls
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
import { linkedInNeedsAction, linkedInStateNote, missingRecords } from "@/lib/data/setup";
import { EMAIL_CAP_MAX, LINKEDIN_LIMITS, type AccountSettingsPatch } from "@/lib/data/validate";
import type {
  AccountActivity,
  AccountsSnapshot,
  Strategy,
  ChannelAccount,
  EmailAccount,
  LinkedInAccount,
  SendingDomain,
} from "@/lib/data/types";
import { Avatar, Segmented, Switch } from "../ui";
import { ConnectStatus, useLinkedInConnect } from "../integrations/ConnectLinkedIn";
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
  strategies: Strategy[];
  /** Re-reads the workspace after a change that other tabs depend on. */
  onChange: () => void;
};

type LinkedInTabProps = TabProps & {
  /** Real per-account counts from the event log. Empty while they are still loading. */
  activity?: AccountActivity[];
  /** Whether this deployment can open a hosted sign-in at all. */
  linkedInConfigured?: boolean;
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

/** The strategies that send from one account: chips to remove, a menu to add. Saved on each change. */
function UsedBy({
  account,
  strategies,
  onChange,
}: {
  account: ChannelAccount;
  strategies: Strategy[];
  onChange: () => void;
}) {
  const [ids, setIds] = useState(account.strategyIds);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only strategies that run on this account's channel are offered, and a workflow is what makes a
  // multichannel strategy send, so standalone ones are listed too if they use the channel.
  const addable = strategies.filter((c) => c.channels.includes(account.channel) && !ids.includes(c.id));
  const byId = new Map(strategies.map((c) => [c.id, c]));

  async function commit(next: string[]) {
    const before = ids;
    setIds(next);
    setBusy(true);
    setError(null);
    try {
      await api.setAccountStrategies(account.id, next);
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
      <TileLabel label="Used by strategies" />
      <div className="cf-chips" style={{ marginTop: 4 }}>
        {ids.length === 0 && <small className="muted">Not used by any strategy</small>}
        {ids.map((id) => {
          const strategy = byId.get(id);
          if (!strategy) return null;
          return (
            <button
              type="button"
              className="tag acc"
              key={id}
              disabled={busy}
              onClick={() => void commit(ids.filter((x) => x !== id))}
              aria-label={`Stop using ${account.name} for ${strategy.name}`}
            >
              {strategy.name}
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
          aria-label={`Add a strategy to ${account.name}`}
          onChange={(e) => {
            if (e.target.value) void commit([...ids, e.target.value]);
          }}
        >
          <option value="">Add to a strategy…</option>
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

/**
 * Shown when a workspace has no LinkedIn account. Unlike the mailbox case this one can actually
 * connect — through the provider's hosted sign-in — but only where the deployment has a provider
 * configured, so the button is offered on that condition and the note says which case it is in.
 */
function NoLinkedInAccount({
  configured,
  onConnected,
}: {
  configured: boolean;
  onConnected: () => void;
}) {
  const connect = useLinkedInConnect(onConnected);
  return (
    <Panel title="No LinkedIn account connected">
      <p className="cf-nocontent">
        LinkedIn steps have no account to send from. Signing in happens on LinkedIn&apos;s own page in
        a new window — Flightpath never sees the password. Strategies you build now will use any
        account you connect.
      </p>
      <button
        type="button"
        className="btn sm pri"
        disabled={!configured || connect.busy}
        title={configured ? undefined : "Connecting isn't configured on this deployment"}
        onClick={() => void connect.start()}
      >
        {connect.busy ? "Connecting…" : "Connect LinkedIn account"}
      </button>
      <ConnectStatus phase={connect.phase} />
      {!configured && (
        <small className="muted">
          This deployment has no LinkedIn provider configured, so a sign-in can&apos;t be opened here
          yet.
        </small>
      )}
    </Panel>
  );
}

/** Shown when a workspace has no account on a channel. Connecting is not built yet, and says so. */
function NothingConnected({ what }: { what: string }) {
  return (
    <Panel title={`No ${what} connected`}>
      <p className="cf-nocontent">
        Connect {what === "mailbox" ? "a" : "a"} {what} to send from it. Connecting isn&apos;t available yet, so
        there is nothing to set up here until it is. Strategies you build now will use any account you
        connect later.
      </p>
      <button type="button" className="btn sm pri" disabled title="Connecting isn't available yet">
        Connect {what}
      </button>
    </Panel>
  );
}

/* ========== LinkedIn ====================================================== */

export function LinkedInTab({
  snapshot,
  strategies,
  onChange,
  activity = [],
  linkedInConfigured = false,
}: LinkedInTabProps) {
  const rules = useToggles(LINKEDIN_ACCOUNT_RULES);
  const [numbers, setNumbers] = useState(() =>
    Object.fromEntries(LINKEDIN_NUMBER_RULES.map((r) => [r.id, r.value])),
  );
  const accounts = snapshot.accounts.filter((a): a is LinkedInAccount => a.channel === "linkedin");
  const byAccount = new Map(activity.map((a) => [a.accountId, a]));
  const connect = useLinkedInConnect(onChange);

  return (
    <div className="cf-stack">
      {accounts.length === 0 ? (
        <NoLinkedInAccount configured={linkedInConfigured} onConnected={onChange} />
      ) : (
        <>
          <div className="cf-head between">
            <p className="cf-nocontent" style={{ margin: 0 }}>
              These accounts belong to your workspace. Any strategy can send from any of them, and one
              account can run several strategies at once.
            </p>
            <span className="row" style={{ gap: 8 }}>
              <ConnectStatus phase={connect.phase} />
              <button
                type="button"
                className="btn sm"
                disabled={!linkedInConfigured || connect.busy}
                title={linkedInConfigured ? undefined : "Connecting isn't configured on this deployment"}
                onClick={() => void connect.start()}
              >
                {connect.busy ? "Connecting…" : "Connect another"}
              </button>
            </span>
          </div>
          <div className="cf-cardgrid">
            {accounts.map((account) => (
              <Seat
                key={account.id}
                account={account}
                strategies={strategies}
                onChange={onChange}
                activity={byAccount.get(account.id)}
              />
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
  strategies,
  onChange,
  activity,
}: {
  account: LinkedInAccount;
  strategies: Strategy[];
  onChange: () => void;
  activity?: AccountActivity;
}) {
  const out = linkedInNeedsAction(account.state);
  // Only a real connection can be repaired or disconnected at the provider. A row typed in or
  // seeded has nothing behind it, so it is not offered either action.
  const connected = Boolean(account.connection.providerAccountId);
  const reconnect = useLinkedInConnect(onChange);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
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
          <span className={"tag " + (out ? "alert" : "pos")}>
            {out ? SEAT_TAG[account.state] : "Healthy"}
          </span>
          {account.isSample && <SampleTag />}
        </span>
        {out && connected && (
          <button
            type="button"
            className="btn xs pri"
            disabled={reconnect.busy}
            onClick={() => void reconnect.start(account.id)}
          >
            {reconnect.busy ? "Reconnecting…" : "Reconnect"}
          </button>
        )}
      </div>

      <a className="cf-liprofile" href={`https://${account.handle}`} target="_blank" rel="noreferrer">
        <i className="cdot" style={{ background: CHANNEL.li.hex }} />
        {account.handle}
      </a>

      {out && (
        <Issue>
          {account.connection.statusDetail ||
            `${linkedInStateNote(account.state)[0].toUpperCase()}${linkedInStateNote(account.state).slice(1)}.`}{" "}
          Steps that use this account are paused.
        </Issue>
      )}
      <ConnectStatus phase={reconnect.phase} />
      {failed && <Issue>{failed}</Issue>}
      {removeError && <Issue>{removeError}</Issue>}

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

        <UsedBy account={account} strategies={strategies} onChange={onChange} />
      </div>

      {connected && <SeatActivity account={account} activity={activity} />}

      {connected && (
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
          <button
            type="button"
            className="btn xs"
            disabled={removing}
            onClick={() => void disconnect()}
            title="Disconnects this account at the provider and removes it from the workspace"
          >
            {removing ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      )}
    </section>
  );

  async function disconnect() {
    // Irreversible and it affects every strategy using the seat, so it asks first.
    const using = account.strategyIds.length;
    const warning = using
      ? `Disconnect ${account.name}? ${using === 1 ? "1 strategy uses" : `${using} strategies use`} this account and will have nothing to send from.`
      : `Disconnect ${account.name}?`;
    if (!window.confirm(warning)) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await api.deleteAccount(account.id);
      onChange();
    } catch (caught) {
      setRemoveError(caught instanceof Error ? caught.message : "Couldn't disconnect that account.");
    } finally {
      setRemoving(false);
    }
  }
}

/** What each blocked state is called on the seat's pill. */
const SEAT_TAG: Record<LinkedInAccount["state"], string> = {
  healthy: "Healthy",
  signed_out: "Log in again",
  restricted: "Restricted",
  connecting: "Finishing sign-in",
};

/**
 * What has actually happened on one connected seat.
 *
 * Every figure is a count of a real delivery from the provider, over the last 30 days. Nothing
 * here is an estimate, so a seat that has done nothing reads zero — which is the useful answer
 * while there is no sender.
 */
function SeatActivity({ account, activity }: { account: LinkedInAccount; activity?: AccountActivity }) {
  const since = account.connection.connectedAt;
  return (
    <div className="cf-tilegrid" style={{ marginTop: 10 }}>
      <TileFigure label="Replies in" unit={`last ${activity?.windowDays ?? 30}d`} value={activity?.messagesReceived ?? 0} />
      <TileFigure label="Status changes" unit={`last ${activity?.windowDays ?? 30}d`} value={activity?.statusChanges ?? 0} />
      <div className="cf-list cf-span2">
        <TileLabel label="Connection" />
        <small className="muted">
          {since ? `Connected ${new Date(since).toLocaleDateString()}` : "Connected"} via{" "}
          {account.connection.provider}
          {activity?.lastMessageAt
            ? ` · last message ${new Date(activity.lastMessageAt).toLocaleString()}`
            : " · no messages received yet"}
        </small>
      </div>
    </div>
  );
}

/* ========== Email ========================================================= */

export function EmailTab({ snapshot, strategies, onChange }: TabProps) {
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

      {sub === "mailboxes" && <Mailboxes snapshot={snapshot} strategies={strategies} onChange={onChange} />}
      {sub === "tracking" && (
        <>
          <Tracking />
          <DemoNote what="rules above" />
        </>
      )}
    </div>
  );
}

function Mailboxes({ snapshot, strategies, onChange }: TabProps) {
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
          sub="These belong to your workspace. Any strategy can send from any mailbox, and one mailbox can serve several strategies. Keep each under 60 a day for cold email."
        >
          <div className="cf-cardgrid">
            {mailboxes.map((m) => (
              <MailboxCard key={m.id} account={m} strategies={strategies} onChange={onChange} />
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
  strategies,
  onChange,
}: {
  account: EmailAccount;
  strategies: Strategy[];
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
        <UsedBy account={account} strategies={strategies} onChange={onChange} />
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
