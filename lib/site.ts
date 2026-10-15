// Dedicated demo-request page (app/book-demo). Delivery is configured server-side — see .env.example.
export const DEMO_HREF = "/book-demo";

export const NAV_LINKS = [
  { label: "Customer journey", href: "/#journey" },
  { label: "Why Flightpath", href: "/#why" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Talk to founders", href: "/#founders" },
] as const;

// Auth: invite-only accounts backed by the database (lib/auth.ts); with no DATABASE_URL only the
// hardcoded demo account can sign in and sign-up reports that it is unavailable.
export const LOGIN_HREF = "/login";
export const SIGNUP_HREF = "/signup";
export const DASHBOARD_HREF = "/dashboard";
/** Where a brand-new account lands: its sample campaign is here, and "Create campaign" is the next step. */
export const FIRST_RUN_HREF = "/dashboard/campaigns";
