import type { ReactNode } from "react";

/**
 * Wraps every marketing page (`/`, `/book-demo`, `/login`, `/signup`).
 *
 * It exists to carry one class. `app/globals.css` is loaded app-wide, the
 * dashboard included, so the dark palette cannot live on `:root` — it is
 * scoped to `.site`, and only the pages that render this frame get it.
 * `.site::before` paints the deep-space ground over `body::before`'s wallpaper.
 */
export function SiteFrame({ children }: { children: ReactNode }) {
  return <div className="site">{children}</div>;
}
