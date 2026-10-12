import { getRepository } from "@/lib/data";
import { parseInt10, withUser } from "@/lib/http";
import type { LeadQuery, LeadStage } from "@/lib/data/types";

/** GET /api/leads?q=&stage=&ownerId=&campaignId=&sort=&dir=&page=&pageSize= */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query: LeadQuery = {
    q: params.get("q") ?? undefined,
    stage: (params.get("stage") ?? "all") as LeadStage | "all",
    ownerId: params.get("ownerId") ?? "all",
    campaignId: params.get("campaignId") ?? "all",
    sort: (params.get("sort") ?? "score") as LeadQuery["sort"],
    dir: (params.get("dir") ?? undefined) as LeadQuery["dir"],
    page: parseInt10(params.get("page"), 1),
    pageSize: parseInt10(params.get("pageSize"), 25),
  };
  return withUser(() => getRepository().listLeads(query));
}
