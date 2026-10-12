/**
 * POST /api/leads/uploads/:id/validate — body `{ mapping }`.
 *
 * Runs the content rules over every row of the parked file and returns the
 * reachable counts per channel plus the row-by-row error log. Validation never
 * looks at column names: the mapping says which column feeds which attribute,
 * and each entry is judged on what it contains.
 */

import { getRepository } from "@/lib/data";
import { fail, json, sessionEmail } from "@/lib/http";
import { checkPhone } from "@/lib/leads/phone";
import { MAX_ERRORS, readMapping } from "@/lib/leads/upload";
import { validateUpload } from "@/lib/leads/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sessionEmail())) return fail("unauthenticated", "Sign in to upload leads.", 401);

  const { id } = await params;
  const upload = await getRepository().getUpload(id);
  if (!upload) return fail("not_found", "That upload is no longer available. Upload the file again.", 404);

  const body = (await request.json().catch(() => null)) as { mapping?: unknown } | null;
  const mapping = readMapping(body?.mapping);
  if (!Object.keys(mapping).length) {
    return fail("no_mapping", "Map at least one column to an attribute.", 422);
  }

  const summary = validateUpload(upload.table.headers, upload.table.rows, mapping, checkPhone);
  return json({
    totalRows: summary.totalRows,
    reachableRows: summary.reachableRows,
    channels: summary.channels.map(({ attribute, column, reachable, invalid, blank }) => ({
      attribute,
      column,
      reachable,
      invalid,
      blank,
    })),
    errors: summary.errors.slice(0, MAX_ERRORS),
    errorCount: summary.errors.length,
  });
}
