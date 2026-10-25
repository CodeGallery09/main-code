import { getRepository } from "@/lib/data";
import { parseInt10, withUser } from "@/lib/http";

/**
 * GET /api/accounts/activity?days=30 — what has actually happened on each connected account.
 *
 * Counted from the event log, so every figure is a real delivery the provider made. An account
 * that has done nothing reads zero rather than an estimate.
 */
export async function GET(request: Request) {
  const days = parseInt10(new URL(request.url).searchParams.get("days"), 30);
  return withUser(async (ctx) => ({ activity: await getRepository().accountActivity(ctx, days) }));
}
