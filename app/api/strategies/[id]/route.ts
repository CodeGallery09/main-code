import { getRepository } from "@/lib/data";
import { failFields, readJson, withUser } from "@/lib/http";
import { validateStrategy } from "@/lib/data/validate";

/** GET /api/strategies/:id */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const strategy = await getRepository().getStrategy(ctx, id);
    return strategy && { strategy };
  });
}

/**
 * PATCH /api/strategies/:id — partial update. `{ status }` alone is the pause/resume toggle the
 * strategies table uses; the same endpoint takes name, type and channels.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson(request);
  const checked = validateStrategy(body, true);
  if (!checked.ok) return failFields(checked.errors);

  return withUser(async (ctx) => {
    const strategy = await getRepository().updateStrategy(ctx, id, checked.data);
    if (!strategy) return null;
    return "error" in strategy ? strategy : { strategy };
  });
}

/** DELETE /api/strategies/:id — audiences and threads survive with their reference cleared. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const gone = await getRepository().deleteStrategy(ctx, id);
    return gone ? { deleted: id } : null;
  });
}
