import { getRepository } from "@/lib/data";
import { fail, json, sessionEmail } from "@/lib/http";

/** GET /api/threads/:id — one conversation with its messages. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sessionEmail())) return fail("unauthenticated", "Sign in to use this endpoint.", 401);
  const { id } = await params;
  const found = await getRepository().getThread(id);
  if (!found) return fail("not_found", `No thread with id ${id}.`, 404);
  return json(found);
}
