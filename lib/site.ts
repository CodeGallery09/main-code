// Dedicated demo-request page (app/book-demo). Delivery is configured server-side — see .env.example.
export const DEMO_HREF = "/book-demo";

export const NAV_LINKS = [
  { label: "Customer journey", href: "/#journey" },
  { label: "Why Flightpath", href: "/#why" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Talk to founders", href: "/#founders" },
] as const;
