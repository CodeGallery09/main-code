"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { GROUPS, PROVIDERS, providerView, type ProviderKey, type ProviderView } from "@/lib/app/integrations";
import { SETUP_HREF } from "@/lib/nav";
import type { AccountsSnapshot, Channel } from "@/lib/data/types";
import { CHANNEL_NAME, CHANNEL_ORDER } from "@/lib/ws/channels";
import { useAsync } from "@/lib/ws/use-async";
import { cn, fmt } from "@/lib/ws/utils";
import { PageBody, PageHeader, SetupTabs, TopBar } from "@/components/ws/shell/page";
import { useWorkspace } from "@/components/ws/shell/workspace-context";
import { Card } from "@/components/ws/ui/card";
import { Button, buttonVariants } from "@/components/ws/ui/button";
import { ChannelTile } from "@/components/ws/ui/channel-tile";
import { StatusPill } from "@/components/ws/ui/status-pill";
import { Appear } from "@/components/ws/ui/motion";
import { LoadError, SearchInput, Skeleton, Tag } from "@/components/ws/ui/misc";
import { RulesCards } from "./setup-rules";

/** A tile per provider. Vendor colours, darkened so the white monogram clears 4.5:1. */
const TILE: Record<ProviderKey, { color: string; mono: string }> = {
  linkedin: { color: "var(--ch-linkedin)", mono: "in" },
  email: { color: "var(--ch-email)", mono: "@" },
  waba: { color: "var(--ch-whatsapp)", mono: "wa" },
  twilio: { color: "var(--ch-sms)", mono: "tw" },
  calendar: { color: "var(--ch-google)", mono: "cal" },
  hubspot: { color: "var(--ch-hubspot)", mono: "hs" },
  salesforce: { color: "var(--ch-salesforce)", mono: "sf" },
  webhooks: { color: "var(--ch-neutral)", mono: "{}" },
};

/**
 * Setup · Config — the catalogue of everything that can be connected.
 *
 * A provider's state is derived from the workspace's own accounts, never typed
 * in, and anything the product cannot honour is marked Planned rather than
 * offered as a button that would fail.
 */
export function SetupConfigView({ linkedInConfigured }: { linkedInConfigured: boolean }) {
  const { badges, workspace } = useWorkspace();
  const snapshot = useAsync(() => api.accounts(), []);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [connecting, setConnecting] = useState(false);

  const views = useMemo(
    () =>
      snapshot.state === "ready"
        ? PROVIDERS.map((p) => providerView(p, snapshot.data, linkedInConfigured))
        : [],
    [snapshot.state, snapshot.data, linkedInConfigured],
  );

  const needle = q.trim().toLowerCase();
  const matches = (v: ProviderView) =>
    !needle || v.provider.name.toLowerCase().includes(needle) || v.provider.blurb.toLowerCase().includes(needle);

  async function connect(key: ProviderKey) {
    if (key !== "linkedin") return;
    setConnecting(true);
    try {
      const { url } = await api.connectLinkedIn();
      window.location.assign(url);
    } catch {
      setConnecting(false);
    }
  }

  return (
    <>
      <TopBar title="Setup" />
      <SetupTabs
        issues={badges.config}
        right={<SearchInput id="config-search" placeholder="Search connections" value={q} onChange={setQ} className="w-[260px]" />}
      />
      <PageBody className="gap-[18px]">
        <Appear>
          <PageHeader
            title="Config"
            subtitle="Connect the accounts Flightpath sends from and the tools it talks to. Connect as many as you like."
          />
        </Appear>

        {snapshot.state === "loading" && <Skeleton className="h-[320px] rounded-xl" />}
        {snapshot.state === "failed" && (
          <Card>
            <LoadError message="We couldn't read what's connected." onRetry={snapshot.reload} />
          </Card>
        )}

        {snapshot.state === "ready" && (
          <>
            <Appear index={1}>
              <ChannelStrip snapshot={snapshot.data} />
            </Appear>

            {GROUPS.map((group, i) => {
              const items = views.filter((v) => v.provider.group === group && matches(v));
              if (items.length === 0) return null;
              const shut = collapsed[group];
              return (
                <Appear key={group} index={i + 2}>
                  <Card>
                    <div
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-[10px] px-[18px] py-[14px]",
                        !shut && "border-b border-border",
                      )}
                    >
                      <h2 className="font-mono text-[14.5px] font-bold tracking-[-0.01em]">{group}</h2>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-expanded={!shut}
                        aria-label={shut ? `Show ${group}` : `Hide ${group}`}
                        onClick={() => setCollapsed({ ...collapsed, [group]: !shut })}
                      >
                        {shut ? <ChevronDown aria-hidden strokeWidth={2} /> : <ChevronUp aria-hidden strokeWidth={2} />}
                      </Button>
                    </div>
                    {!shut && (
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(440px,1fr))] gap-x-8 px-[18px] pb-[14px] pt-[6px]">
                        {items.map((v) => (
                          <ProviderRow
                            key={v.provider.k}
                            view={v}
                            connecting={connecting && v.provider.k === "linkedin"}
                            onConnect={() => void connect(v.provider.k)}
                          />
                        ))}
                      </div>
                    )}
                  </Card>
                </Appear>
              );
            })}

            <p className="rounded-[10px] bg-accent px-[15px] py-[13px] text-[12.5px] leading-[1.55] text-muted-foreground">
              Everything connected here belongs to the workspace, so any strategy can use it. Add as many LinkedIn
              accounts or mailboxes as you need — the limits are per account and shared across strategies.
            </p>

            <RulesCards workspace={workspace} index={GROUPS.length + 2} />
          </>
        )}
      </PageBody>
    </>
  );
}

