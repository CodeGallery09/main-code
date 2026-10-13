import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/** GET /api/me — the signed-in user and their workspace. */
export async function GET() {
  return withUser(async (ctx) => {
    const repo = getRepository();
    const [user, workspace] = await Promise.all([repo.getUser(ctx), repo.getWorkspace(ctx)]);
    return { user, workspace };
  });
}
