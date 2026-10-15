/**
 * GET  /api/leads/segments — the saved segments, newest first.
 * POST /api/leads/segments — saves a validated upload as a segment.
 *
 * The POST re-validates the file server-side rather than trusting the counts the
 * browser showed. People already in a journey in another campaign are left out;
 * every other reachable row is merged into the workspace's leads, matching on
 * email, mobile, WhatsApp or LinkedIn in that order and filling in whatever the
 * existing lead was missing. `consent: true` is the user's attestation that the
 * people in the file may be contacted; it applies to leads this upload creates.
 */

import { getRepository } from "@/lib/data";
import { fail, json } from "@/lib/http";
import { requestCtx } from "@/lib/leads/ctx";
import { analyseUpload } from "@/lib/leads/analyse";
import { MAX_DESCRIPTION, readMapping } from "@/lib/leads/upload";

export async function GET() {
  const ctx = await requestCtx();
  if (!ctx) return fail("unauthenticated", "Sign in to use this endpoint.", 401);
  return json({ segments: await getRepository().listSegments(ctx) });
}

export async function POST(request: Request) {
  const ctx = await requestCtx();
  if (!ctx) return fail("unauthenticated", "Sign in to upload leads.", 401);

  const body = (await request.json().catch(() => null)) as
    | { uploadId?: unknown; name?: unknown; description?: unknown; mapping?: unknown; consent?: unknown }
    | null;

  const uploadId = typeof body?.uploadId === "string" ? body.uploadId : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const mapping = readMapping(body?.mapping);

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Give the segment a name.";
  if (description.length > MAX_DESCRIPTION) errors.description = `Keep the description under ${MAX_DESCRIPTION} characters.`;
  if (!Object.keys(mapping).length) errors.mapping = "Map at least one column to an attribute.";
  if (Object.keys(errors).length) return json({ error: { code: "invalid", message: "Check the form.", errors } }, 422);

  const repo = getRepository();
  const upload = await repo.getUpload(ctx, uploadId);
  if (!upload) return fail("not_found", "That upload is no longer available. Upload the file again.", 404);

  const { report, leads } = await analyseUpload(repo, ctx, upload.table, mapping);
  if (!leads.length) {
    return fail(
      "no_reachable_leads",
      report.journey.excluded
        ? "Every reachable row in that file is already in a journey in another campaign."
        : "No row in that file is reachable on a mapped channel.",
      422,
    );
  }

  const saved = await repo.createSegment(ctx, {
    uploadId,
    name,
    description,
    mapping,
    report,
    leads,
    // Only an explicit `true` counts. Anything else leaves new leads without consent.
    consent: body?.consent === true,
  });
  if (!saved) return fail("not_found", "That upload is no longer available. Upload the file again.", 404);

  return json(saved, 201);
}
