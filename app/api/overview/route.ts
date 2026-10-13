import { getRepository } from "@/lib/data";
import { parseRange, withUser } from "@/lib/http";

/** GET /api/overview?range=7d|30d|90d — everything the dashboard home screen shows. */
export async function GET(request: Request) {
  const range = parseRange(new URL(request.url).searchParams.get("range"));
  return withUser((ctx) => getRepository().getOverview(ctx, range));
}
