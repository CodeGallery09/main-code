import { getRepository } from "@/lib/data";
import { readJson, withUser } from "@/lib/http";
import { validateTemplate, type TemplateInput } from "@/lib/data/validate";

/** GET /api/templates — the workspace's message templates, newest edit first. */
export async function GET() {
  return withUser(async (ctx) => ({ templates: await getRepository().listTemplates(ctx) }));
}

/** POST /api/templates — `{ kind, name, subject?, body }`. 422 names the field that is wrong. */
export async function POST(request: Request) {
  const body = await readJson(request);
  return withUser(async (ctx) => {
    const checked = validateTemplate(body);
    if (!checked.ok) {
      const [field, message] = Object.entries(checked.errors)[0];
      return { error: { field, message } };
    }
    return { template: await getRepository().createTemplate(ctx, checked.data as TemplateInput) };
  });
}
