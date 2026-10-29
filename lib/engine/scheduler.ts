/**
 * The clock the plans run on.
 *
 * Every other entry point into the engine is a screen poll, which only works while someone is
 * looking at Flightpath. Now that days are real days and a touch can be deferred to tomorrow
 * morning, that is not good enough: a plan launched on Friday has to advance on Monday whether or
 * not anyone has the tab open. This is the piece that makes that true.
 *
 * Like `lib/channels/inbound.ts`, this runs **without a session**, so it builds its own `Ctx` per
 * workspace from the owner's membership rather than taking one from a request. It never reads a
 * workspace id from a body: the list comes from the strategies table itself, so the caller cannot
 * steer it at another tenant. Everything it then does goes through the ordinary repository, which
 * filters by `workspace_id` as usual.
 *
 * Server-only.
 */

import { and, eq } from "drizzle-orm";
import { getRepository } from "@/lib/data";
import { getDb } from "@/lib/db/client";
import { memberships, strategies } from "@/lib/db/schema";
import { getLinkedInAdapter } from "@/lib/channels";
import { pullRecentMessages } from "@/lib/channels/pull";

export type TickResult = {
  workspaces: number;
  processed: number;
  pulled: number;
  /** Workspaces whose tick threw, by id. One bad tenant must not stop the rest. */
  failed: string[];
};

/** How many workspaces one tick will touch, so a single run cannot outlast its request budget. */
const WORKSPACES_PER_TICK = 40;

/**
 * Advances every workspace that has something live, and pulls in anything that replied.
 *
 * A workspace with no live strategy is skipped entirely — most ticks do nothing at all, which is
 * the point: the cost of the schedule should be close to zero when nobody is running anything.
 */
export async function runScheduledTick(): Promise<TickResult> {
  const result: TickResult = { workspaces: 0, processed: 0, pulled: 0, failed: [] };
  const db = getDb();

  // Only tenants with something live, each with an owner to attribute the run to.
  const rows = await db
    .selectDistinct({ workspaceId: strategies.workspaceId })
    .from(strategies)
    .where(eq(strategies.status, "live"))
    .limit(WORKSPACES_PER_TICK);
  if (!rows.length) return result;

  const repo = getRepository();
  const adapter = getLinkedInAdapter();

  for (const { workspaceId } of rows) {
    const [owner] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.role, "owner")))
      .limit(1);
    if (!owner) continue;

    const ctx = { workspaceId, userId: owner.userId };
    result.workspaces += 1;
    try {
      const { processed } = await repo.runDueSteps(ctx);
      result.processed += processed;
    } catch (caught) {
      console.error("[scheduler]", workspaceId, caught);
      result.failed.push(workspaceId);
    }

    // A reply has to stop the sequence, so replies are read on the same beat as the sends — but a
    // provider that is unreachable is not a failed tick: the steps already ran.
    if (!adapter) continue;
    try {
      result.pulled += (await pullRecentMessages(adapter, workspaceId)).stored;
    } catch (caught) {
      console.error("[scheduler] pull", workspaceId, caught);
    }
  }
  return result;
}
