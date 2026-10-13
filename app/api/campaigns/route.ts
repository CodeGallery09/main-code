import { getRepository } from "@/lib/data";
import { failFields, parseRange, readJson, withUser } from "@/lib/http";
import { validateCampaign } from "@/lib/data/validate";
import type { CampaignStatus, CampaignType, Channel } from "@/lib/data/types";

/** GET /api/campaigns?q=&status=&type=&channel=&range= */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return withUser((ctx) =>
    getRepository().listCampaigns(ctx, {
      q: params.get("q") ?? undefined,
      status: (params.get("status") ?? "all") as CampaignStatus | "all",
      type: (params.get("type") ?? "all") as CampaignType | "all",
      channel: (params.get("channel") ?? "all") as Channel | "all",
      range: parseRange(params.get("range")),
    }),
  );
}

/** POST /api/campaigns — creates a campaign. */
export async function POST(request: Request) {
  const body = await readJson(request);
  const checked = validateCampaign(body);
  if (!checked.ok) return failFields(checked.errors);

  return withUser(async (ctx) => {
    const campaign = await getRepository().createCampaign(ctx, checked.data);
    return "error" in campaign ? campaign : { campaign };
  });
}
