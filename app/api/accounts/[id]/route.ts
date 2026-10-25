import { getRepository } from "@/lib/data";
import { readJson, withUser } from "@/lib/http";
import { validateAccountPatch } from "@/lib/data/validate";
import { getLinkedInAdapter } from "@/lib/channels";

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


/**
 * DELETE /api/accounts/:id — disconnects an account and removes it from the workspace.
 *
 * The provider is told first, so a deleted row can never leave a connection running (and billing)
 * at the provider with nothing pointing at it. A provider that refuses still removes the row:
 * the user asked for the account to be gone, and leaving it would be the worse failure.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const repo = getRepository();
    const { accounts } = await repo.listAccounts(ctx);
    const current = accounts.find((a) => a.id === id);
    if (!current) return null;

    const { providerAccountId, provider } = current.connection;
    if (providerAccountId) {
      const adapter = getLinkedInAdapter();
      if (adapter && adapter.provider === provider) {
        try {
          await adapter.deleteAccount(providerAccountId);
        } catch (caught) {
          console.error("[accounts] provider disconnect failed", caught);
        }
      }
    }
    return repo.deleteAccount(ctx, id);
  });
}
