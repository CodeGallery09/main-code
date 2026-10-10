// Dedicated demo-request page (app/book-demo). Delivery is configured server-side — see .env.example.
export const DEMO_HREF = "/book-demo";

export const NAV_LINKS = [
  { label: "Product", href: "/#product" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Why Flightpath", href: "/#why" },
] as const;

// Auth is a prototype: only the hardcoded account in lib/auth.ts can sign in; sign-up is a dummy form.
export const LOGIN_HREF = "/login";
export const SIGNUP_HREF = "/signup";
export const DASHBOARD_HREF = "/dashboard";
