"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import type { User, Workspace } from "@/lib/data/types";
import { EASE_OUT } from "@/components/ws/ui/motion";
import { AccountCard, Brand, NavList, Sidebar, SignOutItem } from "./sidebar";
import { WorkspaceProvider } from "./workspace-context";

/**
 * Routes that take over the whole window: they render their own chrome (the
 * builder's 60px rail, the picker's back bar) and would be cramped beside the
 * sidebar.
 */
const isFocusRoute = (pathname: string) =>
  pathname === "/dashboard/strategies/new" || /^\/dashboard\/workflows\/[^/]+$/.test(pathname);

/**
 * The signed-in shell.
 *
 * Desktop is a 252px sidebar beside the content. Below 1024px the sidebar
 * becomes a top bar with a sheet, rather than stacking the whole nav above
 * every page.
 */
export function AppShell({
  user,
  workspace,
  children,
}: {
  user: User;
  workspace: Workspace;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const focus = isFocusRoute(pathname);

  return (
    <WorkspaceProvider user={user} workspace={workspace}>
      <div className="ws-root min-h-screen">
        {focus ? (
          children
        ) : (
          <div className="flex min-h-screen items-stretch">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileBar />
              <main className="flex min-w-0 flex-1 flex-col">{children}</main>
            </div>
          </div>
        )}
      </div>
    </WorkspaceProvider>
  );
}

/** The phone and tablet header: brand, and a menu that opens the nav in a sheet. */
function MobileBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const still = useReducedMotion();

  // A sheet that outlives the page it was opened from is a trap on a phone.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-chrome px-5 py-[11px] lg:hidden">
        <Brand />
        <button
          type="button"
          aria-label="Open the menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="flex size-[34px] items-center justify-center rounded-lg border border-input bg-card text-body"
        >
          <Menu aria-hidden className="size-[17px]" strokeWidth={1.8} />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 lg:hidden"
            initial={still ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={EASE_OUT}
          >
            <button
              type="button"
              aria-label="Close the menu"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-[rgba(20,20,19,0.28)]"
            />
            <motion.div
              role="dialog"
              aria-label="Main navigation"
              className="absolute inset-y-0 left-0 flex w-[272px] max-w-[85vw] flex-col gap-[22px] border-r border-border bg-chrome px-4 pb-[18px] pt-[16px]"
              initial={still ? false : { x: -24 }}
              animate={{ x: 0 }}
              exit={{ x: -24 }}
              transition={EASE_OUT}
            >
              <div className="flex items-center justify-between gap-2 px-[6px]">
                <Brand />
                <button
                  type="button"
                  aria-label="Close the menu"
                  onClick={() => setOpen(false)}
                  className="flex size-[30px] items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                >
                  <X aria-hidden className="size-[16px]" strokeWidth={2} />
                </button>
              </div>
              <NavList onNavigate={() => setOpen(false)} />
              <div className="flex-1" />
              <div className="flex flex-col gap-[10px]">
                <SignOutItem />
                <AccountCard />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
