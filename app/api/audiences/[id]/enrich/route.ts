import { and, eq } from "drizzle-orm";
import { getRepository } from "@/lib/data";
import { fail, withUser } from "@/lib/http";
import { getLinkedInAdapter, ProviderError } from "@/lib/channels";
import { linkedInIdentifier } from "@/lib/channels/unipileRequests";
import { getDb } from "@/lib/db/client";
import { channelAccounts } from "@/lib/db/schema";

/** GET — the briefing already stored for this lead. No provider call, so it is free to open with. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const found = await getRepository().audienceLinkedIn(ctx, id);
    return found && { linkedin: found.stored, handle: found.handle, configured: getLinkedInAdapter() !== null };
  });
}

/**
 * POST — reads the lead's LinkedIn profile now and stores the briefing.
 *
 * LinkedIn is read through one of the workspace's own connected accounts, because a profile is
 * only visible through a signed-in member's session. No account, no read — and the screen says so
 * rather than showing an empty briefing. Every refusal comes back as a stated reason, never as an
 * empty success.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const adapter = getLinkedInAdapter();
  if (!adapter) return fail("not_configured", "Reading LinkedIn profiles isn't configured on this deployment.", 503);

  return withUser(async (ctx) => {
    const repo = getRepository();
    const found = await repo.audienceLinkedIn(ctx, id);
    if (!found) return null;

    const refuse = (message: string) => ({ error: { field: "linkedin", message } });
    const identifier = linkedInIdentifier(found.handle);
    if (!identifier) return refuse("Add this lead's LinkedIn URL first, then read their profile.");

    const [account] = await getDb()
      .select({ providerAccountId: channelAccounts.providerAccountId })
      .from(channelAccounts)
      .where(
        and(
          eq(channelAccounts.workspaceId, ctx.workspaceId),
          eq(channelAccounts.channel, "linkedin"),
          eq(channelAccounts.state, "healthy"),
        ),
      )
      .limit(1);
    if (!account?.providerAccountId) {
      return refuse("Connect a LinkedIn account under Setup — a profile is only visible through a signed-in member.");
    }

    try {
      const profile = await adapter.getProfile({ accountId: account.providerAccountId, identifier });
      if (!profile) return refuse(`LinkedIn did not return a profile for "${identifier}". Check the URL.`);
      const stored = await repo.saveAudienceLinkedIn(ctx, id, profile);
      return stored && { linkedin: stored };
    } catch (caught) {
      return refuse(caught instanceof ProviderError ? caught.message : "LinkedIn could not be reached. Try again.");
    }
  });
}
