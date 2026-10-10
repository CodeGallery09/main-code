"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { DEMO_HREF, LOGIN_HREF, NAV_LINKS } from "@/lib/site";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // A 1px sentinel at the top of the page avoids per-frame scroll handlers.
    const sentinel = document.createElement("div");
    sentinel.style.cssText = "position:absolute;top:0;height:8px;width:1px;pointer-events:none";
    document.body.prepend(sentinel);
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting));
    io.observe(sentinel);
    return () => {
      io.disconnect();
      sentinel.remove();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const mq = window.matchMedia("(min-width: 768px)");
    const onMq = () => mq.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      window.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [open]);

  const solid = scrolled || open;

  return (
    <header
      className={`intro-nav sticky top-0 z-50 border-b transition-colors duration-300 ${
        solid ? "border-line bg-bg/90 backdrop-blur-md" : "border-transparent bg-bg/0"
      }`}
    >
      <nav aria-label="Primary" className="container-page flex h-[var(--nav-h)] items-center justify-between">
        <Link href="/" aria-label="Flightpath home" className="rounded-md">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="rounded-full px-3.5 py-2 text-sm text-ink-2 transition-colors hover:bg-surface hover:text-ink"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            href={LOGIN_HREF}
            className="rounded-full px-3.5 py-2 text-sm text-ink-2 transition-colors hover:bg-surface hover:text-ink"
          >
            Sign in
          </Link>
          <Link href={DEMO_HREF} className="btn btn-primary hidden h-10 sm:inline-flex">
            Book a demo
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-strong text-ink md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      <div id="mobile-menu" hidden={!open} className="border-t border-line bg-bg md:hidden">
        <ul className="container-page flex flex-col py-3">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setOpen(false)}
                className="block border-b border-line py-3.5 text-[15px] text-ink last:border-0"
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li className="pt-4">
            <Link href={LOGIN_HREF} onClick={() => setOpen(false)} className="btn btn-secondary w-full">
              Sign in
            </Link>
          </li>
          <li className="pt-3 pb-2">
            <Link href={DEMO_HREF} onClick={() => setOpen(false)} className="btn btn-primary w-full">
              Book a demo
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
