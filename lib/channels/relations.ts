/**
 * Seeing a LinkedIn invitation accepted.
 *
 * A plan's "If they accepted the invite" condition is decided on `LEAD_EVENT.accepted` rows, and
 * this file is what writes them. Two roads lead here and both go through `recordAcceptance`, which
 * is idempotent per lead per strategy:
 *
 * - **The `users` webhook** (`new_relation`), handled by `applyNewRelation`. Unipile finds new
 *   relations by polling LinkedIn on its own schedule, so it can be hours late.
 * - **Pulling the relation list** (`pullAcceptances`), on the scheduler's beat. It only asks when
 *   somebody in the workspace has been sent an invite and not yet seen to accept, so a workspace
 *   with nothing outstanding costs nothing, and it is spaced (`PULL_EVERY_MS`) because the list is
 *   read from LinkedIn through the member's own session.
 *
 * **A lead is never invented here.** A new connection who is not already a lead is ignored, the
 * same rule `applyInboundMessage` follows. Like `inbound.ts`, the webhook half writes without a
 * `Ctx`: the workspace is derived from the provider account id, never taken from the body.
 *
 * Server-only.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { audiences as audiencesTable, channelAccounts, events as eventsTable } from "@/lib/db/schema";
import { LEAD_EVENT } from "@/lib/data/accountEvents";
import { SENT_EVENT_KIND } from "@/lib/engine/steps";
import type { LinkedInChannelAdapter, ProviderRelation } from "./adapter";
import { slugOf, type RelationEvent } from "./events";
import { resolveProviderAccount } from "./inbound";

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The relation list is a LinkedIn read through the member's session; don't hammer it. */
const PULL_EVERY_MS = 15 * 60_000;
const lastPull = new Map<string, number>();

type Lead = { id: string; name: string; strategyId: string | null; providerId: string; slug: string };

/** The slug a stored LinkedIn value carries, whether it is a URL or already a bare slug. */
function storedSlug(stored: string | null): string {
  const value = (stored ?? "").trim();
  if (!value) return "";
  const fromUrl = slugOf(value.includes("linkedin.com") ? value : `linkedin.com/in/${value.replace(/^\/+|\/+$/g, "")}`);
  return fromUrl;
}

/**
 * Writes the acceptance once per lead per strategy, and logs it where the operator reads the run.
 * Returns whether anything new was written.
 */
async function recordAcceptance(workspaceId: string, accountId: string, lead: Lead, how: string): Promise<boolean> {
  const db = getDb();
  const [seen] = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.workspaceId, workspaceId),
        eq(eventsTable.kind, LEAD_EVENT.accepted),
        eq(eventsTable.audienceId, lead.id),
        lead.strategyId ? eq(eventsTable.strategyId, lead.strategyId) : sql`${eventsTable.strategyId} is null`,
      ),
    )
    .limit(1);
  if (seen) return false;
  await db.insert(eventsTable).values({
    id: newId("ev"),
    workspaceId,
    kind: LEAD_EVENT.accepted,
    channel: "linkedin",
    audienceId: lead.id,
    strategyId: lead.strategyId,
    payload: { accountId, how, text: `${lead.name} accepted your LinkedIn invite.` },
  });
  await db
    .update(channelAccounts)
    .set({ lastEventAt: new Date() })
    .where(and(eq(channelAccounts.id, accountId), eq(channelAccounts.workspaceId, workspaceId)));
  return true;
}

/** Whether a relation is this lead: the provider id first (exact), then the profile slug. */
function samePerson(lead: Lead, relation: { providerId: string; publicIdentifier: string; profileUrl: string }): boolean {
  if (lead.providerId && relation.providerId && lead.providerId === relation.providerId) return true;
  const slug = (relation.publicIdentifier || slugOf(relation.profileUrl)).toLowerCase();
  return Boolean(slug && lead.slug && slug === lead.slug);
}

/* ---------- the webhook --------------------------------------------------- */

