import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/**
 * POST /api/strategies/:id/launch — starts the strategy, or resumes a paused one.
 *
 * **It really sends.** It enrols the audiences the plan's first step points at,
 * then runs whatever is already due, so a plan with no waits shows its work straight away.
 * POST only — a link prefetch must never start a strategy.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const repo = getRepository();
    const launched = await repo.launchStrategy(ctx, id);
    if (!launched || "error" in launched) return launched;
    const { processed } = await repo.runDueSteps(ctx);
    return { launch: launched, processed };
  });
}
