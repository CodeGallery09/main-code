import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkflowBuilder } from "@/components/app/builder/WorkflowBuilder";
import { CAMPAIGNS } from "@/lib/app/campaigns";
import { blankWorkflow, getWorkflow } from "@/lib/app/workflow";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (id === "new") return { title: "New campaign" };
  const workflow = getWorkflow(Number(id));
  return { title: workflow ? workflow.name : "Campaign" };
}

/**
 * The builder for one multichannel campaign, or a blank one under `/new`.
 * Standalone campaigns have no workflow behind them, so they 404 here.
 */
export default async function CampaignBuilderPage({ params }: Params) {
  const { id } = await params;
  if (id === "new") return <WorkflowBuilder workflow={blankWorkflow()} />;

  const workflow = getWorkflow(Number(id));
  if (!workflow || !CAMPAIGNS.some((c) => c.id === workflow.id)) notFound();

  return <WorkflowBuilder workflow={workflow} />;
}
