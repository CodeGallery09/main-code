"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Send } from "lucide-react";
import { isCurrent, NAV } from "./nav";
import { useWorkspace } from "./workspace-context";
import { useSignOut } from "./use-sign-out";
import { cn } from "@/lib/ws/utils";

/**
 * Badge rule: grey is an informational count (conversations needing a
 * person); black means something is broken and needs action.
 */
function NavBadge({ n, tone }: { n: number; tone: "info" | "action" }) {
  return (
    <span
      className={cn(
        "rounded-full px-[7px] py-[2px] font-mono text-[11px] font-medium",
        tone === "action" ? "bg-primary text-primary-foreground" : "bg-[#eae7e0] text-body",
      )}
    >
      {n}
    </span>
  );
}

export function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-[10px]">
      <span className="flex size-[24px] items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Send aria-hidden className="size-[13px]" strokeWidth={1.8} />
      </span>
      {!collapsed && <span className="font-mono text-[13.5px] font-bold tracking-[-0.01em]">Flightpath</span>}
    </span>
  );
}

function useBadgeCounts() {
  const { badges } = useWorkspace();
  return { inbox: badges.inbox, config: badges.config } as const;
}

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const counts = useBadgeCounts();

  return (
    <nav aria-label="Main" className="flex flex-col gap-[2px]">
      {NAV.map((item) => {
        const active = isCurrent(item.href, pathname);
        const Icon = item.icon;
        const count = item.badge ? counts[item.badge] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-[32px] items-center gap-[9px] rounded-lg px-[9px] text-[13px] transition-colors hover:bg-accent",
              active ? "bg-muted font-medium text-foreground" : "text-body",
            )}
          >
            <Icon aria-hidden className="size-[15px]" strokeWidth={1.7} />
            <span className="flex-1">{item.label}</span>
            {item.badge && count > 0 ? <NavBadge n={count} tone={item.tone ?? "info"} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function SignOutItem() {
  const { busy, failed, signOut } = useSignOut();
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void signOut()}
        className="flex h-[32px] items-center gap-[9px] rounded-lg px-[9px] text-[13px] text-body transition-colors hover:bg-accent disabled:opacity-60"
      >
        <LogOut aria-hidden className="size-[15px]" strokeWidth={1.7} />
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {failed ? (
        <span role="alert" className="px-[11px] text-[11px] text-warning">
          We couldn&apos;t end the session. Check your connection and try again.
        </span>
      ) : null}
    </div>
  );
}

export function AccountCard() {
  const { user, workspace } = useWorkspace();
  return (
    <div className="flex items-center gap-[10px] rounded-[10px] border border-border bg-card px-[11px] py-[10px]">
      <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[11px] font-medium">
        {user.initials}
      </span>
      <span className="flex min-w-0 flex-col leading-[1.3]">
        <span className="truncate text-[12px] font-medium">{user.name}</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {workspace.name} · {workspace.plan}
        </span>
      </span>
    </div>
  );
}

/** The 216px sidebar. Desktop only; below 1024px the shell shows a top bar and a sheet instead. */
export function Sidebar() {
  return (
    <aside className="hidden w-[216px] shrink-0 flex-col gap-4 border-r border-border bg-chrome px-3 pb-3 pt-4 lg:flex lg:h-full lg:overflow-y-auto">
      <div className="flex items-center justify-between gap-2 px-[6px] py-[2px]">
        <Brand />
      </div>
      <NavList />
      <div className="flex-1" />
      <div className="flex flex-col gap-[10px]">
        <SignOutItem />
        <AccountCard />
      </div>
    </aside>
  );
}

/** 60px icon-only rail — the builder uses it so the plan gets the width. */
export function SidebarRail() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="hidden shrink-0 basis-[60px] flex-col items-center gap-[6px] border-r border-border bg-chrome py-[10px] sm:flex"
    >
      <span className="mb-[10px]">
        <Brand collapsed />
      </span>
      {NAV.map((item) => {
        const active = isCurrent(item.href, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex size-[36px] items-center justify-center rounded-lg transition-colors hover:bg-accent",
              active ? "bg-muted text-foreground" : "text-body",
            )}
          >
            <Icon aria-hidden className="size-[18px]" strokeWidth={1.7} />
          </Link>
        );
      })}
    </nav>
  );
}
