import { getRepository } from "@/lib/data";
import { fail, failFields, json, principal, readJson } from "@/lib/http";
import { validateMessageBody, CHANNELS } from "@/lib/data/validate";
import type { Channel } from "@/lib/data/types";

/**
 * POST /api/threads/:id/messages — body { channel, body } sends a reply.
 *
 * Not written through `withUser` because a successful send returns **201**, not 200, and the
 * wrapper always returns 200 on success.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await principal();
  if (!who) return fail("unauthenticated", "Sign in to use this endpoint.", 401);

  const { id } = await params;
  const payload = await readJson(request);
  const { channel } = (payload ?? {}) as { channel?: unknown };
  if (typeof channel !== "string" || !(CHANNELS as readonly string[]).includes(channel)) {
    return failFields({ channel: `channel must be one of ${CHANNELS.join(", ")}.` });
  }
  const checked = validateMessageBody(payload);
  if (!checked.ok) return failFields(checked.errors);

  try {
    const message = await getRepository().sendMessage(
      { workspaceId: who.workspaceId, userId: who.userId },
      { threadId: id, channel: channel as Channel, body: checked.data.body },
    );
    if (!message) return fail("not_found", "That thread does not exist.", 404);
    return json({ message }, 201);
  } catch (error) {
    console.error("[api]", error);
    return fail("server_error", "Something went wrong handling that request.", 500);
  }
}
