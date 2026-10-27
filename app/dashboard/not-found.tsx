import Link from "next/link";
import { hasDatabase } from "@/lib/db/client";
import { CAMPAIGNS_HREF } from "@/lib/nav";
import { buttonVariants } from "@/components/ws/ui/button";

/**
 * A dashboard page that does not exist — most often a strategy that was deleted, or one that belongs
 * to another workspace (the repository filters by workspace, so both read the same). It renders
 * inside the dashboard layout, so the visitor keeps their session and their way back.
 */
export default function DashboardNotFound() {
  const demo = !hasDatabase();
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="flex max-w-[420px] flex-col items-center gap-3 text-center">
        <span className="label-mono">404</span>
        <h1 className="font-mono text-[18px] font-bold tracking-[-0.02em]">That page isn&apos;t in this workspace</h1>
        <p className="text-[12px] leading-[1.6] text-muted-foreground">
          It may have been deleted, or it belongs to another workspace.
          {demo
            ? " This preview keeps changes in server memory, which is not shared between requests, so a strategy you just created can be gone by the next page. The production site stores it in the database."
            : ""}
        </p>
        <Link href={CAMPAIGNS_HREF} className={buttonVariants()}>
          Back to strategies
        </Link>
      </div>
    </div>
  );
}
