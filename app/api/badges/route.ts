import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/** GET /api/badges — the counts on the rail: open to-dos, conversations waiting, setup issues. */
export async function GET() {
  return withUser((ctx) => getRepository().getBadges(ctx));
}
