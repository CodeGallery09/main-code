import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/** DELETE /api/domains/:id — stops tracking a sending domain. DNS is not touched. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => getRepository().deleteDomain(ctx, id));
}
