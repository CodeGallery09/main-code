import { getRepository } from "@/lib/data";
import { failFields, parseInt10, readJson, withUser } from "@/lib/http";
import { validateAudience } from "@/lib/data/validate";
import type { AudienceQuery, AudienceStage } from "@/lib/data/types";

/** GET /api/audiences?q=&stage=&ownerId=&strategyId=&segmentId=&sort=&dir=&page=&pageSize= */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query: AudienceQuery = {
    q: params.get("q") ?? undefined,
    stage: (params.get("stage") ?? "all") as AudienceStage | "all",
    ownerId: params.get("ownerId") ?? "all",
    strategyId: params.get("strategyId") ?? "all",
    segmentId: params.get("segmentId") ?? "all",
    sort: (params.get("sort") ?? "score") as AudienceQuery["sort"],
    dir: (params.get("dir") ?? undefined) as AudienceQuery["dir"],
    page: parseInt10(params.get("page"), 1),
    pageSize: parseInt10(params.get("pageSize"), 25),
  };
  return withUser((ctx) => getRepository().listAudiences(ctx, query));
}

/** POST /api/audiences — creates an audience. 422 with per-field errors on invalid input. */
export async function POST(request: Request) {
  const body = await readJson(request);
  const checked = validateAudience(body);
  if (!checked.ok) return failFields(checked.errors);

  // withUser maps a WriteError (e.g. a strategy in another workspace) to a 422 for us.
  return withUser(async (ctx) => {
    const audience = await getRepository().createAudience(ctx, checked.data);
    return "error" in audience ? audience : { audience };
  });
}
