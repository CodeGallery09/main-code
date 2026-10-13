import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/** GET /api/workspace — org, plan, seats, members and channel caps. */
export async function GET() {
  return withUser(async (ctx) => ({ workspace: await getRepository().getWorkspace(ctx) }));
}
