"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DASHBOARD_NAV, SETTINGS_HREF } from "@/lib/nav";
import type { User } from "@/lib/data/types";
import { Avatar } from "@/components/app/ui";
import {
  AnalyticsIcon,
  BellIcon,
  CampaignIcon,
  HomeIcon,
  InboxIcon,
  LeadsIcon,
  LogoutIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
} from "@/components/app/icons";
import { Logo } from "@/components/Logo";

const ICONS = {
  home: HomeIcon,
  inbox: InboxIcon,
  leads: LeadsIcon,
  campaigns: CampaignIcon,
  analytics: AnalyticsIcon,
} as const;

/** Unread counts would come from the API in a real build; the prototype shows the seeded ones. */
const BADGES: Record<string, number> = { "/dashboard": 6, "/dashboard/inbox": 4 };

/** Page title shown in the top bar, derived from the route so pages don't have to pass it. */
function titleFor(pathname: string): string {
  const match = [...DASHBOARD_NAV].reverse().find((item) =>
    item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href),
  );
  if (pathname.startsWith(SETTINGS_HREF)) return "Settings";
  return match?.label ?? "Workspace";
}

export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl-K focuses search, the way every app of this kind behaves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  };

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="app-shell">
      <div className={`app-grid ${collapsed ? "is-collapsed" : ""}`}>
        {/* ---------- rail ---------- */}
        <aside className="app-rail lg-thick lg-sheen">
          <div className="flex items-center justify-between px-1.5">
            <Link href="/" aria-label="Flightpath home" className="rounded-xl">
              <Logo className={collapsed ? "pointer-events-none" : ""} compact={collapsed} />
            </Link>
            {!collapsed && (
              <button
                type="button"
                className="gbtn gbtn-quiet h-8 w-8 !px-0"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
              >
                <SidebarIcon />
              </button>
            )}
          </div>

          {collapsed && (
            <button
              type="button"
              className="gbtn gbtn-quiet mt-3 h-9 w-9 self-center !px-0"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <SidebarIcon />
            </button>
          )}

          <Link
            href="/dashboard/campaigns?new=1"
            className={`gbtn gbtn-solid mt-5 h-10 ${collapsed ? "w-10 self-center !px-0" : "w-full"}`}
          >
            <PlusIcon />
            {!collapsed && "New campaign"}
          </Link>

          <nav aria-label="Workspace" className="mt-5 flex flex-col gap-1">
            {DASHBOARD_NAV.map((item) => {
              const Icon = ICONS[item.icon];
              const badge = BADGES[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${collapsed ? "justify-center !px-0" : ""}`}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon />
                  {!collapsed && (
                    <>
                      <span>{item.label}</span>
                      {badge ? <span className="nav-badge">{badge}</span> : null}
                    </>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-1 pt-4">
            <Link
              href={SETTINGS_HREF}
              className={`nav-item ${collapsed ? "justify-center !px-0" : ""}`}
              aria-current={isActive(SETTINGS_HREF) ? "page" : undefined}
              title={collapsed ? "Settings" : undefined}
            >
              <SettingsIcon />
              {!collapsed && <span>Settings</span>}
            </Link>

            <div className="mt-2 border-t border-black/[0.07] pt-3">
              <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
                <Avatar initials={user.initials} />
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{user.name}</p>
                    <p className="truncate text-[12px] text-muted">{user.org}</p>
                  </div>
                )}
                {!collapsed && (
                  <button
                    type="button"
                    className="gbtn gbtn-quiet h-8 w-8 !px-0"
                    onClick={signOut}
                    aria-label="Sign out"
                    disabled={signingOut}
                  >
                    <LogoutIcon />
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* ---------- main ---------- */}
        <div className="app-main">
          <header className="lg-thick lg-sheen r-xl flex items-center gap-3 px-3.5 py-2.5 sm:px-4">
            <Link href="/" className="lg:hidden" aria-label="Flightpath home">
              <Logo compact />
            </Link>
            <h1 className="hidden shrink-0 text-[19px] font-semibold tracking-[-0.02em] text-ink sm:block">
              {titleFor(pathname)}
            </h1>

            <div className="relative ml-auto w-full max-w-[320px]">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                type="search"
                className="ginput pl-9 pr-12"
                placeholder="Search"
                aria-label="Search the workspace"
              />
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md bg-black/[0.06] px-1.5 py-0.5 font-mono text-[10.5px] text-muted sm:block">
                ⌘K
              </kbd>
            </div>

            <span className="tag-sample hidden md:inline-flex">Demo data</span>

            <button type="button" className="gbtn gbtn-quiet h-9 w-9 shrink-0 !px-0" aria-label="Notifications">
              <BellIcon />
            </button>
            <span className="lg:hidden">
              <Avatar initials={user.initials} />
            </span>
          </header>

          <main id="main" className="flex-1 pb-20 lg:pb-0">
            {children}
          </main>
        </div>
      </div>

      {/* ---------- mobile tab bar ---------- */}
      <nav
        aria-label="Workspace"
        className="lg-thick fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-[22px] px-1.5 py-1.5 lg:hidden"
      >
        {DASHBOARD_NAV.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[16px] px-1 py-1.5 text-[10.5px] font-medium transition-colors ${
                active ? "bg-white/80 text-ink" : "text-muted"
              }`}
            >
              <Icon className="h-[19px] w-[19px]" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
