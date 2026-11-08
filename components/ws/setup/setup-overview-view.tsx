"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Plus, RefreshCw, Settings, Trash2, Unlink } from "lucide-react";
import { api } from "@/lib/api";
import { linkedInNeedsAction, linkedInStateNote, mailboxNeedsAction, mailboxStateNote, missingRecords } from "@/lib/data/setup";
import { SETUP_HREF } from "@/lib/nav";
import type { ChannelAccount, Channel, ConnectSessionState, DomainCheck, SendingDomain } from "@/lib/data/types";
import { useAsync } from "@/lib/ws/use-async";
import { fmt, initialsOf } from "@/lib/ws/utils";
import { PageBody, PageHeader, SetupTabs, TopBar } from "@/components/ws/shell/page";
import { useWorkspace } from "@/components/ws/shell/workspace-context";
import { Card, FILL } from "@/components/ws/ui/card";
import { Button } from "@/components/ws/ui/button";
import { ChannelTile } from "@/components/ws/ui/channel-tile";
import { Confirm } from "@/components/ws/ui/confirm";
import { StatusPill } from "@/components/ws/ui/status-pill";
import { Appear, Expand } from "@/components/ws/ui/motion";
import { EmptyState, LoadError, Skeleton } from "@/components/ws/ui/misc";
import { AccountSettings } from "./account-settings";

/**
 * Setup · Overview — a register of what the workspace can send from, and the
 * one place to fix or disconnect it. No meters or limits here: those are on
 * Home, and each account's dials are behind its Settings.
 */
