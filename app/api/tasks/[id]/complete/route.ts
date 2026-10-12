import { getRepository } from "@/lib/data";
import { fail, json, sessionEmail } from "@/lib/http";

/** POST /api/tasks/:id/complete — marks a to-do as handled. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sessionEmail())) return fail("unauthenticated", "Sign in to use this endpoint.", 401);
  const { id } = await params;
  const task = await getRepository().completeTask(id);
  if (!task) return fail("not_found", `No task with id ${id}.`, 404);
  return json({ task });
}
