import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/**
 * POST /api/domains/:id/check — looks the domain's records up again, after the operator has
 * published one. DNS changes take minutes to hours to be visible, so a miss here soon after a
 * change is expected and the screen says so.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => getRepository().checkDomain(ctx, id));
}
