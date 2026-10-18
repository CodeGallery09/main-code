import { getRepository } from "@/lib/data";
import { resolveWindow } from "@/lib/data/query";
import { withUser } from "@/lib/http";

/**
 * GET /api/overview?range=7d|30d|90d&from=&to=&campaignId=
 *
 * Everything the dashboard home screen shows. The window is either a range key or the explicit
 * `from`/`to` the date picker sends; `campaignId` narrows the figures to one strategy.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const window = resolveWindow({
    range: params.get("range"),
    from: params.get("from"),
    to: params.get("to"),
  });
  const campaignId = params.get("campaignId");
  return withUser((ctx) =>
    getRepository().getOverview(ctx, {
      ...window,
      campaignId: campaignId && campaignId !== "all" ? campaignId : null,
    }),
  );
}
