"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Screen } from "./AppShell";
import { SampleBanner } from "./SampleBanner";
import { CheckIcon, Glyph } from "./icons";
import { Dot, fmt, Meter, Tabs } from "./ui";
import { api } from "@/lib/api";
import { CHANNEL } from "@/lib/app/channels";
import {
  GROUPS,
  integrationCounts,
  PROVIDERS,
  providerView,
  STATE_TAG,
  type ProviderView,
} from "@/lib/app/integrations";
import { CONFIGURATION_HREF } from "@/lib/nav";
import type { AccountsSnapshot, EmailAccount, LinkedInAccount, SendingDomain } from "@/lib/data/types";

type Filter = "all" | "connected" | "available" | "planned";

const inFilter = (v: ProviderView, f: Filter) =>
  f === "all" ||
  (f === "connected" && (v.state === "connected" || v.state === "attention")) ||
  (f === "available" && v.state === "disconnected") ||
  (f === "planned" && v.state === "planned");

const EMPTY: AccountsSnapshot = { accounts: [], domains: [] };

/**
 * Where a workspace sees the accounts Flightpath sends from. LinkedIn and email
 * are the two that can connect (connecting itself is not built yet, and says
 * so); the rest are marked Planned rather than offered as if they worked today.
 * Everything shown is read from the workspace's own accounts and domains.
 */
