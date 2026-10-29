import { withUser } from "@/lib/http";
import { fillBriefings } from "@/lib/engine/enrich";

/**
 * POST /api/audiences/briefings — reads a few of this workspace's unread LinkedIn profiles.
 *
 * The Audiences screen calls this while it is open, the same way the Inbox pulls for replies, so an
 * upload's briefings fill in while the person is still looking at the list. The scheduled tick runs
 * the same pass, so they fill in whether or not anybody is watching.
 *
 * POST only: it makes provider calls and writes, so a link prefetch must never run it.
 */
export async function POST() {
  return withUser(async (ctx) => fillBriefings(ctx));
}
