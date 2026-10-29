import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/**
 * POST /api/engine/run — runs the steps that have come due in the caller's workspace.
 *
 * The screens call this while they are open. There is no background schedule yet, so a plan with
 * waits only moves on while someone has the app open; a scheduled runner arrives with real sending.
 */
export async function POST() {
  return withUser((ctx) => getRepository().runDueSteps(ctx));
}
