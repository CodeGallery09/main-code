import { validateWorkflowGraph, validateWorkflowName } from "@/lib/app/workflow";
import { getRepository } from "@/lib/data";
import { failFields, readJson, withUser } from "@/lib/http";

/** GET /api/campaigns/:id/workflow — 404 when the campaign has no saved workflow yet. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const workflow = await getRepository().getWorkflow(ctx, id);
    return workflow && { workflow };
  });
}

/**
 * PUT /api/campaigns/:id/workflow — replace the workflow with `{ name, graph }`.
 *
 * The graph is rebuilt from a whitelist by `validateWorkflowGraph` before it is stored, so what
 * lands in the jsonb column is never the request body itself. The builder sends the whole graph on
 * every save, which is what makes this a PUT rather than a patch.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson(request);
  if (typeof body !== "object" || body === null) {
    return failFields({ graph: "Send the workflow as JSON." });
  }
  const { name, graph } = body as { name?: unknown; graph?: unknown };

  const checkedName = validateWorkflowName(name);
  if (!checkedName.ok) return failFields({ name: checkedName.error });
  const checkedGraph = validateWorkflowGraph(graph);
  if (!checkedGraph.ok) return failFields({ graph: checkedGraph.error });

  return withUser(async (ctx) => {
    const workflow = await getRepository().saveWorkflow(ctx, id, {
      name: checkedName.data,
      graph: checkedGraph.data,
    });
    if (!workflow) return null;
    return "error" in workflow ? workflow : { workflow };
  });
}
