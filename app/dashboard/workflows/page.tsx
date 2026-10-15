import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkflowsScreen } from "@/components/app/WorkflowsScreen";
import { resolveSession, SESSION_COOKIE } from "@/lib/auth";
import { getRepository } from "@/lib/data";
import { summariseStored } from "@/lib/app/workflowLibrary";
import { LOGIN_HREF } from "@/lib/site";

export const metadata: Metadata = { title: "Workflows" };

export default async function WorkflowsPage() {
  const who = await resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!who) redirect(LOGIN_HREF);
  const ctx = { workspaceId: who.workspaceId, userId: who.userId };

  const repo = getRepository();
  const [{ items: campaigns }, records] = await Promise.all([
    repo.listCampaigns(ctx, { type: "multichannel" }),
    repo.listWorkflows(ctx),
  ]);
  const byCampaign = new Map(records.map((r) => [r.campaignId, r]));

  return (
    <WorkflowsScreen
      workflows={campaigns.map((c) => {
        const record = byCampaign.get(c.id);
        return summariseStored(c, record?.graph, record?.name);
      })}
    />
  );
}
