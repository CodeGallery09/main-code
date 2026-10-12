import { getRepository } from "@/lib/data";
import { parseChannels, parseRange, withUser } from "@/lib/http";

/** GET /api/analytics?range=&channels=linkedin,email */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const range = parseRange(params.get("range"));
  const channels = parseChannels(params.get("channels"));
  return withUser(() => getRepository().getAnalytics(range, channels));
}