/** Which channels are live, at a glance. Live means an account exists, not that sending is on. */
function ChannelStrip({ snapshot }: { snapshot: AccountsSnapshot }) {
  const connected = new Set(snapshot.accounts.map((a) => a.channel as Channel));
  const live = CHANNEL_ORDER.filter((c) => connected.has(c)).length;

  return (
    <Card className="flex flex-col gap-[13px] px-[17px] py-[15px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
        <h2 className="label-mono">Connected channels</h2>
        <span className="font-mono text-[11.5px] text-body">
          {live} of {CHANNEL_ORDER.length} channels live · {fmt(snapshot.accounts.length)}{" "}
          {snapshot.accounts.length === 1 ? "account" : "accounts"}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-[10px]">
        {CHANNEL_ORDER.map((channel) => {
          const rows = snapshot.accounts.filter((a) => a.channel === channel);
          const on = rows.length > 0;
          return (
            <div
              key={channel}
              className={cn(
                "flex items-center gap-[10px] rounded-[10px] px-3 py-[11px]",
                on ? "border border-border bg-card" : "border border-dashed border-[#d3cfc6]",
              )}
            >
              <ChannelTile channel={channel} muted={!on} />
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className={cn("truncate text-[13px]", on ? "font-semibold" : "font-medium text-body")}>
                  {CHANNEL_NAME[channel]}
                </span>
                <span
                  className={cn("font-mono text-[10.5px] leading-[1.45]", on ? "text-body" : "text-muted-foreground")}
                >
                  {on ? `${fmt(rows.length)} ${rows.length === 1 ? "account" : "accounts"}` : "Not connected"}
                </span>
              </span>
              {on && <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-success" />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ProviderRow({
  view,
  connecting,
  onConnect,
}: {
  view: ProviderView;
  connecting: boolean;
  onConnect: () => void;
}) {
  const { provider, state, detail, action } = view;
  const tile = TILE[provider.k];

  return (
    <div className="flex items-center gap-3 border-b border-secondary py-3">
      <ChannelTile color={tile.color} mono={tile.mono} size="lg" muted={state === "planned"} />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="flex min-w-0 items-center gap-[7px]">
          <span className="truncate text-[13.5px] font-semibold">{provider.name}</span>
          {state === "planned" && <Tag>Planned</Tag>}
        </span>
        <span className="truncate text-[12.5px] text-muted-foreground">{detail || provider.blurb}</span>
      </span>

      {state === "connected" && (
        <span className="flex shrink-0 items-center gap-2">
          <StatusPill tone="success">Connected</StatusPill>
          <Link href={SETUP_HREF} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Manage
          </Link>
        </span>
      )}
      {state === "attention" && (
        <span className="flex shrink-0 items-center gap-2">
          <StatusPill tone="warning">Needs attention</StatusPill>
          <Link href={SETUP_HREF} className={buttonVariants({ variant: "warning", size: "sm" })}>
            Fix
          </Link>
        </span>
      )}
      {state === "disconnected" &&
        (action ? (
          <Button variant="outline" size="icon" disabled={connecting} aria-label={`Connect ${provider.name}`} onClick={onConnect}>
            <Plus aria-hidden strokeWidth={2.2} />
          </Button>
        ) : (
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">Not built yet</span>
        ))}
      {state === "planned" && <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">Roadmap</span>}
    </div>
  );
}
