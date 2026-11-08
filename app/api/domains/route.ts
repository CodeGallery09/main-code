import { getRepository } from "@/lib/data";
import { readJson, withUser } from "@/lib/http";

/**
 * POST /api/domains — body `{ host }`. Adds a domain the workspace sends email from and looks up
 * its SPF, DKIM and DMARC records in public DNS straight away. Answers the stored domain plus what
 * each lookup found, so the screen can say exactly what to add. 422 for something that is not a
 * domain name, or one already added.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  const host = body && typeof body === "object" && "host" in body && typeof body.host === "string" ? body.host : "";
  return withUser(async (ctx) => getRepository().addDomain(ctx, host));
}
