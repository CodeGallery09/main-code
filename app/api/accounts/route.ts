import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/**
 * GET /api/accounts — the workspace's LinkedIn accounts, mailboxes and sending domains.
 * Accounts belong to the workspace, not to a strategy: each one lists the strategies that use it.
 */
export async function GET() {
  return withUser((ctx) => getRepository().listAccounts(ctx));
}
