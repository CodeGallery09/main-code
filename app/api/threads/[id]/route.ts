import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/** GET /api/threads/:id — one conversation with its messages. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser((ctx) => getRepository().getThread(ctx, id));
}
