import { getRepository } from "@/lib/data";
import { readJson, withUser } from "@/lib/http";
import {
  validateCompliancePatch,
  validateSendingRulesPatch,
  validateVariableFallbacks,
  type ValidationErrors,
} from "@/lib/data/validate";
import type { SettingsPatch } from "@/lib/data/repository";

/**
 * GET/PATCH /api/settings — the three cross-channel Configuration tabs (Variables, Sending
 * rules, Compliance). A PATCH only ever carries the sections that changed; any section left out
 * of the body is left untouched in the stored row.
 */
export async function GET() {
  return withUser(async (ctx) => ({ settings: await getRepository().getSettings(ctx) }));
}

const fieldError = (errors: ValidationErrors) => ({
  error: { field: Object.keys(errors)[0], message: Object.values(errors)[0] },
});

export async function PATCH(request: Request) {
  const body = await readJson(request);

  return withUser(async (ctx) => {
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return { error: { field: "_", message: "Expected an object." } };
    }
    const input = body as Record<string, unknown>;
    const patch: SettingsPatch = {};

    if (input.variableFallbacks !== undefined) {
      const checked = validateVariableFallbacks(input.variableFallbacks);
      if (!checked.ok) return fieldError(checked.errors);
      patch.variableFallbacks = checked.data;
    }
    if (input.sendingRules !== undefined) {
      const checked = validateSendingRulesPatch(input.sendingRules);
      if (!checked.ok) return fieldError(checked.errors);
      patch.sendingRules = checked.data;
    }
    if (input.compliance !== undefined) {
      const checked = validateCompliancePatch(input.compliance);
      if (!checked.ok) return fieldError(checked.errors);
      patch.compliance = checked.data;
    }
    if (!Object.keys(patch).length) {
      return { error: { field: "_", message: "Send at least one section to update." } };
    }

    return { settings: await getRepository().updateSettings(ctx, patch) };
  });
}