export function IntegrationsScreen() {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<ProviderView | null>(null);
  const [snapshot, setSnapshot] = useState<AccountsSnapshot>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setSnapshot(await api.accounts());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your integrations.");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const views = useMemo(() => PROVIDERS.map((p) => providerView(p, snapshot)), [snapshot]);
  const counts = integrationCounts(views);
  const countFor = (f: Filter) => views.filter((v) => inFilter(v, f)).length;

  return (
    <Screen title="Integrations">
      <div className="wfhead">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          items={[
            ["all", "All", countFor("all")],
            ["connected", "Connected", countFor("connected")],
            ["available", "Available", countFor("available")],
            ["planned", "Planned", countFor("planned")],
          ]}
        />
      </div>

      <SampleBanner onRemoved={() => void load()} />

      {error && (
        <p className="empty" role="status">
          {error}{" "}
          <button className="sortb" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      <div className="stats" hidden={!loaded}>
        <div className="card stat">
          <small>Connected</small>
          <b className="v">{counts.connected}</b>
        </div>
        <div className="card stat">
          <small>Needs attention</small>
          <b className="v">{counts.attention}</b>
        </div>
        <div className="card stat">
          <small>Available</small>
          <b className="v">{counts.available}</b>
        </div>
        <div className="card stat">
          <small>Planned</small>
          <b className="v">{counts.planned}</b>
        </div>
      </div>

      {!loaded && !error && <p className="empty">Loading your integrations…</p>}

      {loaded && GROUPS.map((group) => {
        const rows = views.filter((v) => v.provider.group === group && inFilter(v, filter));
        if (!rows.length) return null;
        return (
          <div key={group}>
          <section style={{ marginBottom: 22 }}>
            <h2 className="eyebrow" style={{ marginBottom: 10 }}>
              {group}
            </h2>
            <div className="wfgrid">
              {rows.map((v) => (
                <article key={v.provider.k} className="card wfc" style={{ cursor: "default" }}>
                  <header className="between">
                    <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {v.provider.ch && <Dot k={v.provider.ch} off={v.state === "planned"} />}
                      {v.provider.name}
                    </h3>
                    <span className={"tag " + STATE_TAG[v.state].tone}>{STATE_TAG[v.state].label}</span>
                  </header>

                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    {v.provider.blurb}
                  </p>

                  <footer className="between" style={{ fontSize: 12.5 }}>
                    <span className="muted">{v.detail}</span>
                    {v.action ? (
                      <Link className="btn sm pri" href={CONFIGURATION_HREF}>
                        {v.action}
                      </Link>
                    ) : (
                      <button type="button" className="btn sm line" onClick={() => setOpen(v)}>
                        Details
                      </button>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          </section>

          {/* The two channels that actually run today get their detail right here,
              next to the cards they belong to. */}
          {group === "Channels" && filter !== "planned" && (
            <>
              <LinkedInPanel seats={snapshot.accounts.filter((a): a is LinkedInAccount => a.channel === "linkedin")} loaded={loaded} />
              <EmailPanel snapshot={snapshot} loaded={loaded} />
            </>
          )}
          </div>
        );
      })}

      {open && <ProviderDrawer view={open} onClose={() => setOpen(null)} />}
    </Screen>
  );
}

function LinkedInPanel({ seats, loaded }: { seats: LinkedInAccount[]; loaded: boolean }) {
  return (
    <section className="card" style={{ padding: 18, marginBottom: 14 }}>
      <header className="between" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15.5, fontWeight: 600 }}>LinkedIn accounts</h2>
        <button type="button" className="btn sm line" disabled title="Connecting isn't available yet">
          Connect an account
        </button>
      </header>

      {loaded && seats.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>
          No LinkedIn account is connected. Connecting isn&apos;t available yet; campaigns you build now will use
          any account you connect later.
        </p>
      )}

      {seats.map((seat) => {
        const out = seat.state === "signed_out";
        return (
          <div className="srccard" key={seat.id} style={{ flex: "1 1 auto", marginBottom: 10 }}>
            <span className="srcic" style={{ background: CHANNEL.li.hex }}>
              <Glyph n="li" />
            </span>
            <span className="srcmain">
              <b>
                {seat.name}
                {seat.isSample && (
                  <span className="tag" style={{ marginLeft: 6 }}>
                    Sample
                  </span>
                )}
              </b>
              <small className="muted">{seat.handle}</small>
            </span>
            <span style={{ minWidth: 170 }}>
              <span className="between" style={{ fontSize: 12.5, marginBottom: 5 }}>
                <span className="muted">Invites per day</span>
                <span className="num">{seat.settings.connections}</span>
              </span>
              <Meter value={seat.settings.connections} max={30} color={CHANNEL.li.hex} />
            </span>
            <span className="srcacts">
              <span className={"tag " + (out ? "hl" : "pos")}>{out ? "Log in again" : "Healthy"}</span>
              <small className="muted" style={{ fontSize: 11.5 }}>
                Used by {seat.campaignIds.length} {seat.campaignIds.length === 1 ? "campaign" : "campaigns"}
              </small>
            </span>
          </div>
        );
      })}

      <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
        Accounts belong to your workspace, and any number of campaigns can send from one. Flightpath sends at human
        pace and stays inside LinkedIn&rsquo;s own weekly invite limit.
      </p>
    </section>
  );
}

const recordsOf = (d: SendingDomain) => [
  { type: "TXT", host: "@ (SPF)", ok: d.spf },
  { type: "CNAME", host: "fp._domainkey (DKIM)", ok: d.dkim },
  { type: "TXT", host: "_dmarc (DMARC)", ok: d.dmarc },
];

function EmailPanel({ snapshot, loaded }: { snapshot: AccountsSnapshot; loaded: boolean }) {
  const mailboxes = snapshot.accounts.filter((a): a is EmailAccount => a.channel === "email");
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section className="card" style={{ padding: 18, marginBottom: 14 }}>
      <header className="between" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15.5, fontWeight: 600 }}>Sending domains</h2>
        <button type="button" className="btn sm line" disabled title="Connecting isn't available yet">
          Add a domain
        </button>
      </header>

      {loaded && snapshot.domains.length === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>
          No sending domain or mailbox is connected. Connecting isn&apos;t available yet; campaigns you build now will
          use any mailbox you connect later.
        </p>
      )}

      {snapshot.domains.map((domain) => {
        const records = recordsOf(domain);
        const failing = records.filter((r) => !r.ok).length;
        const isOpen = expanded === domain.id;
        const onDomain = mailboxes.filter((m) => m.handle.endsWith("@" + domain.host));
        return (
          <div key={domain.id} style={{ marginBottom: 12 }}>
            <div className="srccard" style={{ flex: "1 1 auto" }}>
              <span className="srcic" style={{ background: CHANNEL.mail.hex }}>
                <Glyph n="mail" />
              </span>
              <span className="srcmain">
                <b>
                  {domain.host}
                  {domain.isSample && (
                    <span className="tag" style={{ marginLeft: 6 }}>
                      Sample
                    </span>
                  )}
                </b>
                <small className="muted">
                  {onDomain.length
                    ? `${onDomain.length} mailbox${onDomain.length > 1 ? "es" : ""}`
                    : "No mailboxes yet"}
                  {failing ? ` · ${failing} DNS record${failing > 1 ? "s" : ""} to publish` : " · DNS verified"}
                </small>
              </span>
              <span className="srcacts">
                <span className={"tag " + (failing ? "hl" : "pos")}>{failing ? "Action needed" : "Verified"}</span>
                <button
                  type="button"
                  className="btn xs line"
                  onClick={() => setExpanded(isOpen ? null : domain.id)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? "Hide DNS" : "View DNS"}
                </button>
              </span>
            </div>

            {isOpen && (
              <div style={{ padding: "12px 12px 0 12px" }}>
                <div className="mapr head">
                  <span>Record</span>
                  <span>Host</span>
                </div>
                {records.map((record) => (
                  <div className="vrow" key={record.host}>
                    <span className="num">{record.type}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      {record.host}
                    </span>
                    <span className={"tag " + (record.ok ? "pos" : "hl")}>
                      {record.ok ? (
                        <>
                          <CheckIcon /> Found
                        </>
                      ) : (
                        "Not found"
                      )}
                    </span>
                  </div>
                ))}
                {failing > 0 ? (
                  <div className="warnbox" style={{ marginTop: 12 }}>
                    <b>Publish the missing records</b>
                    Add them at your DNS host. Sending stays off for this domain until every record resolves.
                  </div>
                ) : (
                  <p className="oknote">All three records resolve. This domain is clear to send.</p>
                )}
              </div>
            )}

            {onDomain.length > 0 && (
              <div style={{ padding: "10px 12px 0 12px" }}>
                {onDomain.map((box) => (
                  <div className="vrow" key={box.id}>
                    <span style={{ fontSize: 13 }}>{box.handle}</span>
                    <span className="muted num" style={{ fontSize: 12.5 }}>
                      {fmt(box.settings.cap)} per day
                    </span>
                    <span className={"tag " + (box.state === "warm" ? "pos" : "hl")}>
                      {box.state === "warm" ? "Warm" : "Warming"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Slide-over explaining what connecting does, before anything is authorised. */
function ProviderDrawer({ view, onClose }: { view: ProviderView; onClose: () => void }) {
  const { provider } = view;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const planned = view.state === "planned";

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="int-title">
        <header className="drawer-h">
          <b id="int-title">{provider.name}</b>
          <button type="button" className="ib sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="drawer-b">
          <span className={"tag " + STATE_TAG[view.state].tone}>{STATE_TAG[view.state].label}</span>

          <p style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 12 }}>{provider.blurb}</p>

          <h3 className="eyebrow" style={{ marginTop: 20, marginBottom: 8 }}>
            How it connects
          </h3>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
            {provider.how}
          </p>

          <h3 className="eyebrow" style={{ marginTop: 20, marginBottom: 8 }}>
            What Flightpath does
          </h3>
          <ul style={{ display: "grid", gap: 8 }}>
            {provider.scopes.map((scope) => (
              <li key={scope} style={{ display: "flex", gap: 9, fontSize: 13, lineHeight: 1.5 }}>
                <CheckIcon />
                <span>{scope}</span>
              </li>
            ))}
          </ul>

          <div className="warnbox" style={{ marginTop: 20 }}>
            <b>Not available yet</b>
            {planned
              ? "This one is on the roadmap. Nothing is connected today."
              : "Connecting isn't available yet. Campaigns you build now will use this once you can connect it."}
          </div>
        </div>

        <footer className="drawer-f">
          <button type="button" className="btn line" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn pri" disabled title="Not available yet">
            {planned ? "Planned" : "Connect"}
          </button>
        </footer>
      </aside>
    </>
  );
}
