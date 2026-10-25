"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, Glyph, SearchIcon } from "../icons";
import { api } from "@/lib/api";
import {
  GROUPS,
  PROVIDERS,
  providerView,
  STATE_TAG,
  type ProviderKey,
  type ProviderView,
} from "@/lib/app/integrations";
import type { ConfigTab } from "@/lib/app/configuration";
import { ConnectStatus, useLinkedInConnect } from "../integrations/ConnectLinkedIn";
import type { AccountsSnapshot } from "@/lib/data/types";

const EMPTY: AccountsSnapshot = { accounts: [], domains: [] };

/** Brand colour and mark for each provider's logo tile. Presentation only, so it lives here, not in the catalogue. */
const TILE: Record<ProviderKey, { bg: string; glyph?: string; text?: string }> = {
  linkedin: { bg: "#0A66C2", glyph: "li" },
  email: { bg: "#EA4335", glyph: "mail" },
  waba: { bg: "#25D366", glyph: "wa" },
  twilio: { bg: "#F22F46", glyph: "sms" },
  calendar: { bg: "#4285F4", text: "CA" },
  hubspot: { bg: "#FF7A59", text: "HS" },
  salesforce: { bg: "#00A1E0", text: "SF" },
  webhooks: { bg: "#111418", text: "WH" },
};

function Tile({ view }: { view: ProviderView }) {
  const t = TILE[view.provider.k];
  return (
    <span className="intg-tile" style={{ background: t.bg }} aria-hidden="true">
      {t.glyph ? <Glyph n={t.glyph} /> : t.text}
    </span>
  );
}

