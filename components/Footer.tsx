import Link from "next/link";
import { DEMO_HREF, NAV_LINKS } from "@/lib/site";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-muted">
            GTM workflow orchestration for SMB sales teams. Coordinated, engagement-aware, benchmarked.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="eyebrow">Explore</p>
          <ul className="mt-4 space-y-2.5 text-[14px]">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-ink-2 transition-colors hover:text-accent-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="eyebrow">Talk to us</p>
          <ul className="mt-4 space-y-2.5 text-[14px]">
            <li>
              <Link href={DEMO_HREF} className="text-ink-2 transition-colors hover:text-accent-ink">
                Book a demo
              </Link>
            </li>
            <li>
              <a href="#top" className="text-ink-2 transition-colors hover:text-accent-ink">
                Back to top
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="container-page flex flex-col gap-2 border-t border-line py-6 text-[12.5px] text-muted sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Flightpath. All rights reserved.</p>
        <p>Product visuals use illustrative sample data.</p>
      </div>
    </footer>
  );
}
