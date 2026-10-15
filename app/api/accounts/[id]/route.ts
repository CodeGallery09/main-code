import { getRepository } from "@/lib/data";
import { readJson, withUser } from "@/lib/http";
import { validateAccountPatch } from "@/lib/data/validate";

/**
 * PATCH /api/accounts/:id — turn the dials of one account: daily caps for LinkedIn, the daily cap
 * and rotation for a mailbox. Identity, state and health are facts about the connected account and
 * are not accepted here.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson(request);

  return withUser(async (ctx) => {
    const repo = getRepository();
    // The rules depend on the channel, which only the stored account knows.
    const { accounts } = await repo.listAccounts(ctx);
    const current = accounts.find((a) => a.id === id);
    if (!current) return null;

    const checked = validateAccountPatch(current.channel, body);
    if (!checked.ok) return { error: { field: Object.keys(checked.errors)[0], message: Object.values(checked.errors)[0] } };

    const account = await repo.updateAccount(ctx, id, checked.data);
    if (!account) return null;
    return "error" in account ? account : { account };
  });
}