function Row({
  view,
  onOpen,
  go,
}: {
  view: ProviderView;
  onOpen: (v: ProviderView) => void;
  go: (tab: ConfigTab) => void;
}) {
  const live = view.state === "connected" || view.state === "attention";
  /** A connected provider is managed on its own channel tab, which is one tab away now. */
  const manageTab: ConfigTab = view.provider.k === "email" ? "mail" : "li";
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
        <button type="button" className="intg-manage" onClick={() => go(manageTab)}>
          Manage
        </button>
      ) : (
        <button type="button" className="intg-plus" onClick={() => onOpen(view)} aria-label={`${view.provider.name}: details`}>
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
  go,
}: {
  title: string;
  rows: ProviderView[];
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (v: ProviderView) => void;
  go: (tab: ConfigTab) => void;
}) {
  return (
    <section className="intg-sec">
      <button type="button" className="intg-h" onClick={onToggle} aria-expanded={!collapsed}>
        <span>{title}</span>
        <span className={"intg-chev" + (collapsed ? "" : " open")}>
          <Glyph n="chev" />
        </span>
      </button>
      {!collapsed && (
        <ul className="intg-grid">
          {rows.map((v) => (
            <Row key={v.provider.k} view={v} onOpen={onOpen} go={go} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Setup · Connections — what Flightpath can connect to.
 *
 * This was its own rail destination ("Integrations"), with a tab strip across Configuration,
 * Integrations and Settings that gave away that the three were one subject. It is now a tab of
 * Setup, so "Manage" switches tab rather than navigating to another screen.
 *
 * A workspace-id row on top, then collapsible sections of two-column rows. Everything already
 * wired up sits in "Connected" first; the rest is grouped by category below. LinkedIn is the one
 * provider that genuinely connects; the rest are marked Planned or say connecting is not built,
 * rather than offered as if they worked today. State is read from the workspace's own accounts
 * and domains.
 */
export function Connections({
  linkedInConfigured = false,
  go,
}: {
  linkedInConfigured?: boolean;
  go: (tab: ConfigTab) => void;
}) {
  const [open, setOpen] = useState<ProviderView | null>(null);
  const [snapshot, setSnapshot] = useState<AccountsSnapshot>(EMPTY);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  /** What to say after coming back from the provider's hosted sign-in in this same tab. */
  const [returned, setReturned] = useState<string | null>(null);

  async function load() {
    try {
      const [accounts, ws] = await Promise.all([api.accounts(), api.workspace()]);
      setSnapshot(accounts);
      setWorkspaceId(ws.workspace.id);
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

  /**
   * The provider's redirect lands here with `?connected=<session>`. Normally it lands in the popup
   * and the opener is already polling — but a blocked popup means the sign-in happened in this tab,
   * and then this is the only thing that knows it finished. Either way the session is the source of
   * truth, not the query string: a pasted `?connected=` proves nothing.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("connected") ?? params.get("failed");
    if (!id) return;
    let live = true;
    void (async () => {
      try {
        const { session } = await api.connectSession(id);
        if (!live) return;
        setReturned(
          session.state === "connected"
            ? "LinkedIn account connected."
            : session.detail || "That sign-in didn't complete.",
        );
        if (session.state === "connected") await load();
      } catch {
        /* an id that is not ours tells the user nothing, so it says nothing */
      }
    })();
    // Leave the page on a clean URL so a reload does not replay the message.
    window.history.replaceState(null, "", window.location.pathname);
    return () => {
      live = false;
    };
  }, []);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const views = PROVIDERS.map((p) => providerView(p, snapshot, linkedInConfigured)).filter(
      (v) => !q || (v.provider.name + " " + v.provider.blurb + " " + v.provider.group).toLowerCase().includes(q),
    );
    const live = (v: ProviderView) => v.state === "connected" || v.state === "attention";
    return [
      { title: "Connected", rows: views.filter(live) },
      ...GROUPS.map((g) => ({ title: g, rows: views.filter((v) => !live(v) && v.provider.group === g) })),
    ].filter((s) => s.rows.length);
  }, [snapshot, query, linkedInConfigured]);

  const toggle = (title: string) => setCollapsed((c) => ({ ...c, [title]: !c[title] }));

  async function copyId() {
    if (!workspaceId) return;
    try {
      await navigator.clipboard.writeText(workspaceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: nothing to do, the id is selectable on screen */
    }
  }

  return (
    <>
      <div className="intg-top">
        <label className="intg-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations…"
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

      {returned && (
        <p className="empty" role="status">
          {returned}
        </p>
      )}

      {!loaded && !error && <p className="empty">Loading your integrations…</p>}

      {loaded && (
        <div className="card intg">
          <div className="intg-id">
            <span>
              <b>Workspace ID</b>
              <code>{workspaceId ?? "—"}</code>
            </span>
            <button type="button" className="intg-copy" onClick={() => void copyId()} aria-label="Copy workspace ID" disabled={!workspaceId}>
              {copied ? <CheckIcon /> : <Glyph n="copy" />}
            </button>
          </div>

          {sections.map((s) => (
            <Section
              key={s.title}
              title={s.title}
              rows={s.rows}
              collapsed={!!collapsed[s.title]}
              onToggle={() => toggle(s.title)}
              onOpen={setOpen}
              go={go}
            />
          ))}
          {!sections.length && <p className="empty">Nothing matches &ldquo;{query}&rdquo;.</p>}
        </div>
      )}

      {open && <ProviderDrawer view={open} onClose={() => setOpen(null)} onConnected={() => void load()} />}
    </>
  );
}

/** Slide-over explaining what connecting does, before anything is authorised. */
function ProviderDrawer({
  view,
  onClose,
  onConnected,
}: {
  view: ProviderView;
  onClose: () => void;
  onConnected: () => void;
}) {
  const { provider } = view;
  const connect = useLinkedInConnect(onConnected);
  // LinkedIn is the one provider whose Connect button does something; every other row is either
  // planned or has no connection flow built, and still says so.
  const canConnect = provider.k === "linkedin" && view.action === "Connect";
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

          {canConnect ? (
            <div className="warnbox" style={{ marginTop: 20 }}>
              <b>Signing in happens on LinkedIn</b>
              Connecting opens LinkedIn&apos;s own sign-in in a new window. Flightpath never sees the
              password or the two-factor code. Nothing is sent from the account until a sender ships —
              connecting only lets Flightpath read replies and report the account&apos;s health.
            </div>
          ) : (
            <div className="warnbox" style={{ marginTop: 20 }}>
              <b>Not available yet</b>
              {planned
                ? "This one is on the roadmap. Nothing is connected today."
                : provider.k === "linkedin"
                  ? "This deployment has no LinkedIn provider configured, so a sign-in can't be opened yet."
                  : "Connecting isn't available yet. Campaigns you build now will use this once you can connect it."}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <ConnectStatus phase={connect.phase} />
          </div>
        </div>

        <footer className="drawer-f">
          <button type="button" className="btn line" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn pri"
            disabled={!canConnect || connect.busy}
            title={canConnect ? undefined : "Not available yet"}
            onClick={canConnect ? () => void connect.start() : undefined}
          >
            {planned ? "Planned" : connect.busy ? "Connecting…" : "Connect"}
          </button>
        </footer>
      </aside>
    </>
  );
}
