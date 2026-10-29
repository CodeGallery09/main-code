import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";
import { runTrafficTick } from "@/lib/engine/scheduler";

/**
 * POST /api/engine/run — runs the steps that have come due in the caller's workspace.
 *
 * The screens call this while they are open, so a plan moves the moment someone is watching it.
 *
 * It also rides a **global** tick in on the back of the same request (`runTrafficTick`, at most
 * once a minute per instance, under a shared lock). The scheduled beat is the real clock, but it
 * is a single point of failure — a disabled workflow, a lapsed free tier, a deleted job — and this
 * costs nothing to add: the request was happening anyway, and when nothing is live the extra work
 * is one indexed query that returns no rows. So any signed-in screen keeps every workspace moving,
 * not just its own.
 */
export async function POST() {
  return withUser(async (ctx) => {
    const mine = await getRepository().runDueSteps(ctx);
    await runTrafficTick();
    return mine;
  });
}
