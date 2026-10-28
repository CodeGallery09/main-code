/**
 * What a provider's callbacks are allowed to change — the one place in the app that writes
 * workspace rows without a `Ctx`.
 *
 * **Why the exception exists.** Every other write resolves the workspace from the session cookie
 * (`lib/http.ts` → `Ctx`), because a workspace id in a request body is forgeable. A webhook has no
 * session: all it carries is the provider's own account id. So the workspace is *derived* from
 * that id through `channel_accounts.provider_account_id`, which is unique across the whole table
 * (`channel_accounts_provider_key`) — one provider account belongs to exactly one workspace, and
 * the lookup cannot be steered by the caller because an unknown id simply resolves to nothing.
 *
 * **What that means in practice.** The functions here take a provider account id, resolve the row,
 * and then scope every write to the workspace they found. They never accept a workspace id, a
 * audience id or an account id from the request. Nothing here trusts the body beyond the fields the
 * normalisers in `events.ts` extract.
 *
 * Server-only. Requires a database: in demo mode there is nothing to write to and the routes say
 * so rather than dropping deliveries silently.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  channelAccounts,
  connectSessions,
  events as eventsTable,
  audiences as audiencesTable,
  messages as messagesTable,
  threads as threadsTable,
} from "@/lib/db/schema";
import { ACCOUNT_EVENT } from "@/lib/data/accountEvents";
import type { AccountStatusEvent, MessageEvent, ProviderAccountStatus } from "./events";
import type { LinkedInChannelAdapter } from "./adapter";

const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The account row a provider id resolves to, and the workspace that owns it. */
type Resolved = {
  accountId: string;
  workspaceId: string;
  channel: "linkedin" | "email" | "whatsapp" | "call" | "sms";
  name: string;
  handle: string;
};

export async function resolveProviderAccount(provider: string, providerAccountId: string): Promise<Resolved | null> {
  const db = getDb();
  const [row] = await db
    .select({
      accountId: channelAccounts.id,
      workspaceId: channelAccounts.workspaceId,
      channel: channelAccounts.channel,
      name: channelAccounts.name,
      handle: channelAccounts.handle,
    })
    .from(channelAccounts)
    .where(and(eq(channelAccounts.provider, provider), eq(channelAccounts.providerAccountId, providerAccountId)))
    .limit(1);
  return row ?? null;
}

/**
 * The provider's status words, as the state the account row carries.
 *
 * `restricted` is kept distinct from `signed_out` on purpose: they need different words in the UI
 * and only one of them is fixed by signing in again.
 */
export function accountStateFor(status: ProviderAccountStatus): string {
  if (status === "ok") return "healthy";
  if (status === "restricted") return "restricted";
  if (status === "connecting") return "connecting";
  return "signed_out";
}

/* ---------- a hosted sign-in completed ------------------------------------ */

export type AttachResult =
  | { ok: true; accountId: string; workspaceId: string }
  | { ok: false; reason: "unknown_reference" | "expired" | "already_used" | "provider_unknown" | "taken" };

/**
 * Attaches a freshly connected provider account to the workspace that asked for it.
 *
 * `reference` is the connect-session id we handed the provider; it is the only thing that names
 * the workspace, so it is checked for existence, state and expiry before anything is written. A
 * provider account already attached elsewhere is refused rather than moved: the unique index would
 * refuse it anyway, and silently re-homing someone's connection would be the worst possible
 * outcome of a replayed callback.
 */
