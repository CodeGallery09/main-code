import { runScheduledTick } from "@/lib/engine/scheduler";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The scheduler's door. GET and POST both work, because different schedulers send different verbs.
 *
 * **This is the only route with no session.** It acts for every workspace at once, so it cannot be
 * authorised by a cookie; it is authorised by `CRON_SECRET` instead, carried either as
 * `Authorization: Bearer …` (what Vercel Cron sends) or as `?token=` (what a plain HTTP scheduler
 * such as GitHub Actions or cron-job.org can send). **An unset secret refuses every call** — an
 * open endpoint that advances everybody's outreach is not something to leave lying around, and a
 * deployment that has not set it simply has no scheduler, which the Setup screen says.
 *
 * It never takes a workspace id from the request: the list comes from the strategies table.
 */
async function tick(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return fail("not_configured", "No scheduler secret is set on this deployment.", 503);

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const query = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (bearer !== secret && query !== secret) {
    return fail("unauthenticated", "That scheduler secret is not right.", 401);
  }

  try {
    return json(await runScheduledTick());
  } catch (error) {
    console.error("[jobs/tick]", error);
    return fail("server_error", "The scheduled run could not finish.", 500);
  }
}

export const GET = tick;
export const POST = tick;
