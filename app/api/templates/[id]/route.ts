import { getRepository } from "@/lib/data";
import { readJson, withUser } from "@/lib/http";
import { validateTemplate } from "@/lib/data/validate";

/** PATCH /api/templates/:id — name, subject or body. A template's kind never changes. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson(request);
  return withUser(async (ctx) => {
    const repo = getRepository();
    const current = (await repo.listTemplates(ctx)).find((t) => t.id === id);
    if (!current) return null;
    const checked = validateTemplate(body, { kind: current.kind });
    if (!checked.ok) {
      const [field, message] = Object.entries(checked.errors)[0];
      return { error: { field, message } };
    }
    const template = await repo.updateTemplate(ctx, id, checked.data);
    return template ? { template } : null;
  });
}

/** DELETE /api/templates/:id — steps that were filled from it keep their words. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => getRepository().deleteTemplate(ctx, id));
}
