import { getRepository } from "@/lib/data";
import { failFields, parseInt10, readJson, withUser } from "@/lib/http";
import { validateLead } from "@/lib/data/validate";
import type { LeadQuery, LeadStage } from "@/lib/data/types";

/** GET /api/leads?q=&stage=&ownerId=&campaignId=&segmentId=&sort=&dir=&page=&pageSize= */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query: LeadQuery = {
    q: params.get("q") ?? undefined,
    stage: (params.get("stage") ?? "all") as LeadStage | "all",
    ownerId: params.get("ownerId") ?? "all",
    campaignId: params.get("campaignId") ?? "all",
    segmentId: params.get("segmentId") ?? "all",
    sort: (params.get("sort") ?? "score") as LeadQuery["sort"],
    dir: (params.get("dir") ?? undefined) as LeadQuery["dir"],
    page: parseInt10(params.get("page"), 1),
    pageSize: parseInt10(params.get("pageSize"), 25),
  };
  return withUser((ctx) => getRepository().listLeads(ctx, query));
}

/** POST /api/leads — creates a lead. 422 with per-field errors on invalid input. */
export async function POST(request: Request) {
  const body = await readJson(request);
  const checked = validateLead(body);
  if (!checked.ok) return failFields(checked.errors);

  // withUser maps a WriteError (e.g. a campaign in another workspace) to a 422 for us.
  return withUser(async (ctx) => {
    const lead = await getRepository().createLead(ctx, checked.data);
    return "error" in lead ? lead : { lead };
  });
}
