import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/** GET /api/me — the signed-in user and their workspace. */
export async function GET() {
  return withUser(async (email) => {
    const repo = getRepository();
    const [user, workspace] = await Promise.all([repo.getUser(email), repo.getWorkspace()]);
    return { user, workspace };
  });
}
