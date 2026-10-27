"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Plus, Settings, Unlink } from "lucide-react";
import { api } from "@/lib/api";
import { linkedInNeedsAction, linkedInStateNote, missingRecords } from "@/lib/data/setup";
import { SETUP_HREF } from "@/lib/nav";
import type { ChannelAccount, ConnectSessionState, SendingDomain } from "@/lib/data/types";
import { useAsync } from "@/lib/ws/use-async";
import { fmt, initialsOf } from "@/lib/ws/utils";
import { PageBody, PageHeader, SetupTabs, TopBar } from "@/components/ws/shell/page";
import { useWorkspace } from "@/components/ws/shell/workspace-context";
import { Card, FILL } from "@/components/ws/ui/card";
import { Button, buttonVariants } from "@/components/ws/ui/button";
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

  async function reconnect(accountId: string) {
    setConnecting(accountId);
    try {
      const { url } = await api.connectLinkedIn(accountId);
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
            subtitle="Everything Flightpath can send from. Change a limit or disconnect anything here."
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
                />
                <div className="px-4 pb-[10px] pt-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  {linkedin.length === 0 ? (
                    <EmptyState>
                      {linkedInConfigured
                        ? "No LinkedIn account connected. Add one in Config to send invites and messages."
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
                        onReconnect={() => void reconnect(account.id)}
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
                />
                <div className="px-4 pb-[10px] pt-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  {mailboxes.length === 0 && domains.length === 0 ? (
                    <EmptyState>
                      No mailbox connected. Connecting one isn&apos;t built yet, so email steps can be planned but not
                      sent.
                    </EmptyState>
                  ) : (
                    <>
                      {mailboxes.map((account) => (
                        <AccountRow
                          key={account.id}
                          account={account}
                          open={editing === account.id}
                          connecting={false}
                          onToggle={() => setEditing(editing === account.id ? null : account.id)}
                          onDisconnect={() => setRemoving(account)}
                          onSaved={snapshot.reload}
                        />
                      ))}
                      {domains.map((domain) => (
                        <DomainRow key={domain.id} domain={domain} />
                      ))}
                    </>
                  )}
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

function GroupHeader({ tile, name, count }: { tile: React.ReactNode; name: string; count: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-[10px] border-b border-border px-4 py-[9px]">
      <div className="flex min-w-0 items-center gap-[10px]">
        {tile}
        <h2 className="font-mono text-[13px] font-bold tracking-[-0.01em]">{name}</h2>
        <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
      </div>
      <Link href={`${SETUP_HREF}/config`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Plus aria-hidden strokeWidth={2.2} />
        Add
      </Link>
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
  const needsAction = account.channel === "linkedin" && linkedInNeedsAction(account.state);
  const label =
    account.channel === "linkedin"
      ? needsAction
        ? linkedInStateNote(account.state)
        : "Connected"
      : account.state === "warming"
        ? `Warming · day ${account.settings.warmDay ?? 1}`
        : "Connected";

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

function DomainRow({ domain }: { domain: SendingDomain }) {
  const missing = missingRecords(domain);
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-divider py-[9px] last:border-b-0">
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-medium text-body">
        DNS
      </span>
      <span className="flex min-w-0 flex-1 basis-[240px] flex-col gap-[2px]">
        <span className="break-all text-[12.5px] font-semibold">{domain.host}</span>
        <span className="text-[11.5px] text-muted-foreground">
          {missing.length === 0
            ? "SPF, DKIM and DMARC all in place"
            : `Add ${missing.join(", ")} at your DNS provider so mail from this domain isn't treated as spam`}
        </span>
      </span>
      <span className="shrink-0">
        <StatusPill tone={missing.length ? "warning" : "success"}>
          {missing.length ? `${missing.length} record${missing.length === 1 ? "" : "s"} missing` : "Verified"}
        </StatusPill>
      </span>
    </div>
  );
}

/**
 * The hosted LinkedIn sign-in sends the member back here with `?connected=<session>` or
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
  const message =
    state === "connected"
      ? "LinkedIn is connected. It appears below."
      : state === "pending"
        ? "Waiting for LinkedIn to confirm the sign-in…"
        : state === "unknown"
          ? "We couldn't read how that sign-in went. Reload to see what connected."
          : state === "expired"
            ? "That sign-in took too long. Start it again from Config."
            : `LinkedIn didn't connect${detail ? `: ${detail}` : "."}`;

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