export async function attachConnectedAccount(
  adapter: LinkedInChannelAdapter,
  reference: string,
  providerAccountId: string,
): Promise<AttachResult> {
  const db = getDb();
  const [session] = await db.select().from(connectSessions).where(eq(connectSessions.id, reference)).limit(1);
  if (!session) return { ok: false, reason: "unknown_reference" };
  if (session.state !== "pending") return { ok: false, reason: "already_used" };
  if (session.expiresAt.getTime() < Date.now()) {
    await db.update(connectSessions).set({ state: "expired" }).where(eq(connectSessions.id, reference));
    return { ok: false, reason: "expired" };
  }

  // Identity comes from the provider, never from the callback body: the body is whatever reached
  // our URL, while this is an authenticated read with our API key.
  const account = await adapter.getAccount(providerAccountId);
  if (!account) return { ok: false, reason: "provider_unknown" };

  const existing = await resolveProviderAccount(adapter.provider, providerAccountId);
  if (existing && existing.workspaceId !== session.workspaceId) return { ok: false, reason: "taken" };

  const now = new Date();
  const state = accountStateFor(account.status);
  // The provider reports neither name nor handle for an account still syncing; "" would wipe a
  // good value on a reconnect, so each field only overwrites when the provider gave one.
  const name = account.name || existing?.name || "LinkedIn account";
  const handle = account.handle || existing?.handle || "";
  // Name the provider's word when the account is not healthy, so the screen is not guessing.
  const detail = state === "healthy" || !account.rawStatus ? "" : `The provider reports ${account.rawStatus}.`;

  const accountId = await db.transaction(async (tx) => {
    let id = existing?.accountId ?? session.accountId ?? null;
    if (id) {
      await tx
        .update(channelAccounts)
        .set({
          name,
          handle,
          state,
          provider: adapter.provider,
          providerAccountId,
          statusDetail: detail,
          connectedAt: now,
          lastEventAt: now,
        })
        .where(and(eq(channelAccounts.id, id), eq(channelAccounts.workspaceId, session.workspaceId)));
    } else {
      id = newId("acc");
      await tx.insert(channelAccounts).values({
        id,
        workspaceId: session.workspaceId,
        channel: session.channel,
        name,
        handle,
        state,
        provider: adapter.provider,
        providerAccountId,
        statusDetail: detail,
        connectedAt: now,
        lastEventAt: now,
        // The daily caps a new seat starts on: the conservative end of what operators report as
        // safe, not LinkedIn's ceiling. The user can raise them on the Configuration screen.
        settings: { connections: 20, messages: 40, visits: 60, inmail: null },
      });
    }

    await tx
      .update(connectSessions)
      .set({ state: "connected", providerAccountId, accountId: id })
      .where(eq(connectSessions.id, reference));

    await tx.insert(eventsTable).values({
      id: newId("ev"),
      workspaceId: session.workspaceId,
      kind: ACCOUNT_EVENT.connected,
      channel: session.channel,
      payload: { accountId: id, provider: adapter.provider, status: account.status, kind: session.kind },
      occurredAt: now,
    });
    return id;
  });

  return { ok: true, accountId, workspaceId: session.workspaceId };
}

/** Records a failed or abandoned attempt, so the screen waiting on it stops waiting. */
export async function failConnectSession(reference: string, detail: string): Promise<void> {
  const db = getDb();
  await db
    .update(connectSessions)
    .set({ state: "failed", detail: detail.slice(0, 300) })
    .where(and(eq(connectSessions.id, reference), eq(connectSessions.state, "pending")));
}

/**
 * Re-reads, from the provider, every LinkedIn account of this workspace that is waiting on one —
 * still syncing, or signed out — and stores what it now says. The status webhook is the normal
 * path, but a freshly connected account is often still syncing when we first read it, and a
 * webhook that is unregistered or lost would leave it flagged "needs to log in" for good.
 * A restriction is left alone: signing in again does not lift it. A provider error leaves the
 * stored state as it was.
 */
export async function refreshAccountStates(adapter: LinkedInChannelAdapter, workspaceId: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: channelAccounts.id, providerAccountId: channelAccounts.providerAccountId, state: channelAccounts.state })
    .from(channelAccounts)
    .where(
      and(
        eq(channelAccounts.workspaceId, workspaceId),
        eq(channelAccounts.provider, adapter.provider),
        inArray(channelAccounts.state, ["connecting", "signed_out"]),
      ),
    );
  await Promise.all(
    rows.map(async (row) => {
      if (!row.providerAccountId) return;
      try {
        const account = await adapter.getAccount(row.providerAccountId);
        if (!account) return;
        const state = accountStateFor(account.status);
        if (state === row.state) return;
        await db
          .update(channelAccounts)
          .set({
            state,
            statusDetail: state === "healthy" || !account.rawStatus ? "" : `The provider reports ${account.rawStatus}.`,
            lastEventAt: new Date(),
          })
          .where(and(eq(channelAccounts.id, row.id), eq(channelAccounts.workspaceId, workspaceId)));
      } catch (caught) {
        console.error("[linkedin-refresh]", caught);
      }
    }),
  );
}

/* ---------- the provider changed an account's status ---------------------- */

/** `false` when the account id is not one of ours — an unknown id is ignored, not an error. */
export async function applyAccountStatus(provider: string, event: AccountStatusEvent): Promise<boolean> {
  const found = await resolveProviderAccount(provider, event.accountId);
  if (!found) return false;
  const db = getDb();
  const now = new Date();
  const state = accountStateFor(event.status);

  await db.transaction(async (tx) => {
    if (event.status === "deleted") {
      // Gone at the provider: keep the row and its strategy links, but say it needs reconnecting
      // rather than deleting a seat the user still sees in their strategies.
      await tx
        .update(channelAccounts)
        .set({ state: "signed_out", statusDetail: event.detail || "Disconnected at the provider.", lastEventAt: now })
        .where(and(eq(channelAccounts.id, found.accountId), eq(channelAccounts.workspaceId, found.workspaceId)));
    } else {
      await tx
        .update(channelAccounts)
        .set({ state, statusDetail: event.detail, lastEventAt: now })
        .where(and(eq(channelAccounts.id, found.accountId), eq(channelAccounts.workspaceId, found.workspaceId)));
    }
    await tx.insert(eventsTable).values({
      id: newId("ev"),
      workspaceId: found.workspaceId,
      kind: ACCOUNT_EVENT.status,
      channel: found.channel,
      payload: { accountId: found.accountId, status: event.status, state, detail: event.detail },
      occurredAt: now,
    });
  });
  return true;
}

