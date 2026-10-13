import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/** GET /api/threads?filter=to-reply|all&q= — the inbox list. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filter = params.get("filter") === "all" ? "all" : "to-reply";
  return withUser(async (ctx) => ({
    threads: await getRepository().listThreads(ctx, { filter, q: params.get("q") ?? undefined }),
  }));
}
