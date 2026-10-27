"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { THUMB } from "@/components/ws/ui/motion";
import { SETUP_HREF } from "@/lib/nav";
import { cn } from "@/lib/ws/utils";
import { useWorkspace } from "./workspace-context";
import { WorkspaceTime } from "./WorkspaceTime";

/** Thin strip at the top of every page: uppercase page name left, workspace time right. No buttons. */
export function TopBar({ title }: { title: string }) {
  const { user } = useWorkspace();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-chrome px-5 py-[10px] sm:px-6">
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{title}</span>
      <WorkspaceTime timeZone={user.timeZone} />
    </div>
  );
}

/** Mono page title + subtitle, with the page's primary actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="mb-[3px] font-mono text-[20px] font-bold tracking-[-0.02em]">{title}</h1>
        {subtitle ? <p className="text-[11.5px] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Standard page padding and vertical rhythm — every screen uses this, so margins line up. At lg and
 * up it takes the height left under the top bar; the one region that should soak up the rest is
 * given `FILL` (components/ws/ui/card.tsx), so the page itself never scrolls.
 */
export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 px-5 pb-6 pt-4 sm:px-6 lg:min-h-0 lg:flex-1", className)}>{children}</div>
  );
}

const SETUP_TABS = [
  { href: SETUP_HREF, label: "Overview" },
  { href: `${SETUP_HREF}/config`, label: "Config" },
  { href: `${SETUP_HREF}/messages`, label: "Messages" },
];

/** Overview · Config · Templates. The Config tab carries the count of things that are broken. */
export function SetupTabs({ right, issues = 0 }: { right?: React.ReactNode; issues?: number }) {
  const pathname = usePathname();
  const still = useReducedMotion();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border bg-chrome px-5 pt-[6px] sm:px-6">
      <nav aria-label="Setup sections" className="flex flex-wrap items-center gap-1">
        {SETUP_TABS.map((t) => {
          const on = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative inline-flex items-center gap-[6px] px-[10px] pb-[8px] pt-[5px] text-[11.5px] transition-colors",
                on ? "font-semibold text-foreground" : "text-[#5b5852] hover:text-foreground",
              )}
            >
              {t.label}
              {t.label === "Config" && issues > 0 ? (
                <span className="rounded-full bg-primary px-[6px] py-px font-mono text-[10.5px] font-medium text-primary-foreground">
                  {issues}
                </span>
              ) : null}
              {on ? (
                <motion.span
                  aria-hidden
                  layoutId={still ? undefined : "setup-tab-underline"}
                  transition={THUMB}
                  className="absolute inset-x-0 bottom-0 h-[2px] bg-foreground"
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
      {right ? <div className="mb-[6px]">{right}</div> : null}
    </div>
  );
}