export function SetupOverviewView({ linkedInConfigured }: { linkedInConfigured: boolean }) {
  const { badges, refreshBadges } = useWorkspace();
  const snapshot = useAsync(() => api.accounts(), []);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ChannelAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  // What each domain's last lookup found. Kept here, above the card, because saving a domain
  // reloads the snapshot and the card under it re-mounts.
  const [domainChecks, setDomainChecks] = useState<Record<string, DomainCheck>>({});

  const accounts = snapshot.data?.accounts ?? [];
  const domains = snapshot.data?.domains ?? [];
  const linkedin = accounts.filter((a) => a.channel === "linkedin");
  const mailboxes = accounts.filter((a) => a.channel === "email");

  // Stable: `snapshot` is a fresh object each render, so the banner's effect would
  // re-run (and re-poll) forever if it depended on the whole thing.
  const reload = snapshot.reload;
  const onConnected = useCallback(() => {
    reload();
    refreshBadges();
  }, [reload, refreshBadges]);

  /** Opens the provider's hosted sign-in: a new account, or a repair when an account id is given. */
  async function connect(channel: "linkedin" | "email", accountId?: string) {
    setConnecting(accountId ?? channel);
    try {
      const { url } = channel === "email" ? await api.connectEmail(accountId) : await api.connectLinkedIn(accountId);
      window.location.assign(url);
    } catch {
      setConnecting(null);
    }
  }

  async function disconnect(account: ChannelAccount) {
    setBusy(true);
    try {
      await api.deleteAccount(account.id);
      setRemoving(null);
      snapshot.reload();
      refreshBadges();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title="Setup" />
      <SetupTabs issues={badges.config} />
      <PageBody>
        <Appear>
          <PageHeader
            title="Connected accounts"
            subtitle="Everything Flightpath can send from. Connect, change a limit, or disconnect anything here."
          />
        </Appear>

        <ConnectResult onConnected={onConnected} />

        {snapshot.state === "loading" && (
          <>
            <Skeleton className="h-[120px] rounded-xl" />
            <Skeleton className="h-[120px] rounded-xl" />
          </>
        )}

        {snapshot.state === "failed" && (
          <Card>
            <LoadError message="We couldn't read your connected accounts." onRetry={snapshot.reload} />
          </Card>
        )}

        {snapshot.state === "ready" && (
          <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)_auto]">
            <Appear index={1} className={FILL}>
              <Card className={FILL}>
                <GroupHeader
                  tile={<ChannelTile channel="linkedin" size="sm" />}
                  name="LinkedIn accounts"
                  count={`${fmt(linkedin.length)} ${linkedin.length === 1 ? "account" : "accounts"}`}
                  onAdd={linkedInConfigured ? () => void connect("linkedin") : undefined}
                  adding={connecting === "linkedin"}
                />
                <div className="px-4 pb-[10px] pt-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  {linkedin.length === 0 ? (
                    <EmptyState>
                      {linkedInConfigured
                        ? "No LinkedIn account connected. Add one to send invites and messages."
                        : "Connecting LinkedIn isn't configured on this deployment."}
                    </EmptyState>
                  ) : (
                    linkedin.map((account) => (
                      <AccountRow
                        key={account.id}
                        account={account}
                        open={editing === account.id}
                        connecting={connecting === account.id}
                        onToggle={() => setEditing(editing === account.id ? null : account.id)}
                        onReconnect={() => void connect("linkedin", account.id)}
                        onDisconnect={() => setRemoving(account)}
                        onSaved={snapshot.reload}
                      />
                    ))
                  )}
                </div>
              </Card>
            </Appear>

            <Appear index={2} className={FILL}>
              <Card className={FILL}>
                <GroupHeader
                  tile={<ChannelTile channel="email" size="sm" />}
                  name="Email accounts"
                  count={`${fmt(mailboxes.length)} ${mailboxes.length === 1 ? "mailbox" : "mailboxes"} · ${fmt(domains.length)} ${domains.length === 1 ? "domain" : "domains"}`}
                  onAdd={linkedInConfigured ? () => void connect("email") : undefined}
                  adding={connecting === "email"}
                />
                <div className="px-4 pb-[10px] pt-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  {mailboxes.length === 0 ? (
                    <EmptyState>
                      {linkedInConfigured
                        ? "No mailbox connected. Add Gmail, Outlook or any IMAP mailbox to send email steps."
                        : "Connecting a mailbox isn't configured on this deployment."}
                    </EmptyState>
                  ) : (
                    mailboxes.map((account) => (
                      <AccountRow
                        key={account.id}
                        account={account}
                        open={editing === account.id}
                        connecting={connecting === account.id}
                        onToggle={() => setEditing(editing === account.id ? null : account.id)}
                        onReconnect={() => void connect("email", account.id)}
                        onDisconnect={() => setRemoving(account)}
                        onSaved={snapshot.reload}
                      />
                    ))
                  )}
                  <Domains
                    domains={domains}
                    checks={domainChecks}
                    onChecked={(check) => setDomainChecks((all) => ({ ...all, [check.domain.id]: check }))}
                    onChanged={onConnected}
                  />
                </div>
              </Card>
            </Appear>

            <Appear index={3} className="lg:col-span-2">
              <Card>
                <GroupHeader
                  tile={<ChannelTile muted size="sm" mono="··" />}
                  name="WhatsApp, calls and SMS"
                  count="Planned"
                />
                <div className="px-4 py-[10px]">
                  <p className="text-[11.5px] leading-[1.6] text-muted-foreground">
                    These channels are on the roadmap. They have no tab and no connect button because there is nothing
                    behind them yet — a call step today becomes a to-do for a person, which is why calls are still on
                    offer in the builder.
                  </p>
                </div>
              </Card>
            </Appear>
          </div>
        )}
      </PageBody>

      <Confirm
        open={removing !== null}
        title={`Disconnect ${removing?.name ?? ""}?`}
        body={
          <>
            Flightpath stops using this account. Any strategy step that sends from it stops being runnable until
            another account is connected. Nothing already recorded is deleted.
          </>
        }
        confirmLabel="Disconnect it"
        busy={busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && void disconnect(removing)}
      />
    </>
  );
}

