import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { WorkflowBuilder } from "@/components/app/builder/WorkflowBuilder";
import { resolveSession, SESSION_COOKIE } from "@/lib/auth";
import { getRepository } from "@/lib/data";
import {
  fromGraph,
  graphFromTemplate,
  TEMPLATES,
  validateWorkflowGraph,
  type WorkflowStatus,
} from "@/lib/app/workflow";
import type { StrategyStatus } from "@/lib/data/types";
import { LOGIN_HREF } from "@/lib/site";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ template?: string }> };

/** The builder knows three states; a strategy has six. Finished and scheduled ones read as the nearest. */
const STATUS_OF: Record<StrategyStatus, WorkflowStatus> = {
  live: "live",
  paused: "paused",
  completed: "paused",
  draft: "draft",
  scheduled: "draft",
};

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

async function context() {
  const who = await resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!who) redirect(LOGIN_HREF);
  return { workspaceId: who.workspaceId, userId: who.userId };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const strategy = await getRepository().getStrategy(await context(), id);
  return { title: strategy ? strategy.name : "Workflow" };
}

/**
 * The builder for one strategy's workflow. The route id is the strategy id; a workflow is stored
 * per multichannel strategy, so an unknown id, another workspace's id, or a standalone strategy
 * all read as "not found" — the repository filters by workspace, so there is nothing to leak.
 */
export default async function WorkflowBuilderPage({ params, searchParams }: Params) {
  const { id } = await params;
  // Older links and the library's "new" route have no strategy to open: send them to the library,
  // where a template creates a strategy first.
  if (id === "new" || /^\d+$/.test(id)) redirect("/dashboard/workflows");

  const ctx = await context();
  const repo = getRepository();
  const strategy = await repo.getStrategy(ctx, id);
  if (!strategy || strategy.type !== "multichannel") notFound();

  const [record, { items }] = await Promise.all([
    repo.getWorkflow(ctx, id),
    repo.listStrategies(ctx, { type: "multichannel" }),
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

  const status = STATUS_OF[strategy.status];
  const workflow = fromGraph(graph, {
    id: strategy.id,
    name: record?.name ?? strategy.name,
    status,
    started: status === "draft" ? null : DATE.format(new Date(strategy.startedAt)),
  });

  return (
    <WorkflowBuilder
      workflow={workflow}
      // No row yet: the builder saves the starting graph straight away so a reload finds it.
      stored={Boolean(record)}
      isSample={Boolean(strategy.isSample)}
      strategies={items.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
