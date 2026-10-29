import { withUser } from "@/lib/http";
import { getLinkedInAdapter } from "@/lib/channels";
import { pullRecentMessages } from "@/lib/channels/pull";

/**
 * POST /api/inbox/sync — asks LinkedIn for anything new on the workspace's connected accounts.
 *
 * The Inbox calls this while it is open. It is safe to call often: every message goes through the
 * same idempotent writer the webhook uses, so a message already stored is counted and skipped.
 */
export async function POST() {
  return withUser(async (ctx) => {
    const adapter = getLinkedInAdapter();
    if (!adapter) return { checked: 0, stored: 0, accounts: 0, configured: false };
    try {
      return { ...(await pullRecentMessages(adapter, ctx.workspaceId)), configured: true };
    } catch (caught) {
      console.error("[inbox-sync]", caught);
      return { checked: 0, stored: 0, accounts: 0, configured: true };
    }
  });
}
