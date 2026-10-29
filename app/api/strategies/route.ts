import { getRepository } from "@/lib/data";
import { failFields, parseRange, readJson, withUser } from "@/lib/http";
import { validateStrategy } from "@/lib/data/validate";
import type { StrategyStatus, StrategyType, Channel } from "@/lib/data/types";

/** GET /api/strategies?q=&status=&type=&channel=&range= */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return withUser((ctx) =>
    getRepository().listStrategies(ctx, {
      q: params.get("q") ?? undefined,
      status: (params.get("status") ?? "all") as StrategyStatus | "all",
      type: (params.get("type") ?? "all") as StrategyType | "all",
      channel: (params.get("channel") ?? "all") as Channel | "all",
      range: parseRange(params.get("range")),
    }),
  );
}

/** POST /api/strategies — creates a strategy. */
export async function POST(request: Request) {
  const body = await readJson(request);
  const checked = validateStrategy(body);
  if (!checked.ok) return failFields(checked.errors);
  if (checked.data.status === "live" || checked.data.status === "scheduled") {
    return failFields({ status: "A new strategy starts as a draft. Use Launch to start it." });
  }

  return withUser(async (ctx) => {
    const strategy = await getRepository().createStrategy(ctx, checked.data);
    return "error" in strategy ? strategy : { strategy };
  });
}
