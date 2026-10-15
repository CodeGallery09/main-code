import { getRepository } from "@/lib/data";
import { failFields, readJson, withUser } from "@/lib/http";
import { validateCampaignIds } from "@/lib/data/validate";

/**
 * PUT /api/accounts/:id/campaigns — `{ campaignIds }` replaces the set of campaigns that send from
 * this account. Many campaigns can share one account, for LinkedIn and email alike.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const checked = validateCampaignIds(await readJson(request));
  if (!checked.ok) return failFields(checked.errors);

  return withUser(async (ctx) => {
    const account = await getRepository().setAccountCampaigns(ctx, id, checked.data);
    if (!account) return null;
    return "error" in account ? account : { account };
  });
}
