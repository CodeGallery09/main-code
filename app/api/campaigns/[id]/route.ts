import { getRepository } from "@/lib/data";
import { fail, json, sessionEmail } from "@/lib/http";
import type { CampaignStatus } from "@/lib/data/types";

const STATUSES: CampaignStatus[] = ["live", "scheduled", "paused", "draft"];

/** GET /api/campaigns/:id */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sessionEmail())) return fail("unauthenticated", "Sign in to use this endpoint.", 401);
  const { id } = await params;
  const campaign = await getRepository().getCampaign(id);
  if (!campaign) return fail("not_found", `No campaign with id ${id}.`, 404);
  return json({ campaign });
}

/** PATCH /api/campaigns/:id — body { status } to pause or resume. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sessionEmail())) return fail("unauthenticated", "Sign in to use this endpoint.", 401);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad_request", "Request body must be JSON.", 400);
  }
  const status = (body as { status?: unknown })?.status;
  if (typeof status !== "string" || !STATUSES.includes(status as CampaignStatus)) {
    return fail("invalid", `status must be one of ${STATUSES.join(", ")}.`, 422);
  }
  const campaign = await getRepository().setCampaignStatus(id, status as CampaignStatus);
  if (!campaign) return fail("not_found", `No campaign with id ${id}.`, 404);
  return json({ campaign });
}
