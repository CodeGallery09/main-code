/**
 * POST /api/audiences/uploads — multipart form with one `file`.
 *
 * Parsing happens here, on the server: the browser only ever sees the headers,
 * the first five rows and a suggested mapping. The parsed file is parked behind
 * the repository under an upload id so the mapping and summary steps don't have
 * to send it again.
 */

import { getRepository } from "@/lib/data";
import { fail, json } from "@/lib/http";
import { requestCtx } from "@/lib/audiences/ctx";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/audiences/limits";
import { parseAudienceFile } from "@/lib/audiences/parseFile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const ctx = await requestCtx();
  if (!ctx) return fail("unauthenticated", "Sign in to upload audiences.", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("invalid_body", "Send the file as multipart form data.", 422);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail("invalid_body", "No file was attached.", 422);
  if (file.size > MAX_UPLOAD_BYTES) return fail("too_large", `That file is over the ${MAX_UPLOAD_MB} MB limit.`, 413);

  const parsed = await parseAudienceFile(file);
  if ("error" in parsed) return fail(parsed.error.code, parsed.error.message, 422);

  const preview = await getRepository().createUpload(ctx, {
    fileName: file.name,
    fileSize: file.size,
    table: parsed.table,
  });
  return json(preview, 201);
}
