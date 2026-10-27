import { ChartColumn, House, Inbox, SlidersHorizontal, Send, Users, type LucideIcon } from "lucide-react";
import { DASHBOARD_NAV, type NavIcon } from "@/lib/nav";

const ICONS: Record<NavIcon, LucideIcon> = {
  home: House,
  inbox: Inbox,
  audiences: Users,
  strategies: Send,
  analytics: ChartColumn,
  configuration: SlidersHorizontal,
};

/**
 * The six destinations, straight off lib/nav.ts so the rail, the mobile sheet
 * and the builder's icon rail can never drift apart.
 *
 * Badge rule: `info` is a grey count of things to look at (conversations
 * waiting on a reply); `action` is a black count of things that are broken
 * (setup issues). Don't swap them.
 */
export type NavEntry = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "inbox" | "config";
  tone?: "info" | "action";
};

export const NAV: NavEntry[] = DASHBOARD_NAV.map((item) => ({
  href: item.href,
  label: item.label,
  icon: ICONS[item.icon],
  ...(item.icon === "inbox" ? { badge: "inbox" as const, tone: "info" as const } : {}),
  ...(item.icon === "configuration" ? { badge: "config" as const, tone: "action" as const } : {}),
}));

/**
 * The deepest matching route wins, so Home only lights up on Home itself.
 * The builder lives under /dashboard/workflows/:id but belongs to Strategies,
 * which is the list it was opened from.
 */
const ALSO: Record<string, string[]> = { "/dashboard/strategies": ["/dashboard/workflows"] };

export const isCurrent = (href: string, pathname: string) =>
  href === "/dashboard"
    ? pathname === href
    : pathname.startsWith(href) || (ALSO[href] ?? []).some((p) => pathname.startsWith(p));
