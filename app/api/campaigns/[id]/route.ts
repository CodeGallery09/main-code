import { getRepository } from "@/lib/data";
import { failFields, readJson, withUser } from "@/lib/http";
import { validateCampaign } from "@/lib/data/validate";

/** GET /api/campaigns/:id */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const campaign = await getRepository().getCampaign(ctx, id);
    return campaign && { campaign };
  });
}

/**
 * PATCH /api/campaigns/:id — partial update. `{ status }` alone is the pause/resume toggle the
 * campaigns table uses; the same endpoint takes name, type and channels.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson(request);
  const checked = validateCampaign(body, true);
  if (!checked.ok) return failFields(checked.errors);

  return withUser(async (ctx) => {
    const campaign = await getRepository().updateCampaign(ctx, id, checked.data);
    if (!campaign) return null;
    return "error" in campaign ? campaign : { campaign };
  });
}

/** DELETE /api/campaigns/:id — leads and threads survive with their reference cleared. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const gone = await getRepository().deleteCampaign(ctx, id);
    return gone ? { deleted: id } : null;
  });
}
