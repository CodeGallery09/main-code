import { getRepository } from "@/lib/data";
import { failFields, readJson, withUser } from "@/lib/http";
import { validateStrategyIds } from "@/lib/data/validate";

/**
 * PUT /api/accounts/:id/strategies — `{ strategyIds }` replaces the set of strategies that send from
 * this account. Many strategies can share one account, for LinkedIn and email alike.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const checked = validateStrategyIds(await readJson(request));
  if (!checked.ok) return failFields(checked.errors);

  return withUser(async (ctx) => {
    const account = await getRepository().setAccountStrategies(ctx, id, checked.data);
    if (!account) return null;
    return "error" in account ? account : { account };
  });
}
