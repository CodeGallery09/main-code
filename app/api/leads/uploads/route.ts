/**
 * POST /api/leads/uploads — multipart form with one `file`.
 *
 * Parsing happens here, on the server: the browser only ever sees the headers,
 * the first five rows and a suggested mapping. The parsed file is parked behind
 * the repository under an upload id so the mapping and summary steps don't have
 * to send it again.
 */

import { getRepository } from "@/lib/data";
import { fail, json, sessionEmail } from "@/lib/http";
import { MAX_UPLOAD_BYTES } from "@/lib/leads/limits";
import { parseLeadFile } from "@/lib/leads/parseFile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!(await sessionEmail())) return fail("unauthenticated", "Sign in to upload leads.", 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("invalid_body", "Send the file as multipart form data.", 422);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail("invalid_body", "No file was attached.", 422);
  if (file.size > MAX_UPLOAD_BYTES) return fail("too_large", "That file is over the 64 MB limit.", 413);

  const parsed = await parseLeadFile(file);
  if ("error" in parsed) return fail(parsed.error.code, parsed.error.message, 422);

  const preview = await getRepository().createUpload({
    fileName: file.name,
    fileSize: file.size,
    table: parsed.table,
  });
  return json(preview, 201);
}
