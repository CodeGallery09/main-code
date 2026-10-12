import { getRepository } from "@/lib/data";
import { fail, json, sessionEmail } from "@/lib/http";

/** GET /api/leads/:id */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sessionEmail())) return fail("unauthenticated", "Sign in to use this endpoint.", 401);
  const { id } = await params;
  const lead = await getRepository().getLead(id);
  if (!lead) return fail("not_found", `No lead with id ${id}.`, 404);
  return json({ lead });
}
