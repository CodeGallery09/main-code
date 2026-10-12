/** Workspace navigation. Kept next to lib/site.ts so every route label lives in one place. */

export const DASHBOARD_NAV = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/dashboard/inbox", label: "Inbox", icon: "inbox" },
  { href: "/dashboard/leads", label: "Leads", icon: "leads" },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: "campaigns" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "analytics" },
] as const;

export const SETTINGS_HREF = "/dashboard/settings";

export type NavIcon = (typeof DASHBOARD_NAV)[number]["icon"];
