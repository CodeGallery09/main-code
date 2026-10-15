import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/** GET /api/workflows — every workflow in the workspace, newest edit first. */
export async function GET() {
  return withUser(async (ctx) => ({ items: await getRepository().listWorkflows(ctx) }));
}
