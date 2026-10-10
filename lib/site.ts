// Dedicated demo-request page (app/book-demo). Delivery is configured server-side — see .env.example.
export const DEMO_HREF = "/book-demo";

export const NAV_LINKS = [
  { label: "Product", href: "/#product" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Why Flightpath", href: "/#why" },
] as const;