function GroupHeader({
  tile,
  name,
  count,
  onAdd,
  adding = false,
}: {
  tile: React.ReactNode;
  name: string;
  count: string;
  /** Opens the hosted sign-in for another account. Absent where the deployment cannot connect. */
  onAdd?: () => void;
  adding?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-[10px] border-b border-border px-4 py-[9px]">
      <div className="flex min-w-0 items-center gap-[10px]">
        {tile}
        <h2 className="font-mono text-[13px] font-bold tracking-[-0.01em]">{name}</h2>
        <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
      </div>
      {onAdd ? (
        <Button variant="outline" size="sm" disabled={adding} onClick={onAdd}>
          <Plus aria-hidden strokeWidth={2.2} />
          {adding ? "Opening…" : "Add"}
        </Button>
      ) : null}
    </div>
  );
}

function AccountRow({
  account,
  open,
  connecting,
  onToggle,
  onReconnect,
  onDisconnect,
  onSaved,
}: {
  account: ChannelAccount;
  open: boolean;
  connecting: boolean;
  onToggle: () => void;
  onReconnect?: () => void;
  onDisconnect: () => void;
  onSaved: () => void;
}) {
  const needsAction =
    account.channel === "linkedin" ? linkedInNeedsAction(account.state) : mailboxNeedsAction(account.state);
  const label = !needsAction
    ? "Connected"
    : account.channel === "linkedin"
      ? linkedInStateNote(account.state)
      : mailboxStateNote(account.state);

  return (
    <div className="border-b border-divider last:border-b-0">
      <div className="flex flex-wrap items-center gap-3 py-[9px]">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[11px] font-medium text-body">
          {initialsOf(account.name)}
        </span>
        <span className="flex min-w-0 flex-1 basis-[240px] flex-col gap-[2px]">
          <span className="break-all text-[12.5px] font-semibold">{account.name}</span>
          <span className="break-all text-[11.5px] text-muted-foreground">
            {account.handle} · {account.connection.statusDetail || account.connection.provider}
          </span>
          {account.channel === "linkedin" && account.pace ? <PaceLine pace={account.pace} /> : null}
          {account.channel === "email" && account.pace ? <MailPaceLine pace={account.pace} /> : null}
        </span>
        <span className="shrink-0">
          <StatusPill tone={needsAction ? "warning" : "success"}>{label}</StatusPill>
        </span>
        <span className="flex shrink-0 items-center gap-[5px]">
          {needsAction && onReconnect ? (
            <Button variant="warning" size="sm" disabled={connecting} onClick={onReconnect}>
              {connecting ? "Opening…" : "Sign in again"}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            aria-expanded={open}
            aria-label={`Settings for ${account.name}`}
            onClick={onToggle}
          >
            <Settings aria-hidden strokeWidth={1.8} />
          </Button>
          <Button variant="danger" size="icon" aria-label={`Disconnect ${account.name}`} onClick={onDisconnect}>
            <Unlink aria-hidden strokeWidth={1.9} />
          </Button>
        </span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <Expand>
            <AccountSettings account={account} onSaved={onSaved} />
          </Expand>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * What this account has done today and when it may act next.
 *
 * Without this line a plan that has gone quiet is indistinguishable from a plan that is broken,
 * and the operator's next move is to launch it again. Every number is a count, never an estimate.
 */
function PaceLine({ pace }: { pace: NonNullable<Extract<ChannelAccount, { channel: "linkedin" }>["pace"]> }) {
  const next = pace.nextOpenAt ? new Date(pace.nextOpenAt) : null;
  const resumes =
    next && !Number.isNaN(next.getTime())
      ? new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(next)
      : null;
  return (
    <span className="flex flex-wrap items-center gap-x-[10px] gap-y-[2px] font-mono text-[11px] text-muted-foreground">
      <span>
        {pace.invitesToday}/{pace.invitesCap} invites · {pace.messagesToday}/{pace.messagesCap} messages today
      </span>
      {pace.warming ? <span>Easing in · day {pace.ageDays + 1} of 14</span> : null}
      {resumes ? <span>{pace.open ? "Day spent · resumes" : "Outside hours · resumes"} {resumes}</span> : null}
    </span>
  );
}

const resumesAt = (iso: string | null) => {
  const next = iso ? new Date(iso) : null;
  return next && !Number.isNaN(next.getTime())
    ? new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(next)
    : null;
};

/** What a mailbox has sent today, the same counts-only line a LinkedIn seat gets. */
function MailPaceLine({ pace }: { pace: NonNullable<Extract<ChannelAccount, { channel: "email" }>["pace"]> }) {
  const resumes = resumesAt(pace.nextOpenAt);
  return (
    <span className="flex flex-wrap items-center gap-x-[10px] gap-y-[2px] font-mono text-[11px] text-muted-foreground">
      <span>
        {pace.sentToday}/{pace.cap} emails today
      </span>
      {pace.warming ? <span>Easing in · day {pace.ageDays + 1} of 14</span> : null}
      {resumes ? <span>{pace.open ? "Day spent · resumes" : "Outside hours · resumes"} {resumes}</span> : null}
    </span>
  );
}

/**
 * The domains mail goes out from, each with a live SPF / DKIM / DMARC lookup. Adding one checks it
 * straight away; "Check again" re-reads DNS after a record has been published. What a lookup found
 * (or the exact thing to add) is shown under the row until the screen is left.
 */
function Domains({
  domains,
  checks,
  onChecked,
  onChanged,
}: {
  domains: SendingDomain[];
  checks: Record<string, DomainCheck>;
  onChecked: (check: DomainCheck) => void;
  onChanged: () => void;
}) {
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function add() {
    if (!host.trim()) return;
    setBusy("add");
    setError("");
    try {
      const result = await api.addDomain(host.trim());
      onChecked(result);
      setHost("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That domain could not be added.");
    } finally {
      setBusy(null);
    }
  }

  async function recheck(id: string) {
    setBusy(id);
    try {
      const result = await api.checkDomain(id);
      onChecked(result);
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await api.deleteDomain(id);
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-[6px] flex flex-col gap-[6px] border-t border-divider pt-[10px]">
      <span className="label-mono">Sending domains</span>
      {domains.map((domain) => (
        <DomainRow
          key={domain.id}
          domain={domain}
          check={checks[domain.id] ?? null}
          busy={busy === domain.id}
          onRecheck={() => void recheck(domain.id)}
          onRemove={() => void remove(domain.id)}
        />
      ))}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label htmlFor="add-domain" className="sr-only">
          Domain to add
        </label>
        <input
          id="add-domain"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="getacme.com"
          className="h-[30px] min-w-0 flex-1 basis-[180px] rounded-lg border border-input bg-card px-[10px] font-mono text-[12px]"
        />
        <Button size="sm" variant="outline" type="submit" disabled={busy === "add" || !host.trim()}>
          <Plus aria-hidden strokeWidth={2.2} />
          {busy === "add" ? "Checking…" : "Add domain"}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-[11.5px] text-warning">
          {error}
        </p>
      ) : (
        <p className="text-[11px] leading-[1.55] text-muted-foreground">
          Add every domain your mailboxes send from. Flightpath looks up its SPF, DKIM and DMARC records in public DNS;
          a missing one is the commonest reason cold email lands in spam.
        </p>
      )}
    </div>
  );
}

function DomainRow({
  domain,
  check,
  busy,
  onRecheck,
  onRemove,
}: {
  domain: SendingDomain;
  check: DomainCheck | null;
  busy: boolean;
  onRecheck: () => void;
  onRemove: () => void;
}) {
  const missing = missingRecords(domain);
  return (
    <div className="border-b border-divider pb-[8px] last:border-b-0">
      <div className="flex flex-wrap items-center gap-3 py-[5px]">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-medium text-body">
          DNS
        </span>
        <span className="flex min-w-0 flex-1 basis-[200px] flex-col gap-[2px]">
          <span className="break-all text-[12.5px] font-semibold">{domain.host}</span>
          <span className="text-[11.5px] text-muted-foreground">
            {missing.length === 0 ? "SPF, DKIM and DMARC all found" : `Missing ${missing.join(", ")}`}
          </span>
        </span>
        <span className="shrink-0">
          <StatusPill tone={missing.length ? "warning" : "success"}>
            {missing.length ? `${missing.length} record${missing.length === 1 ? "" : "s"} missing` : "Verified"}
          </StatusPill>
        </span>
        <span className="flex shrink-0 items-center gap-[5px]">
          <Button variant="outline" size="icon" disabled={busy} aria-label={`Check ${domain.host} again`} onClick={onRecheck}>
            <RefreshCw aria-hidden strokeWidth={1.9} />
          </Button>
          <Button variant="danger" size="icon" disabled={busy} aria-label={`Remove ${domain.host}`} onClick={onRemove}>
            <Trash2 aria-hidden strokeWidth={1.9} />
          </Button>
        </span>
      </div>
      {check && !check.records.found ? (
        <p className="ml-[46px] text-[11px] leading-[1.5] text-warning">
          {domain.host} couldn&apos;t be found in DNS. Check the spelling, or if the domain is new, give it an hour and
          check again.
        </p>
      ) : null}
      {check && check.records.found ? (
        <ul className="ml-[46px] flex flex-col gap-[3px] text-[11px] leading-[1.5] text-muted-foreground">
          {(["spf", "dkim", "dmarc"] as const).map((key) => (
            <li key={key} className="break-words">
              <span className={`font-mono font-semibold ${check.records[key].ok ? "text-success" : "text-warning"}`}>
                {key.toUpperCase()} {check.records[key].ok ? "✓" : "✗"}
              </span>{" "}
              {check.records[key].note}
            </li>
          ))}
          <li>DNS changes can take an hour to show. Check again once a record is published.</li>
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The hosted sign-in (LinkedIn or a mailbox) sends the member back here with `?connected=<session>` or
 * `?failed=<session>`. The provider's callback lands on our server, not in this tab, so the
 * outcome is read from the session rather than assumed from the query string — and it can still
 * be in flight on arrival, hence the short poll. The parameter is cleared either way so a
 * refresh does not replay a stale result.
 */
function ConnectResult({ onConnected }: { onConnected: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const reference = params.get("connected") ?? params.get("failed");
  const [state, setState] = useState<ConnectSessionState | "unknown">("pending");
  const [detail, setDetail] = useState("");
  const [channel, setChannel] = useState<Channel>("linkedin");
  const settled = useRef(false);

  useEffect(() => {
    if (!reference) return;
    settled.current = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const { session } = await api.connectSession(reference);
        if (settled.current) return;
        if (session.state === "pending" && tries < 6) {
          tries += 1;
          timer = setTimeout(() => void poll(), 1200);
          return;
        }
        settled.current = true;
        setState(session.state);
        setDetail(session.detail);
        setChannel(session.channel);
        if (session.state === "connected") onConnected();
      } catch {
        settled.current = true;
        setState("unknown");
      }
    };

    void poll();
    return () => {
      settled.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [reference, onConnected]);

  if (!reference) return null;

  const tone =
    state === "connected" ? "success" : state === "pending" ? "info" : ("warning" as const);
  const what = channel === "email" ? "The mailbox" : "LinkedIn";
  const message =
    state === "connected"
      ? `${what} is connected. It appears below.`
      : state === "pending"
        ? "Waiting for the provider to confirm the sign-in…"
        : state === "unknown"
          ? "We couldn't read how that sign-in went. Reload to see what connected."
          : state === "expired"
            ? "That sign-in took too long. Start it again with Add."
            : `${what} didn't connect${detail ? `: ${detail}` : "."}`;

  return (
    <Appear>
      <div
        role="status"
        className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-[9px] text-[12px] ${
          tone === "success"
            ? "border-success-bg bg-success-bg text-success"
            : tone === "info"
              ? "border-info-bg bg-info-bg text-info"
              : "border-warning-border bg-warning-bg text-warning"
        }`}
      >
        <span className="grow-[999]">{message}</span>
        <Button variant="ghost" size="sm" onClick={() => router.replace(SETUP_HREF)}>
          Dismiss
        </Button>
      </div>
    </Appear>
  );
}
