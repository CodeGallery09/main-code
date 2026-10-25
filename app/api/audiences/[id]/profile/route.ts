import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/**
 * GET /api/audiences/:id/profile — one prospect with their company, journey, audiences, conversations,
 * recorded events, to-dos and timeline. Read-only. 404 for an audience in another workspace.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const profile = await getRepository().getProspect(ctx, id);
    return profile && { profile };
  });
}
