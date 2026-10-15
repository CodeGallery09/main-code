/**
 * Inserts the sample content (lib/data/sample.ts) for a brand-new workspace.
 *
 * Called from inside the `signUp` transaction, so a workspace never exists half-seeded: either it
 * has the account, the quotas and the sample, or none of it was created. Server-only — it writes
 * through Drizzle.
 *
 * Everything inserted is flagged `is_sample`, which is what lets "Remove sample data" delete
 * exactly these rows and nothing the user made.
 */

import { randomBytes } from "node:crypto";
import { AUDIENCE_CAMPAIGN, graphFromTemplate } from "@/lib/app/workflow";
import { SAMPLE_CAMPAIGN, SAMPLE_LEADS } from "@/lib/data/sample";
import { campaigns, leads, workflows } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

const id = (prefix: string) => `${prefix}_${randomBytes(9).toString("base64url")}`;

export async function seedSampleWorkspace(tx: Tx, workspaceId: string, ownerId: string): Promise<void> {
  const campaignId = id("c");
  const startedAt = new Date(Date.now() - SAMPLE_CAMPAIGN.startedDaysAgo * 86_400_000);

  await tx.insert(campaigns).values({
    id: campaignId,
    workspaceId,
    name: SAMPLE_CAMPAIGN.name,
    status: SAMPLE_CAMPAIGN.status,
    type: SAMPLE_CAMPAIGN.type,
    channels: [...SAMPLE_CAMPAIGN.channels],
    version: SAMPLE_CAMPAIGN.version,
    startedAt,
    leads: SAMPLE_LEADS.length,
    sent: SAMPLE_CAMPAIGN.sent,
    delivered: SAMPLE_CAMPAIGN.delivered,
    // numeric columns take strings, matching what pg hands back.
    openRate: String(SAMPLE_CAMPAIGN.openRate),
    replyRate: String(SAMPLE_CAMPAIGN.replyRate),
    clicks: SAMPLE_CAMPAIGN.clicks,
    isSample: true,
  });

  await tx.insert(leads).values(
    SAMPLE_LEADS.map((lead) => ({
      id: id("l"),
      workspaceId,
      name: lead.name,
      company: lead.company,
      title: lead.title,
      email: lead.email,
      phone: lead.phone,
      stage: lead.stage,
      score: lead.score,
      source: lead.source,
      tags: lead.tags,
      consent: lead.consent,
      avgCallSeconds: lead.avgCallSeconds,
      messageCount: lead.messageCount,
      callCount: lead.callCount,
      nextStep: lead.nextStep,
      ownerId,
      campaignId,
      starred: lead.starred,
      isSample: true,
    })),
  );

  // The sample campaign's workflow is the outbound template, reading from the campaign's own
  // leads — so the canvas shows real counts from the sample leads above.
  await tx.insert(workflows).values({
    id: id("wf"),
    workspaceId,
    campaignId,
    name: SAMPLE_CAMPAIGN.name,
    graph: graphFromTemplate("outbound", AUDIENCE_CAMPAIGN),
  });
}
