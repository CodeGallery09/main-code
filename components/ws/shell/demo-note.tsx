"use client";

import { useWorkspace } from "./workspace-context";

/**
 * One line above any figures that include the demo strategy's invented funnel. Nothing sends yet,
 * so until a workspace has real activity the numbers on Home and Analytics *are* the demo's, and
 * the content rules say invented figures must be labelled wherever they are shown.
 */
export function DemoNote() {
  const { workspace } = useWorkspace();
  if (workspace.sample.strategies === 0) return null;
  return (
    <p className="rounded-[10px] bg-accent px-[15px] py-[11px] text-[12.5px] leading-[1.55] text-muted-foreground">
      <span className="font-medium text-body">Demo figures.</span> These come from the sample strategy, invented to show
      what the product does. Nothing has been sent from this workspace yet.
    </p>
  );
}
