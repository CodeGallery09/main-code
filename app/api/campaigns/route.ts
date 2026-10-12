import { getRepository } from "@/lib/data";
import { parseRange, withUser } from "@/lib/http";
import type { CampaignStatus, CampaignType, Channel } from "@/lib/data/types";

/** GET /api/campaigns?q=&status=&type=&channel=&range= */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return withUser(async () =>
    getRepository().listCampaigns({
      q: params.get("q") ?? undefined,
      status: (params.get("status") ?? "all") as CampaignStatus | "all",
      type: (params.get("type") ?? "all") as CampaignType | "all",
      channel: (params.get("channel") ?? "all") as Channel | "all",
      range: parseRange(params.get("range")),
    }),
  );
}
