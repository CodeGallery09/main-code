import { getRepository } from "@/lib/data";
import { parseRange, withUser } from "@/lib/http";

/** GET /api/journeys?range= — launched strategies' journeys and the touchpoints made in the range. */
export async function GET(request: Request) {
  const range = parseRange(new URL(request.url).searchParams.get("range"));
  return withUser(async (ctx) => ({ journeys: await getRepository().getJourneys(ctx, range) }));
}
