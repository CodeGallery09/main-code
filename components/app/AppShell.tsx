"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AnalyticsIcon,
  BellIcon,
  CampaignsIcon,
  ConfigurationIcon,
  HomeIcon,
  InboxIcon,
  IntegrationsIcon,
  LeadsIcon,
  Mark,
  PanelIcon,
  SearchIcon,
  SettingsIcon,
  SignOutIcon,
  WorkflowsIcon,
} from "./icons";
import { api } from "@/lib/api";
import { LOGIN_HREF } from "@/lib/site";
import { CONFIGURATION_HREF, DASHBOARD_NAV, INTEGRATIONS_HREF, SETTINGS_HREF } from "@/lib/nav";
import { TASKS } from "@/lib/app/inbox";
import { CONFIG_ISSUES } from "@/lib/app/configuration";
import { avatarTint, initials } from "@/lib/app/leads";
import { Thumb } from "./ui";
import { UploadLeads } from "./leads/UploadLeads";
import { segmentSaved } from "@/lib/app/segments";

const ICONS = {
  home: HomeIcon,
  inbox: InboxIcon,
  leads: LeadsIcon,
  campaigns: CampaignsIcon,
  workflows: WorkflowsIcon,
  analytics: AnalyticsIcon,
} as const;

/** Counts shown on the rail; the inbox badge is the threads still owed a reply. */
const BADGES: Record<string, number> = {
  "/dashboard": TASKS.length,
  "/dashboard/inbox": 4,
};

export function AppShell({ user, children }: { user: { name: string; org: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tint, ink] = avatarTint(user.name);

  // The deepest matching route wins, so /dashboard only lights up on Home itself.
  const isCurrent = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

  return (
    <div className={"app-shell app" + (collapsed ? " collapsed" : "")}>
      <aside className="side" aria-label="Main navigation">
        <div className="side-top">
          <span className="logo">
            <span className="mark">
              <Mark />
            </span>
            <span>Flightpath</span>
          </span>
          <button
            className="ib sm"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
            onClick={() => setCollapsed((c) => !c)}
          >
            <PanelIcon />
          </button>
        </div>

        <nav className="navlist">
          <Thumb selector=".navi.on" deps={[pathname]} axis="y" variant="navthumb" />
          {DASHBOARD_NAV.map((item) => {
            const Icon = ICONS[item.icon];
            const badge = BADGES[item.href];
            const link = (
              <Link
                className={"navi" + (isCurrent(item.href) ? " on" : "")}
                href={item.href}
                aria-current={isCurrent(item.href) ? "page" : undefined}
              >
                <Icon />
                <span className="lbl">{item.label}</span>
                {badge ? <span className="bdg">{badge}</span> : null}
              </Link>
            );
            // Leads carries a dropdown; hovering or focusing it opens straight away.
            if (item.icon === "leads") {
              return (
                <LeadsNav key={item.href} href={item.href} onUpload={() => setUploading(true)}>
                  {link}
                </LeadsNav>
              );
            }
            return <div key={item.href}>{link}</div>;
          })}
        </nav>

        <span className="grow" />

        <nav className="navlist foot" aria-label="Workspace">
          <Thumb selector=".navi.on" deps={[pathname]} axis="y" variant="navthumb" />
          <Link
            className={"navi" + (isCurrent(CONFIGURATION_HREF) ? " on" : "")}
            href={CONFIGURATION_HREF}
            aria-current={isCurrent(CONFIGURATION_HREF) ? "page" : undefined}
          >
            <ConfigurationIcon />
            <span className="lbl">Configuration</span>
            {CONFIG_ISSUES ? <span className="bdg">{CONFIG_ISSUES}</span> : null}
          </Link>

          <Link
            className={"navi" + (isCurrent(INTEGRATIONS_HREF) ? " on" : "")}
            href={INTEGRATIONS_HREF}
            aria-current={isCurrent(INTEGRATIONS_HREF) ? "page" : undefined}
          >
            <IntegrationsIcon />
            <span className="lbl">Integrations</span>
          </Link>

          <Link
            className={"navi" + (isCurrent(SETTINGS_HREF) ? " on" : "")}
            href={SETTINGS_HREF}
            aria-current={isCurrent(SETTINGS_HREF) ? "page" : undefined}
          >
            <SettingsIcon />
            <span className="lbl">Settings</span>
          </Link>

          <SignOutItem />
        </nav>

        <div className="me">
          <span className="av" style={{ background: tint, color: ink }}>
            {initials(user.name)}
          </span>
          <span>
            <b>{user.name}</b>
            <small>{user.org}</small>
          </span>
        </div>
      </aside>

      {children}

      {uploading && (
        <UploadLeads
          onClose={() => setUploading(false)}
          onSaved={(segment) => segmentSaved(segment)}
        />
      )}

      <TabBar pathname={pathname} isCurrent={isCurrent} />
    </div>
  );
}

/**
 * The Leads row and its dropdown, which opens the moment the row is hovered or
 * focused. The menu is rendered into the document body rather than the rail:
 * the rail scrolls and sits in its own stacking context, so a menu inside it is
 * both clipped and painted under the page.
 */
function LeadsNav({ href, onUpload, children }: { href: string; onUpload: () => void; children: React.ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const shut = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const open = () => {
    if (shut.current) clearTimeout(shut.current);
    const box = row.current?.getBoundingClientRect();
    if (box) setAt({ top: box.top - 6, left: box.right - 6 });
  };
  // A moment's grace, so the pointer can travel from the row to the menu.
  const close = () => {
    if (shut.current) clearTimeout(shut.current);
    shut.current = setTimeout(() => setAt(null), 160);
  };

  const menu = at && (
    <div
      className="qmenu navmenu"
      role="menu"
      aria-label="Leads"
      style={{ top: at.top, left: at.left }}
      onMouseEnter={open}
      onMouseLeave={close}
    >
      <Link className="navmi" role="menuitem" href={href} onClick={() => setAt(null)}>
        All leads
      </Link>
      <button
        className="navmi"
        role="menuitem"
        onClick={() => {
          setAt(null);
          onUpload();
        }}
      >
        Upload leads
      </button>
    </div>
  );

  return (
    <div
      className="navhas"
      ref={row}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") setAt(null);
      }}
    >
      {children}
      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

/** Page chrome shared by every screen: title, search and notifications. */
export function TopBar({ title }: { title: string }) {
  return (
    <header className="top">
      <Link className="mlogo" href="/dashboard" aria-label="Home">
        <span className="mark">
          <Mark />
        </span>
      </Link>
      <h1>{title}</h1>
      <div className="top-r">
        <button className="search" aria-label="Search">
          <SearchIcon />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
        <button className="ib" aria-label="Notifications">
          <BellIcon />
          <span className="dotp" />
        </button>
        <SignOutButton />
      </div>
    </header>
  );
}

/**
 * Ends the session by calling POST /api/logout (via `api.logout()`), which deletes the session
 * row on the server, then sends the user to the sign-in page.
 *
 * It navigates only once the server confirms: if the request fails the session is still live, so
 * pretending to have signed out would leave them logged in on a screen that looks logged out.
 * Shared by the sidebar item and the top-bar icon so the two can never behave differently.
 */
function useSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await api.logout();
    } catch {
      setBusy(false);
      window.alert("Couldn't sign you out. Check your connection and try again.");
      return;
    }
    router.push(LOGIN_HREF);
    router.refresh();
  }

  return { busy, signOut };
}

