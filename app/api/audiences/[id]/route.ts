import { getRepository } from "@/lib/data";
import { failFields, readJson, withUser } from "@/lib/http";
import { validateAudience } from "@/lib/data/validate";

/** GET /api/audiences/:id */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const audience = await getRepository().getAudience(ctx, id);
    return audience && { audience };
  });
}

/** PATCH /api/audiences/:id — partial update; only the fields sent are applied. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson(request);
  const checked = validateAudience(body, true);
  if (!checked.ok) return failFields(checked.errors);

  return withUser(async (ctx) => {
    const audience = await getRepository().updateAudience(ctx, id, checked.data);
    if (!audience) return null;
    return "error" in audience ? audience : { audience };
  });
}

/** DELETE /api/audiences/:id */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const gone = await getRepository().deleteAudience(ctx, id);
    return gone ? { deleted: id } : null;
  });
}
