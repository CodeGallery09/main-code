"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Glass from "./Glass";
import {
  AnalyticsIcon,
  BellIcon,
  CampaignsIcon,
  HomeIcon,
  InboxIcon,
  LeadsIcon,
  Mark,
  PanelIcon,
  SearchIcon,
  SettingsIcon,
} from "./icons";
import { DASHBOARD_NAV, SETTINGS_HREF } from "@/lib/nav";
import { TASKS } from "@/lib/app/inbox";
import { avatarTint, initials } from "@/lib/app/leads";
import { useThumb } from "./ui";

const ICONS = {
  home: HomeIcon,
  inbox: InboxIcon,
  leads: LeadsIcon,
  campaigns: CampaignsIcon,
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
  const [tint, ink] = avatarTint(user.name);

  // The deepest matching route wins, so /dashboard only lights up on Home itself.
  const isCurrent = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

  return (
    <div className={"app-shell app" + (collapsed ? " collapsed" : "")}>
      <Glass />

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

        <Link className="btn pri new" href="/dashboard/campaigns/new" title="New campaign">
          <span className="lbl">New campaign</span>
          <span className="cplus" aria-hidden="true">
            +
          </span>
        </Link>

        <nav className="navlist">
          {DASHBOARD_NAV.map((item) => {
            const Icon = ICONS[item.icon];
            const badge = BADGES[item.href];
            return (
              <Link
                key={item.href}
                className={"navi" + (isCurrent(item.href) ? " on" : "")}
                href={item.href}
                aria-current={isCurrent(item.href) ? "page" : undefined}
              >
                <Icon />
                <span className="lbl">{item.label}</span>
                {badge ? <span className="bdg">{badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <span className="grow" />

        <Link className={"navi" + (isCurrent(SETTINGS_HREF) ? " on" : "")} href={SETTINGS_HREF}>
          <SettingsIcon />
          <span className="lbl">Settings</span>
        </Link>

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

      <TabBar pathname={pathname} isCurrent={isCurrent} />
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
      </div>
    </header>
  );
}

/** The scrolling column to the right of the rail. */
export function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="main">
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
  const ref = useRef<HTMLElement>(null);
  const thumb = useThumb(ref, "button.on", [pathname]);
  return (
    <nav className="tabbar" aria-label="Sections" ref={ref}>
      {thumb && <span className="tabthumb" style={{ transform: `translateX(${thumb.a}px)`, width: thumb.s }} />}
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
            <span>{item.label}</span>
            {badge ? <span className="bdg">{badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
