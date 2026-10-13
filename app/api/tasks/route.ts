import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";
import type { TaskKind } from "@/lib/data/types";

/** GET /api/tasks?kind=all|reply|call|review — the open to-do list. */
export async function GET(request: Request) {
  const kind = (new URL(request.url).searchParams.get("kind") ?? "all") as TaskKind | "all";
  return withUser(async (ctx) => ({ tasks: await getRepository().listTasks(ctx, { kind }) }));
}
