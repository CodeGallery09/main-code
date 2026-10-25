/**
 * Inserts the sample world (lib/data/sample.ts) for a brand-new workspace.
 *
 * Called from inside the `signUp` transaction, so a workspace never exists half-seeded: either it
 * has the account, the quotas and the sample, or none of it was created. Server-only — it writes
 * through Drizzle.
 *
 * What a new workspace gets, all of it flagged as sample and removed by "Remove sample data":
 * - one paused multichannel strategy with its workflow, and 8 audiences in it;
 * - conversations and to-dos for the audiences who replied, so Inbox and Home have something in them;
 * - the strategy's funnel by day, so Analytics has a chart, matching the strategy's own figures;
 * - one LinkedIn account, one mailbox and one sending domain, owned by the workspace and assigned
 *   to the sample strategy, so Configuration shows how accounts are shared across strategies.
 */

import { randomBytes } from "node:crypto";
import { AUDIENCE_CAMPAIGN, graphFromTemplate } from "@/lib/app/workflow";
import {
  SAMPLE_ACCOUNTS,
  SAMPLE_CAMPAIGN,
  SAMPLE_LEADS,
  SAMPLE_ROLLUPS,
  SAMPLE_TASKS,
  SAMPLE_THREADS,
} from "@/lib/data/sample";
import {
  strategyAccounts,
  strategies,
  channelAccounts,
  dailyRollups,
  audiences,
  messages,
  sendingDomains,
  tasks,
  threads,
  workflows,
} from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

const id = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** `YYYY-MM-DD` in UTC, the grain of `daily_rollups.day`. */
const dayKey = (at: number) => new Date(at).toISOString().slice(0, 10);

export async function seedSampleWorkspace(tx: Tx, workspaceId: string, ownerId: string): Promise<void> {
  const now = Date.now();
  const strategyId = id("c");

  await tx.insert(strategies).values({
    id: strategyId,
    workspaceId,
    name: SAMPLE_CAMPAIGN.name,
    status: SAMPLE_CAMPAIGN.status,
    type: SAMPLE_CAMPAIGN.type,
    channels: [...SAMPLE_CAMPAIGN.channels],
    version: SAMPLE_CAMPAIGN.version,
    startedAt: new Date(now - SAMPLE_CAMPAIGN.startedDaysAgo * DAY),
    audiences: SAMPLE_LEADS.length,
    sent: SAMPLE_CAMPAIGN.sent,
    delivered: SAMPLE_CAMPAIGN.delivered,
    // numeric columns take strings, matching what pg hands back.
    openRate: String(SAMPLE_CAMPAIGN.openRate),
    replyRate: String(SAMPLE_CAMPAIGN.replyRate),
    clicks: SAMPLE_CAMPAIGN.clicks,
    isSample: true,
  });

  const audienceIds = new Map<string, string>();
  await tx.insert(audiences).values(
    SAMPLE_LEADS.map((audience) => {
      const audienceId = id("l");
      audienceIds.set(audience.email, audienceId);
      return {
        id: audienceId,
        workspaceId,
        name: audience.name,
        company: audience.company,
        title: audience.title,
        email: audience.email,
        phone: audience.phone,
        stage: audience.stage,
        score: audience.score,
        source: audience.source,
        tags: audience.tags,
        consent: audience.consent,
        avgCallSeconds: audience.avgCallSeconds,
        messageCount: audience.messageCount,
        callCount: audience.callCount,
        nextStep: audience.nextStep,
        ownerId,
        strategyId,
        starred: audience.starred,
        isSample: true,
      };
    }),
  );
  const audienceIdOf = (email: string) => {
    const found = audienceIds.get(email);
    if (!found) throw new Error(`sample audience ${email} is not in SAMPLE_LEADS`);
    return found;
  };

  // The sample strategy's workflow is the outbound template, reading from the strategy's own
  // audiences — so the canvas shows real counts from the sample audiences above.
  await tx.insert(workflows).values({
    id: id("wf"),
    workspaceId,
    strategyId,
    name: SAMPLE_CAMPAIGN.name,
    graph: graphFromTemplate("outbound", AUDIENCE_CAMPAIGN),
  });

  /* Conversations: each thread's `lastAt` is its newest message. */
  for (const thread of SAMPLE_THREADS) {
    const threadId = id("t");
    const newest = Math.min(...thread.messages.map((m) => m.hoursAgo));
    const latest = [...thread.messages].sort((a, b) => a.hoursAgo - b.hoursAgo)[0];
    await tx.insert(threads).values({
      id: threadId,
      workspaceId,
      audienceId: audienceIdOf(thread.audienceEmail),
      channel: thread.channel,
      intent: thread.intent,
      role: thread.role,
      preview: latest.body,
      unread: thread.unread,
      needsReply: thread.needsReply,
      lastAt: new Date(now - newest * HOUR),
      strategyId,
      ownerId,
      signals: thread.signals,
    });
    await tx.insert(messages).values(
      thread.messages.map((m) => ({
        id: id("m"),
        workspaceId,
        threadId,
        from: m.from,
        channel: thread.channel,
        body: m.body,
        sentAt: new Date(now - m.hoursAgo * HOUR),
        // Anything from the audience on a thread still waiting on us is unread.
        read: !(thread.unread && m.from === "them"),
      })),
    );
  }

  await tx.insert(tasks).values(
    SAMPLE_TASKS.map((task) => ({
      id: id("tk"),
      workspaceId,
      kind: task.kind,
      audienceId: audienceIdOf(task.audienceEmail),
      summary: task.summary,
      channel: task.channel,
      whenLabel: task.when,
    })),
  );

  await tx.insert(dailyRollups).values(
    SAMPLE_ROLLUPS.map((row) => ({
      workspaceId,
      day: dayKey(now - row.daysAgo * DAY),
      channel: row.channel,
      reached: row.reached,
      engaged: row.engaged,
      replied: row.replied,
      positive: row.positive,
      meetings: row.meetings,
      isSample: true,
    })),
  );

  /* Org-level accounts, shared by the sample strategy (and any the user makes later). */
  const linkedinId = id("a");
  const mailboxId = id("a");
  await tx.insert(channelAccounts).values([
    {
      id: linkedinId,
      workspaceId,
      channel: "linkedin",
      name: SAMPLE_ACCOUNTS.linkedin.name,
      handle: SAMPLE_ACCOUNTS.linkedin.handle,
      state: SAMPLE_ACCOUNTS.linkedin.state,
      settings: SAMPLE_ACCOUNTS.linkedin.settings,
      isSample: true,
    },
    {
      id: mailboxId,
      workspaceId,
      channel: "email",
      name: SAMPLE_ACCOUNTS.email.name,
      handle: SAMPLE_ACCOUNTS.email.handle,
      state: SAMPLE_ACCOUNTS.email.state,
      settings: SAMPLE_ACCOUNTS.email.settings,
      isSample: true,
    },
  ]);
  await tx.insert(sendingDomains).values({
    id: id("d"),
    workspaceId,
    host: SAMPLE_ACCOUNTS.domain.host,
    spf: SAMPLE_ACCOUNTS.domain.spf,
    dkim: SAMPLE_ACCOUNTS.domain.dkim,
    dmarc: SAMPLE_ACCOUNTS.domain.dmarc,
    isSample: true,
  });
  await tx.insert(strategyAccounts).values([
    { workspaceId, strategyId, accountId: linkedinId },
    { workspaceId, strategyId, accountId: mailboxId },
  ]);
}
