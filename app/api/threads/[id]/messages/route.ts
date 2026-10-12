import { getRepository } from "@/lib/data";
import { fail, json, sessionEmail } from "@/lib/http";
import type { Channel } from "@/lib/data/types";

const CHANNELS: Channel[] = ["linkedin", "email", "whatsapp", "call", "sms"];
const MAX_BODY = 4000;

/** POST /api/threads/:id/messages — body { channel, body } sends a reply. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await sessionEmail())) return fail("unauthenticated", "Sign in to use this endpoint.", 401);
  const { id } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail("bad_request", "Request body must be JSON.", 400);
  }
  const { channel, body } = (payload ?? {}) as { channel?: unknown; body?: unknown };
  if (typeof channel !== "string" || !CHANNELS.includes(channel as Channel)) {
    return fail("invalid", `channel must be one of ${CHANNELS.join(", ")}.`, 422);
  }
  if (typeof body !== "string" || !body.trim()) {
    return fail("invalid", "body is required.", 422);
  }
  if (body.length > MAX_BODY) {
    return fail("invalid", `body must be ${MAX_BODY} characters or fewer.`, 422);
  }
  const message = await getRepository().sendMessage({
    threadId: id,
    channel: channel as Channel,
    body: body.trim(),
  });
  if (!message) return fail("not_found", `No thread with id ${id}.`, 404);
  return json({ message }, 201);
}