/* ---------- the provider delivered a message ------------------------------ */

export type InboundMessageResult =
  | { stored: false; reason: "unknown_account" | "own_echo" | "duplicate" }
  | { stored: true; threadId: string | null };

/**
 * Records an inbound message on a connected account.
 *
 * Two deliberate limits. **It never invents an audience**: a message from someone the workspace has
 * never uploaded has no audience to hang a conversation on, so it is kept as an event and left out of
 * the inbox rather than creating a person out of a webhook. **It never counts our own sends**: the
 * provider echoes outbound messages through the same webhook.
 *
 * Idempotent on the provider's message id, because Unipile retries a delivery five times when it
 * does not get a 200 inside 30 seconds.
 */
export async function applyInboundMessage(provider: string, event: MessageEvent): Promise<InboundMessageResult> {
  if (event.fromMe) return { stored: false, reason: "own_echo" };
  const found = await resolveProviderAccount(provider, event.accountId);
  if (!found) return { stored: false, reason: "unknown_account" };

  const db = getDb();
  const [seen] = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.workspaceId, found.workspaceId),
        eq(eventsTable.kind, ACCOUNT_EVENT.message),
        sql`${eventsTable.payload} ->> 'messageId' = ${event.messageId}`,
      ),
    )
    .limit(1);
  if (seen) return { stored: false, reason: "duplicate" };

  const at = parseSentAt(event.sentAt);
  const audience = event.senderId || event.senderName ? await matchAudience(found.workspaceId, event) : null;
  const preview = event.text.slice(0, 160);

  const threadId = await db.transaction(async (tx) => {
    let id: string | null = null;
    if (audience) {
      const [open] = await tx
        .select({ id: threadsTable.id })
        .from(threadsTable)
        .where(
          and(
            eq(threadsTable.workspaceId, found.workspaceId),
            eq(threadsTable.audienceId, audience.id),
            eq(threadsTable.channel, "linkedin"),
          ),
        )
        .limit(1);
      id = open?.id ?? null;
      if (id) {
        await tx
          .update(threadsTable)
          .set({ preview, unread: true, needsReply: true, lastAt: at })
          .where(and(eq(threadsTable.id, id), eq(threadsTable.workspaceId, found.workspaceId)));
      } else {
        id = newId("th");
        await tx.insert(threadsTable).values({
          id,
          workspaceId: found.workspaceId,
          audienceId: audience.id,
          channel: "linkedin",
          role: audience.title ?? "",
          preview,
          unread: true,
          needsReply: true,
          lastAt: at,
          strategyId: audience.strategyId,
        });
      }
      await tx.insert(messagesTable).values({
        id: newId("msg"),
        workspaceId: found.workspaceId,
        threadId: id,
        from: "them",
        channel: "linkedin",
        body: event.text,
        sentAt: at,
        read: false,
      });
    }

    await tx.insert(eventsTable).values({
      id: newId("ev"),
      workspaceId: found.workspaceId,
      kind: ACCOUNT_EVENT.message,
      channel: found.channel,
      audienceId: audience?.id ?? null,
      strategyId: audience?.strategyId ?? null,
      payload: {
        accountId: found.accountId,
        messageId: event.messageId,
        chatId: event.chatId,
        senderId: event.senderId,
        senderName: event.senderName,
        matchedAudience: Boolean(audience),
      },
      occurredAt: at,
    });

    await tx
      .update(channelAccounts)
      .set({ lastEventAt: new Date() })
      .where(and(eq(channelAccounts.id, found.accountId), eq(channelAccounts.workspaceId, found.workspaceId)));
    return id;
  });

  return { stored: true, threadId };
}

/** A timestamp we can trust, or now: a malformed date must not become 1970 in the inbox. */
function parseSentAt(raw: string): Date {
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

/**
 * The audience this sender already is, matched on their LinkedIn handle. Nothing else: a name match
 * would attach a stranger's message to the wrong person's conversation.
 */
async function matchAudience(
  workspaceId: string,
  event: MessageEvent,
): Promise<{ id: string; title: string | null; strategyId: string | null } | null> {
  if (!event.senderId) return null;
  const db = getDb();
  // Handles are stored as the user typed or uploaded them, so match on the public identifier
  // appearing anywhere in the stored value rather than on an exact URL.
  const [row] = await db
    .select({ id: audiencesTable.id, title: audiencesTable.title, strategyId: audiencesTable.strategyId })
    .from(audiencesTable)
    .where(
      and(
        eq(audiencesTable.workspaceId, workspaceId),
        sql`${audiencesTable.linkedin} IS NOT NULL AND position(lower(${event.senderId}) in lower(${audiencesTable.linkedin})) > 0`,
      ),
    )
    .limit(1);
  return row ?? null;
}
