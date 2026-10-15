"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Screen } from "./AppShell";
import { SampleBanner } from "./SampleBanner";
import { CheckIcon, Glyph, SearchIcon } from "./icons";
import { api } from "@/lib/api";
import { CHANNEL } from "@/lib/app/channels";
import {
  GROUPS,
  PROVIDERS,
  providerView,
  STATE_TAG,
  type ProviderView,
} from "@/lib/app/integrations";
import { CONFIGURATION_HREF } from "@/lib/nav";
import type { AccountsSnapshot } from "@/lib/data/types";

const EMPTY: AccountsSnapshot = { accounts: [], domains: [] };

/** Logo tile: the channel's own colour and glyph where it has one, else a neutral tile with initials. */
function Tile({ view }: { view: ProviderView }) {
  const { provider } = view;
  const ch = provider.ch ? CHANNEL[provider.ch] : null;
  const glyph = provider.k === "linkedin" ? "li" : provider.k === "email" ? "mail" : provider.k === "waba" ? "wa" : provider.k === "twilio" ? "sms" : null;
  const off = view.state === "planned";
  return (
    <span
      className={"intg-tile" + (ch ? "" : " plain")}
      style={ch ? { background: ch.hex, opacity: off ? 0.55 : 1 } : undefined}
      aria-hidden="true"
    >
      {glyph ? <Glyph n={glyph} /> : provider.name.slice(0, 2)}
    </span>
  );
}

function Row({ view, onOpen }: { view: ProviderView; onOpen: (v: ProviderView) => void }) {
  const live = view.state === "connected" || view.state === "attention";
  return (
    <li className="intg-row">
      <Tile view={view} />
      <span className="intg-main">
        <b>
          {view.provider.name}
          {view.state === "planned" && <span className="intg-pill">Planned</span>}
          {view.state === "attention" && <span className="intg-pill warn">{STATE_TAG.attention.label}</span>}
        </b>
        <small>{live ? view.detail : view.provider.blurb}</small>
      </span>
      {live ? (
        <Link className="intg-act manage" href={CONFIGURATION_HREF}>
          Manage
        </Link>
      ) : (
        <button
          type="button"
          className="intg-act"
          onClick={() => onOpen(view)}
          aria-label={`${view.provider.name}: details`}
        >
          <Glyph n="plus" />
        </button>
      )}
    </li>
  );
}

function Section({
  title,
  rows,
  collapsed,
  onToggle,
  onOpen,
}: {
  title: string;
  rows: ProviderView[];
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (v: ProviderView) => void;
}) {
  return (
    <section className="intg-sec">
      <button type="button" className="intg-h" onClick={onToggle} aria-expanded={!collapsed}>
        <span>{title}</span>
        <small>{rows.length}</small>
        <span className={"intg-chev" + (collapsed ? "" : " open")}>
          <Glyph n="chev" />
        </span>
      </button>
      {!collapsed && (
        <ul className="intg-grid">
          {rows.map((v) => (
            <Row key={v.provider.k} view={v} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Where a workspace sees what Flightpath can connect to. Everything already wired up sits on top in
 * "Connected"; the rest is grouped by category below. LinkedIn and email are the two that can
 * connect (connecting itself is not built yet, and says so); the rest are marked Planned rather
 * than offered as if they worked today. State is read from the workspace's own accounts and domains.
 */
export function IntegrationsScreen() {
  const [open, setOpen] = useState<ProviderView | null>(null);
  const [snapshot, setSnapshot] = useState<AccountsSnapshot>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const views = PROVIDERS.map((p) => providerView(p, snapshot)).filter(
      (v) => !q || (v.provider.name + " " + v.provider.blurb + " " + v.provider.group).toLowerCase().includes(q),
    );
    const live = (v: ProviderView) => v.state === "connected" || v.state === "attention";
    return [
      { title: "Connected", rows: views.filter(live) },
      ...GROUPS.map((g) => ({ title: g, rows: views.filter((v) => !live(v) && v.provider.group === g) })),
    ].filter((s) => s.rows.length);
  }, [snapshot, query]);

  const toggle = (title: string) => setCollapsed((c) => ({ ...c, [title]: !c[title] }));

  return (
    <Screen title="Integrations">
      <SampleBanner onRemoved={() => void load()} />

      <div className="intg-bar">
        <p className="muted">Connect the channels your campaigns send from. Anything connected sits at the top.</p>
        <label className="intg-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations"
            aria-label="Search integrations"
          />
        </label>
      </div>

      {error && (
        <p className="empty" role="status">
          {error}{" "}
          <button className="sortb" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      {!loaded && !error && <p className="empty">Loading your integrations…</p>}

      {loaded && (
        <div className="card intg">
          {!error && !sections.some((s) => s.title === "Connected") && !query && (
            <p className="intg-none">Nothing is connected yet. Connecting LinkedIn and email isn&apos;t available yet.</p>
          )}
          {sections.map((s) => (
            <Section
              key={s.title}
              title={s.title}
              rows={s.rows}
              collapsed={!!collapsed[s.title]}
              onToggle={() => toggle(s.title)}
              onOpen={setOpen}
            />
          ))}
          {!sections.length && <p className="empty">Nothing matches &ldquo;{query}&rdquo;.</p>}
        </div>
      )}

      {open && <ProviderDrawer view={open} onClose={() => setOpen(null)} />}
    </Screen>
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
