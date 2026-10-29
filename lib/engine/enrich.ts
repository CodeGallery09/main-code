/**
 * Filling in the LinkedIn briefings nobody asked for by hand.
 *
 * A lead with a LinkedIn URL is worth reading: the briefing (`lib/audiences/summary.ts`) is what
 * makes the drawer useful before a first touch. Until now that read only happened when someone
 * pressed "Read their profile", or when a URL was typed into the lead form — so a file of three
 * hundred people arrived with three hundred empty profiles and no sign that anything was missing.
 *
 * It cannot be done in the upload request: each profile is a round trip to the provider, through a
 * member's own LinkedIn session, and an upload would hang for minutes. So it is a **background
 * pass**, run a few leads at a time from two places — the scheduled tick, so it happens with nobody
 * looking, and a poll from the Audiences screen, so it happens quickly when someone is.
 *
 * **Paced on purpose.** Profile views are one of the behaviours LinkedIn watches, so this reads a
 * handful per pass with a gap between them rather than racing through a file. It never retries a
 * lead inside one pass, and a provider that is unreachable ends the pass rather than hammering it.
 *
 * Server-only.
 */

import { and, eq } from "drizzle-orm";
import { getRepository } from "@/lib/data";
import { getDb } from "@/lib/db/client";
import { channelAccounts } from "@/lib/db/schema";
import { getLinkedInAdapter, ProviderError } from "@/lib/channels";
import { linkedInIdentifier } from "@/lib/channels/unipileRequests";
import type { Ctx } from "@/lib/data/repository";

/** How many profiles one pass reads. Small on purpose — the pass runs often. */
export const BRIEFINGS_PER_PASS = 5;

/** The gap between two reads on the same account, so a file is not devoured in one burst. */
export const BRIEFING_GAP_MS = 1_500;

export type BriefingPass = {
  /** Profiles read and stored in this pass. */
  read: number;
  /** Leads that were tried and could not be read; they stay pending and are tried again later. */
  failed: number;
  /** Leads still waiting after this pass. */
  pending: number;
  /** False when this deployment has no provider key, or the workspace has no healthy account. */
  configured: boolean;
};

const idle: BriefingPass = { read: 0, failed: 0, pending: 0, configured: false };

/** The provider account a profile is read through. A profile is only visible to a signed-in member. */
async function reader(ctx: Ctx): Promise<string | null> {
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
  return account?.providerAccountId ?? null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads up to `limit` of this workspace's unread LinkedIn profiles and stores their briefings.
 *
 * Returns what it did rather than throwing: it is called from a tick and from a screen poll, and
 * neither should fail because LinkedIn was slow.
 */
export async function fillBriefings(ctx: Ctx, limit = BRIEFINGS_PER_PASS): Promise<BriefingPass> {
  const adapter = getLinkedInAdapter();
  if (!adapter || !process.env.DATABASE_URL) return idle;

  const repo = getRepository();
  const { ids, pending } = await repo.pendingBriefings(ctx, limit);
  if (!ids.length) return { ...idle, configured: true, pending };

  const accountId = await reader(ctx);
  if (!accountId) return { ...idle, pending };

  let read = 0;
  let failed = 0;
  for (const [i, id] of ids.entries()) {
    const lead = await repo.audienceLinkedIn(ctx, id);
    const identifier = lead ? linkedInIdentifier(lead.handle) : "";
    if (!identifier) {
      failed += 1;
      continue;
    }
    try {
      if (i > 0) await wait(BRIEFING_GAP_MS);
      const profile = await adapter.getProfile({ accountId, identifier });
      if (!profile) {
        failed += 1;
        continue;
      }
      await repo.saveAudienceLinkedIn(ctx, id, profile);
      read += 1;
    } catch (caught) {
      failed += 1;
      // A refusal is about this one lead; anything else means the provider is in trouble, and
      // carrying on would just turn one outage into five.
      if (!(caught instanceof ProviderError) || caught.status >= 500) break;
    }
  }
  return { read, failed, pending: Math.max(0, pending - read), configured: true };
}
