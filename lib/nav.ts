/** Workspace navigation. Kept next to lib/site.ts so every route label lives in one place. */

/**
 * The six destinations the rail and the phone sheet both carry.
 *
 * Six, not nine: a multichannel strategy *is* a workflow, so Strategies owns the builder and there
 * is no separate Workflows section; Configuration, Integrations and Settings were one subject split
 * three ways and are now the single Setup screen. Analytics has its own place because it is the
 * one report the whole workspace is read through. Below `lg` the rail becomes a sheet, which lists
 * all six, so every screen is reachable on a phone.
 */
export const DASHBOARD_NAV = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/dashboard/inbox", label: "Inbox", icon: "inbox" },
  { href: "/dashboard/audiences", label: "Audiences", icon: "audiences" },
  { href: "/dashboard/strategies", label: "Strategies", icon: "strategies" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "analytics" },
  { href: "/dashboard/configuration", label: "Setup", icon: "configuration" },
] as const;

/** Setup: channels, accounts, rules, team and plan. `/dashboard/settings` and
 *  `/dashboard/integrations` redirect here. */
export const SETUP_HREF = "/dashboard/configuration";

export const CAMPAIGNS_HREF = "/dashboard/strategies";
export const LEADS_HREF = "/dashboard/audiences";
export const INBOX_HREF = "/dashboard/inbox";

export type NavIcon = (typeof DASHBOARD_NAV)[number]["icon"];
