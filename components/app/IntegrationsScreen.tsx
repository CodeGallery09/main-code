"use client";

import { useEffect, useState } from "react";
import { Screen } from "./AppShell";
import { CheckIcon, Glyph } from "./icons";
import { Dot, fmt, Meter, Tabs } from "./ui";
import { CHANNEL } from "@/lib/app/channels";
import {
  GROUPS,
  integrationCounts,
  LINKEDIN_SEATS,
  PROVIDERS,
  SENDING_DOMAINS,
  STATE_TAG,
  type Provider,
} from "@/lib/app/integrations";

type Filter = "all" | "connected" | "available" | "planned";

const inFilter = (p: Provider, f: Filter) =>
  f === "all" ||
  (f === "connected" && (p.state === "connected" || p.state === "attention")) ||
  (f === "available" && p.state === "disconnected") ||
  (f === "planned" && p.state === "planned");

/**
 * Where a workspace connects the accounts Flightpath sends from. LinkedIn and
 * email are live; the rest are marked Planned rather than offered as if they
 * worked today.
 */
export function IntegrationsScreen() {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Provider | null>(null);
  const counts = integrationCounts();

  const countFor = (f: Filter) => PROVIDERS.filter((p) => inFilter(p, f)).length;

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
        <span className="samp">Illustrative demo data</span>
      </div>

      <div className="stats">
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

      {GROUPS.map((group) => {
        const rows = PROVIDERS.filter((p) => p.group === group && inFilter(p, filter));
        if (!rows.length) return null;
        return (
          <div key={group}>
          <section style={{ marginBottom: 22 }}>
            <h2 className="eyebrow" style={{ marginBottom: 10 }}>
              {group}
            </h2>
            <div className="wfgrid">
              {rows.map((p) => (
                <article key={p.k} className="card wfc" style={{ cursor: "default" }}>
                  <header className="between">
                    <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {p.ch && <Dot k={p.ch} off={p.state === "planned"} />}
                      {p.name}
                    </h3>
                    <span className={"tag " + STATE_TAG[p.state].tone}>{STATE_TAG[p.state].label}</span>
                  </header>

                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    {p.blurb}
                  </p>

                  <footer className="between" style={{ fontSize: 12.5 }}>
                    <span className="muted">{p.detail}</span>
                    <button
                      type="button"
                      className={"btn sm " + (p.state === "planned" ? "line" : "pri")}
                      onClick={() => setOpen(p)}
                    >
                      {p.action}
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          </section>

          {/* The two channels that actually run today get their detail right here,
              next to the cards they belong to. */}
          {group === "Channels" && filter !== "planned" && (
            <>
              <LinkedInPanel />
              <EmailPanel />
            </>
          )}
          </div>
        );
      })}

      {open && <ProviderDrawer provider={open} onClose={() => setOpen(null)} />}
    </Screen>
  );
}

function LinkedInPanel() {
  return (
    <section className="card" style={{ padding: 18, marginBottom: 14 }}>
      <header className="between" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15.5, fontWeight: 600 }}>LinkedIn seats</h2>
        <button type="button" className="btn sm line">
          Connect a seat
        </button>
      </header>

      {LINKEDIN_SEATS.map((seat) => (
        <div className="srccard" key={seat.name} style={{ flex: "1 1 auto", marginBottom: 10 }}>
          <span className="srcic" style={{ background: CHANNEL.li.hex }}>
            <Glyph n="li" />
          </span>
          <span className="srcmain">
            <b>{seat.name}</b>
            <small className="muted">{seat.headline}</small>
          </span>
          <span style={{ minWidth: 170 }}>
            <span className="between" style={{ fontSize: 12.5, marginBottom: 5 }}>
              <span className="muted">Invites today</span>
              <span className="num">
                {seat.invitesUsed}/{seat.invitesCap}
              </span>
            </span>
            <Meter value={seat.invitesUsed} max={seat.invitesCap} color={CHANNEL.li.hex} />
          </span>
          <span className="srcacts">
            <span className="tag pos">Healthy</span>
            <small className="muted" style={{ fontSize: 11.5 }}>
              {seat.weekly}/week cap
            </small>
          </span>
        </div>
      ))}

      <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
        Flightpath sends at human pace and stops well inside LinkedIn&rsquo;s own weekly invite limit.
      </p>
    </section>
  );
}

function EmailPanel() {
  const [expanded, setExpanded] = useState<string | null>(
    SENDING_DOMAINS.find((d) => d.state === "pending")?.host ?? null,
  );

  return (
    <section className="card" style={{ padding: 18, marginBottom: 14 }}>
      <header className="between" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15.5, fontWeight: 600 }}>Sending domains</h2>
        <button type="button" className="btn sm line">
          Add a domain
        </button>
      </header>

      {SENDING_DOMAINS.map((domain) => {
        const failing = domain.records.filter((r) => !r.ok).length;
        const isOpen = expanded === domain.host;
        return (
          <div key={domain.host} style={{ marginBottom: 12 }}>
            <div className="srccard" style={{ flex: "1 1 auto" }}>
              <span className="srcic" style={{ background: CHANNEL.mail.hex }}>
                <Glyph n="mail" />
              </span>
              <span className="srcmain">
                <b>{domain.host}</b>
                <small className="muted">
                  {domain.mailboxes.length
                    ? `${domain.mailboxes.length} mailbox${domain.mailboxes.length > 1 ? "es" : ""}`
                    : "No mailboxes yet"}
                  {failing ? ` · ${failing} DNS record${failing > 1 ? "s" : ""} to publish` : " · DNS verified"}
                </small>
              </span>
              <span className="srcacts">
                <span className={"tag " + (domain.state === "verified" && !failing ? "pos" : "hl")}>
                  {domain.state === "verified" && !failing ? "Verified" : "Action needed"}
                </span>
                <button
                  type="button"
                  className="btn xs line"
                  onClick={() => setExpanded(isOpen ? null : domain.host)}
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
                {domain.records.map((record) => (
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
                    Add them at your DNS host, then re-check. Sending stays off for this domain until
                    every record resolves.
                  </div>
                ) : (
                  <p className="oknote">All three records resolve. This domain is clear to send.</p>
                )}
              </div>
            )}

            {domain.mailboxes.length > 0 && (
              <div style={{ padding: "10px 12px 0 12px" }}>
                {domain.mailboxes.map((box) => (
                  <div className="vrow" key={box.address}>
                    <span style={{ fontSize: 13 }}>{box.address}</span>
                    <span className="muted num" style={{ fontSize: 12.5 }}>
                      {fmt(box.day)}/{fmt(box.cap)} per day
                    </span>
                    <span className={"tag " + (box.state === "sending" ? "pos" : "hl")}>
                      {box.state === "sending" ? "Sending" : "Warming"}
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
function ProviderDrawer({ provider, onClose }: { provider: Provider; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const planned = provider.state === "planned";

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
          <span className={"tag " + STATE_TAG[provider.state].tone}>{STATE_TAG[provider.state].label}</span>

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

          {planned && (
            <div className="warnbox" style={{ marginTop: 20 }}>
              <b>Not available yet</b>
              This one is on the roadmap. Ask to be told when it ships and we will email you — nothing
              is connected today.
            </div>
          )}
        </div>

        <footer className="drawer-f">
          <button type="button" className="btn line" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn pri" disabled={planned} title={planned ? "Not available yet" : undefined}>
            {planned ? "Notify me" : provider.action}
          </button>
        </footer>
      </aside>
    </>
  );
}
