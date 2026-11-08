import { getRepository } from "@/lib/data";
import { fail, json } from "@/lib/http";
import { requestCtx } from "@/lib/audiences/ctx";

/**
 * DELETE /api/audiences/segments/:id — deletes an uploaded audience.
 *
 * `?leads=1` deletes every lead in it from the workspace as well — from every other audience and
 * strategy, with their conversations, to-dos and plan runs. Without it only the list goes and the
 * leads stay. Sample leads are never deleted. Answers `{ deleted, leadsDeleted }`.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requestCtx();
  if (!ctx) return fail("unauthenticated", "Sign in to use this endpoint.", 401);
  const { id } = await params;
  const withLeads = new URL(request.url).searchParams.get("leads") === "1";
  const result = await getRepository().deleteSegment(ctx, id, withLeads);
  return result ? json(result) : fail("not_found", "That audience does not exist.", 404);
}
