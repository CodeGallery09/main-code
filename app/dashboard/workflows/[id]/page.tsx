import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BuilderView, type AudienceOption } from "@/components/ws/builder/builder-view";
import { resolveSession, SESSION_COOKIE } from "@/lib/auth";
import { getRepository } from "@/lib/data";
import {
  AUDIENCE_CAMPAIGN,
  AUDIENCE_WORKSPACE,
  graphFromTemplate,
  TEMPLATES,
  validateWorkflowGraph,
} from "@/lib/app/workflow";
import { CAMPAIGNS_HREF } from "@/lib/nav";
import { LOGIN_HREF } from "@/lib/site";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ template?: string }> };

async function context() {
  const who = await resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!who) redirect(LOGIN_HREF);
  return { workspaceId: who.workspaceId, userId: who.userId };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (id === "new" || /^\d+$/.test(id)) return { title: "Strategy" };
  const strategy = await getRepository().getStrategy(await context(), id);
  return { title: strategy ? strategy.name : "Strategy" };
}

/**
 * The builder for one strategy's plan. The route id is the strategy id, and a
 * workflow is stored per multichannel strategy, so an unknown id, another
 * workspace's id, or a standalone strategy all read as "not found" — the
 * repository filters by workspace, so there is nothing to leak.
 */
export default async function BuilderPage({ params, searchParams }: Params) {
  const { id } = await params;
  // Older links and the removed library's "new" route have no strategy to open.
  if (id === "new" || /^\d+$/.test(id)) redirect(CAMPAIGNS_HREF);

  const ctx = await context();
  const repo = getRepository();
  const strategy = await repo.getStrategy(ctx, id);
  if (!strategy || strategy.type !== "multichannel") notFound();

  const [record, segments, everyone] = await Promise.all([
    repo.getWorkflow(ctx, id),
    repo.listSegments(ctx),
    repo.listAudiences(ctx, { pageSize: 1 }),
  ]);

  let graph;
  if (record) {
    // Written through the same validator, so this only fails if a row was edited by hand.
    const checked = validateWorkflowGraph(record.graph);
    if (!checked.ok) throw new Error(`Stored workflow for ${id} is invalid: ${checked.error}`);
    graph = checked.data;
  } else {
    const { template } = await searchParams;
    graph = graphFromTemplate(TEMPLATES.some((t) => t.k === template) ? template : "blank");
  }

  const audiences: AudienceOption[] = [
    { value: AUDIENCE_CAMPAIGN, label: "Leads in this strategy", size: strategy.audiences },
    { value: AUDIENCE_WORKSPACE, label: "Every lead in the workspace", size: everyone.total },
    ...segments.map((s) => ({ value: s.id, label: s.name, size: s.audienceCount })),
  ];

  return (
    <BuilderView
      strategyId={strategy.id}
      initialName={record?.name ?? strategy.name}
      status={strategy.status}
      graph={graph}
      // No row yet: the builder saves the starting graph straight away so a reload finds it.
      stored={Boolean(record)}
      audiences={audiences}
      channels={strategy.channels}
    />
  );
}
