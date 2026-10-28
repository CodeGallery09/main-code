import { getLinkedInAdapter } from "@/lib/channels";
import { refreshAccountStates } from "@/lib/channels/inbound";
import { getRepository } from "@/lib/data";
import { hasDatabase } from "@/lib/db/client";
import { withUser } from "@/lib/http";

/**
 * GET /api/accounts — the workspace's LinkedIn accounts, mailboxes and sending domains.
 * Accounts belong to the workspace, not to a strategy: each one lists the strategies that use it.
 *
 * A LinkedIn account that is still syncing, or flagged signed out, is re-read from the provider
 * first, so a connection that has since come good is not shown as needing a sign-in.
 */
export async function GET() {
  return withUser(async (ctx) => {
    const adapter = hasDatabase() ? getLinkedInAdapter() : null;
    if (adapter) await refreshAccountStates(adapter, ctx.workspaceId);
    return getRepository().listAccounts(ctx);
  });
}
