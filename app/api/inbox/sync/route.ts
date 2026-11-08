import { withUser } from "@/lib/http";
import { getLinkedInAdapter } from "@/lib/channels";
import { pullRecentMessages } from "@/lib/channels/pull";
import { pullRecentEmails } from "@/lib/channels/email";

/**
 * POST /api/inbox/sync — asks the provider for anything new on the workspace's connected LinkedIn
 * accounts and mailboxes.
 *
 * The Inbox calls this while it is open. It is safe to call often: every message goes through the
 * same idempotent writer the webhooks use, so one already stored is counted and skipped, and the
 * mailbox read is spaced on the server whatever the screen does. `accounts` and `mailboxes` tell the
 * reply bar whether a reply on that channel can really go out.
 */
export async function POST() {
  return withUser(async (ctx) => {
    const adapter = getLinkedInAdapter();
    if (!adapter) return { checked: 0, stored: 0, accounts: 0, mailboxes: 0, configured: false };
    const out = { checked: 0, stored: 0, accounts: 0, mailboxes: 0, configured: true };
    try {
      const li = await pullRecentMessages(adapter, ctx.workspaceId);
      out.checked += li.checked;
      out.stored += li.stored;
      out.accounts = li.accounts;
    } catch (caught) {
      console.error("[inbox-sync] linkedin", caught);
    }
    try {
      const mail = await pullRecentEmails(adapter, ctx.workspaceId);
      out.checked += mail.checked;
      out.stored += mail.stored;
      out.mailboxes = mail.mailboxes;
    } catch (caught) {
      console.error("[inbox-sync] email", caught);
    }
    return out;
  });
}