/**
 * The labelled "Sign out" row at the foot of the sidebar, styled like the other rail items. In a
 * collapsed rail the label hides and the icon remains, which is what `.navi` already does.
 */
function SignOutItem() {
  const { busy, signOut } = useSignOut();

  return (
    <button type="button" className="navi" disabled={busy} onClick={() => void signOut()}>
      <SignOutIcon />
      <span className="lbl">{busy ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}

/**
 * The icon in the top bar. It exists as well as the sidebar item because the sidebar is hidden on
 * phones, and the people testing on a shared machine are the ones who most need to sign out.
 */
function SignOutButton() {
  const { busy, signOut } = useSignOut();

  return (
    <button className="ib" aria-label="Sign out" title="Sign out" disabled={busy} onClick={() => void signOut()}>
      <SignOutIcon />
    </button>
  );
}

/**
 * The scrolling column to the right of the rail.
 *
 * `className` lands on the column itself, so a screen can re-theme its own
 * tokens — Configuration passes `cfg` to wear the marketing site's akkari skin
 * without touching the rail or any other screen.
 */
export function Screen({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={"main" + (className ? " " + className : "")}>
      <TopBar title={title} />
      <div className="scroll">
        <div className="page">{children}</div>
      </div>
    </div>
  );
}


/**
 * Mobile tab bar. The reference styles these as `.tabbar button`, so they are
 * buttons that navigate, with a glass thumb that slides to the current tab.
 */
function TabBar({ pathname, isCurrent }: { pathname: string; isCurrent: (href: string) => boolean }) {
  const router = useRouter();
  return (
    <nav
      className="tabbar"
      aria-label="Sections"
      // The bar splits evenly across however many sections the nav carries.
      style={{ "--tabs": DASHBOARD_NAV.length } as React.CSSProperties}
    >
      <Thumb deps={[pathname]} variant="tabthumb" />
      {DASHBOARD_NAV.map((item) => {
        const Icon = ICONS[item.icon];
        const on = isCurrent(item.href);
        const badge = BADGES[item.href];
        return (
          <button
            key={item.href}
            type="button"
            className={on ? "on" : ""}
            aria-current={on ? "page" : undefined}
            onClick={() => router.push(item.href)}
          >
            <Icon />
            <span className="lbl">{item.label}</span>
            {badge ? <span className="bdg">{badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
