/**
 * Pulling replies in, for a workspace whose webhook deliveries are not arriving.
 *
 * The provider pushes inbound messages to `/api/webhooks/unipile/messages`, which is the right
 * way round — it is instant and costs nothing. But a delivery needs `UNIPILE_WEBHOOK_SECRET` set
 * and the webhook registered, and a workspace where either is missing would simply never see a
 * reply. So the Inbox can also ask: this reads the recent chats on each connected account and
 * hands anything new to the very same writer the webhook uses, which makes it idempotent on the
 * provider's message id and keeps one code path for what a reply does.
 *
 * Server-only, and read-only at the provider: it sends nothing.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { channelAccounts } from "@/lib/db/schema";
import type { LinkedInChannelAdapter } from "./adapter";
import { applyInboundMessage } from "./inbound";

/** How far back a pull looks. A chat quieter than this has nothing new worth walking. */
const CHATS = 25;
const MESSAGES_PER_CHAT = 10;

export type PullResult = { checked: number; stored: number; accounts: number };

export async function pullRecentMessages(adapter: LinkedInChannelAdapter, workspaceId: string): Promise<PullResult> {
  const accounts = await getDb()
    .select({ providerAccountId: channelAccounts.providerAccountId })
    .from(channelAccounts)
    .where(
      and(
        eq(channelAccounts.workspaceId, workspaceId),
        eq(channelAccounts.channel, "linkedin"),
        eq(channelAccounts.provider, adapter.provider),
        eq(channelAccounts.state, "healthy"),
      ),
    );

  let checked = 0;
  let stored = 0;
  for (const account of accounts) {
    if (!account.providerAccountId) continue;
    const chats = await adapter.listChats({ accountId: account.providerAccountId, limit: CHATS });
    for (const chat of chats) {
      const messages = await adapter.listMessages({
        accountId: account.providerAccountId,
        chatId: chat.id,
        limit: MESSAGES_PER_CHAT,
      });
      for (const message of messages) {
        if (message.fromMe || !message.text) continue;
        checked += 1;
        const result = await applyInboundMessage(adapter.provider, {
          accountId: account.providerAccountId,
          messageId: message.id,
          chatId: message.chatId,
          // Unipile names the other side of a one-to-one chat on the chat, not always on the message.
          senderId: message.senderId || chat.attendeeId,
          senderName: message.senderName || chat.name,
          text: message.text,
          sentAt: message.sentAt,
          fromMe: false,
        });
        if (result.stored) stored += 1;
      }
    }
  }
  return { checked, stored, accounts: accounts.length };
}
