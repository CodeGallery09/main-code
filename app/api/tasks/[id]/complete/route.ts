import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/** POST /api/tasks/:id/complete — marks a to-do as handled. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // withUser turns a null return into a 404, so a task in another workspace is indistinguishable
  // from one that does not exist — which is what we want it to be.
  return withUser(async (ctx) => {
    const task = await getRepository().completeTask(ctx, id);
    return task && { task };
  });
}
