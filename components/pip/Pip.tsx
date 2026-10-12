"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEMO_HREF } from "@/lib/site";
import { PIP_SVG } from "./pipSvg";
import { startPip, type PipHandle } from "./engine";

/** Pip lives in the root layout so he follows visitors across pages — but he is a guide for the
 *  marketing site, so he stays out of the signed-in workspace. */
export function Pip() {
  const rootRef = useRef<HTMLDivElement>(null);
  const handle = useRef<PipHandle | null>(null);
  const pathname = usePathname();
  const firstPath = useRef(pathname);

  useEffect(() => {
    if (!rootRef.current) return;
    handle.current = startPip(rootRef.current);
    return () => {
      handle.current?.dispose();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = pathname;
    handle.current?.routeChanged();
  }, [pathname]);

  if (pathname?.startsWith("/dashboard")) return null;

  return (
    <div ref={rootRef}>
      <div className="glassfx" aria-hidden="true" />
      <div className="pip bub-r">
        <div className="pip-bubble">
          <span data-pip-text />
          <Link className="pip-act" href={DEMO_HREF}>
            Book a demo →
          </Link>
        </div>
        <div className="pip-fly">
          <button
            className="pip-body"
            type="button"
            aria-label="Pip, the website's resident bird. Press for a joke."
            dangerouslySetInnerHTML={{ __html: PIP_SVG }}
          />
        </div>
        <span className="sr-only" aria-live="polite" data-pip-live />
      </div>
    </div>
  );
}
