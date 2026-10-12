import Link from "next/link";
import { Mark } from "@/components/app/icons";
import { DEMO_HREF, LOGIN_HREF, NAV_LINKS } from "@/lib/site";

/** The floating glass capsule at the top of the marketing page. */
export function SiteNav() {
  return (
    <header className="sitenav pane">
      <span className="logo">
        <span className="mark">
          <Mark />
        </span>
        <span>Flightpath</span>
      </span>

      <nav aria-label="Sections">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>

      <span className="sp" />

      <Link className="btn line" href={LOGIN_HREF}>
        Sign in
      </Link>
      <Link className="btn pri" href={DEMO_HREF}>
        Book a demo
      </Link>
    </header>
  );
}
