/** Workspace navigation. Kept next to lib/site.ts so every route label lives in one place. */

/**
 * The five destinations the rail and the mobile tab bar both carry.
 *
 * Five, not nine: a multichannel strategy *is* a workflow, so Strategies owns the builder and there
 * is no separate Workflows section; Configuration, Integrations and Settings were one subject split
 * three ways and are now the single Setup screen. Five fits the phone tab bar, which is why the
 * admin screens are reachable on a phone at all — the rail is hidden below 820px.
 */
export const DASHBOARD_NAV = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/dashboard/inbox", label: "Inbox", icon: "inbox" },
  { href: "/dashboard/audiences", label: "Audiences", icon: "audiences" },
  { href: "/dashboard/strategies", label: "Strategies", icon: "strategies" },
  { href: "/dashboard/configuration", label: "Setup", icon: "configuration" },
] as const;

/** Setup: channels, accounts, rules, team and plan. `/dashboard/settings` and
 *  `/dashboard/integrations` redirect here. */
export const SETUP_HREF = "/dashboard/configuration";

/** Analytics is a report, not a place you live: Home links to it. */
export const ANALYTICS_HREF = "/dashboard/analytics";

export const CAMPAIGNS_HREF = "/dashboard/strategies";
export const LEADS_HREF = "/dashboard/audiences";
export const INBOX_HREF = "/dashboard/inbox";

export type NavIcon = (typeof DASHBOARD_NAV)[number]["icon"];
