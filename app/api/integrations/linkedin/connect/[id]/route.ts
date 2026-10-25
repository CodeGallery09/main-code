import { getRepository } from "@/lib/data";
import { withUser } from "@/lib/http";

/**
 * GET /api/integrations/linkedin/connect/:id — how one connect attempt of this workspace's is
 * going. The screen polls this while the member is signing in, because the provider's callback
 * lands on the server, not in the browser that opened the wizard.
 *
 * 404 for an id that is not this workspace's, so an id cannot be used to probe other workspaces.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (ctx) => {
    const session = await getRepository().getConnectSession(ctx, id);
    return session ? { session } : null;
  });
}
