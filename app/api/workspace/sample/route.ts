import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/**
 * DELETE /api/workspace/sample — removes the sample strategy, its workflow and the sample audiences
 * this workspace was created with. Rows the user made themselves are never flagged, so never
 * touched. Safe to repeat: a second call removes nothing and says so.
 */
export async function DELETE() {
  return withUser(async (ctx) => ({ removed: await getRepository().removeSampleData(ctx) }));
}
