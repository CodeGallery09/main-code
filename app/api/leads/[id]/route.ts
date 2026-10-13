import { getRepository } from "@/lib/data";
import { failFields, readJson, withUser } from "@/lib/http";
import { validateLead } from "@/lib/data/validate";

/** GET /api/leads/:id */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const lead = await getRepository().getLead(ctx, id);
    return lead && { lead };
  });
}

/** PATCH /api/leads/:id — partial update; only the fields sent are applied. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson(request);
  const checked = validateLead(body, true);
  if (!checked.ok) return failFields(checked.errors);

  return withUser(async (ctx) => {
    const lead = await getRepository().updateLead(ctx, id, checked.data);
    if (!lead) return null;
    return "error" in lead ? lead : { lead };
  });
}

/** DELETE /api/leads/:id */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const gone = await getRepository().deleteLead(ctx, id);
    return gone ? { deleted: id } : null;
  });
}