export async function applyNewRelation(
  provider: string,
  event: RelationEvent,
): Promise<{ stored: boolean; reason?: "unknown_account" | "not_a_lead" | "duplicate" }> {
  const found = await resolveProviderAccount(provider, event.accountId);
  if (!found || found.channel !== "linkedin") return { stored: false, reason: "unknown_account" };

  const db = getDb();
  const slug = (event.publicIdentifier || slugOf(event.profileUrl)).toLowerCase();
  // Narrow in SQL on the two exact keys, then confirm in code with the same rule the pull uses.
  const rows = await db
    .select({
      id: audiencesTable.id,
      name: audiencesTable.name,
      strategyId: audiencesTable.strategyId,
      linkedin: audiencesTable.linkedin,
      providerId: sql<string | null>`${audiencesTable.extra} -> 'linkedin' ->> 'providerId'`,
    })
    .from(audiencesTable)
    .where(
      and(
        eq(audiencesTable.workspaceId, found.workspaceId),
        sql`(
          (${event.providerId} <> '' and ${audiencesTable.extra} -> 'linkedin' ->> 'providerId' = ${event.providerId})
          or (${slug} <> '' and position(${`/in/${slug}`} in lower(coalesce(${audiencesTable.linkedin}, ''))) > 0)
          or (${slug} <> '' and lower(coalesce(${audiencesTable.linkedin}, '')) = ${slug})
        )`,
      ),
    )
    .limit(5);
  const lead = rows
    .map((r) => ({ id: r.id, name: r.name, strategyId: r.strategyId, providerId: r.providerId ?? "", slug: storedSlug(r.linkedin) }))
    .find((l) => samePerson(l, event));
  if (!lead) return { stored: false, reason: "not_a_lead" };
  const stored = await recordAcceptance(found.workspaceId, found.accountId, lead, "webhook");
  return stored ? { stored } : { stored, reason: "duplicate" };
}

/* ---------- the pull ------------------------------------------------------ */

/**
 * Leads in this workspace who were sent an invite in their current strategy and have not been
 * seen to accept it. Nobody here means there is nothing to look for.
 */
async function awaitingAcceptance(workspaceId: string): Promise<Lead[]> {
  const rows = (
    await getDb().execute(sql`
      select a.id, a.name, a.strategy_id, a.linkedin, a.extra -> 'linkedin' ->> 'providerId' as provider_id
      from audiences a
      where a.workspace_id = ${workspaceId} and a.strategy_id is not null
        and exists (
          select 1 from events e
          where e.workspace_id = a.workspace_id and e.audience_id = a.id and e.strategy_id = a.strategy_id
            and e.kind = ${SENT_EVENT_KIND} and e.payload ->> 'kind' = 'li_invite')
        and not exists (
          select 1 from events e
          where e.workspace_id = a.workspace_id and e.audience_id = a.id and e.strategy_id = a.strategy_id
            and e.kind = ${LEAD_EVENT.accepted})
      limit 2000`)
  ).rows as { id: string; name: string; strategy_id: string | null; linkedin: string | null; provider_id: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    strategyId: r.strategy_id,
    providerId: r.provider_id ?? "",
    slug: storedSlug(r.linkedin),
  }));
}

export type AcceptancePull = { checked: number; accepted: number };

export async function pullAcceptances(
  adapter: LinkedInChannelAdapter,
  workspaceId: string,
  options: { force?: boolean } = {},
): Promise<AcceptancePull> {
  const result: AcceptancePull = { checked: 0, accepted: 0 };
  const now = Date.now();
  if (!options.force && now - (lastPull.get(workspaceId) ?? 0) < PULL_EVERY_MS) return result;
  lastPull.set(workspaceId, now);

  const waiting = await awaitingAcceptance(workspaceId);
  if (!waiting.length) return result;

  const accounts = await getDb()
    .select({ id: channelAccounts.id, providerAccountId: channelAccounts.providerAccountId })
    .from(channelAccounts)
    .where(
      and(
        eq(channelAccounts.workspaceId, workspaceId),
        eq(channelAccounts.channel, "linkedin"),
        eq(channelAccounts.provider, adapter.provider),
        eq(channelAccounts.state, "healthy"),
      ),
    );

  for (const account of accounts) {
    if (!account.providerAccountId) continue;
    let relations: ProviderRelation[];
    try {
      relations = await adapter.listRelations({ accountId: account.providerAccountId, limit: 100 });
    } catch (caught) {
      console.error("[relations] pull", workspaceId, caught);
      continue;
    }
    result.checked += relations.length;
    for (const lead of waiting) {
      if (!relations.some((r) => samePerson(lead, r))) continue;
      if (await recordAcceptance(workspaceId, account.id, lead, "pull")) result.accepted += 1;
    }
  }
  return result;
}

/**
 * Called when an invite is about to go to someone LinkedIn already shows as a first-degree
 * connection: there is nothing to accept, so the plan treats it as accepted rather than letting a
 * condition wait out its window for a click that can never come.
 */
export async function recordAlreadyConnected(
  workspaceId: string,
  accountId: string,
  lead: { id: string; name: string; strategyId: string | null },
): Promise<void> {
  await recordAcceptance(workspaceId, accountId, { ...lead, providerId: "", slug: "" }, "already_connected");
}
