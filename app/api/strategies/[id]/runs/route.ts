import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/** GET /api/strategies/:id/runs — where the strategy's audiences are in its plan, and what just happened. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const summary = await getRepository().runSummary(ctx, id);
    return summary && { summary };
  });
}
