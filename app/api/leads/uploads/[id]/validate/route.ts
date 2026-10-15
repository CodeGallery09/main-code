/**
 * POST /api/leads/uploads/:id/validate — body `{ mapping }`.
 *
 * Runs the content rules over every row of the parked file and returns the
 * reachable counts per channel, the row-by-row error log, and a warning for any
 * people already in a journey in another campaign (they are left out of the counts). Validation never
 * looks at column names: the mapping says which column feeds which attribute,
 * and each entry is judged on what it contains.
 */

import { getRepository } from "@/lib/data";
import { fail, json } from "@/lib/http";
import { requestCtx } from "@/lib/leads/ctx";
import { analyseUpload } from "@/lib/leads/analyse";
import { readMapping } from "@/lib/leads/upload";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requestCtx();
  if (!ctx) return fail("unauthenticated", "Sign in to upload leads.", 401);

  const { id } = await params;
  const upload = await getRepository().getUpload(ctx, id);
  if (!upload) return fail("not_found", "That upload is no longer available. Upload the file again.", 404);

  const body = (await request.json().catch(() => null)) as { mapping?: unknown } | null;
  const mapping = readMapping(body?.mapping);
  if (!Object.keys(mapping).length) {
    return fail("no_mapping", "Map at least one column to an attribute.", 422);
  }

  const { report } = await analyseUpload(getRepository(), ctx, upload.table, mapping);
  return json(report);
}
