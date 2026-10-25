import { permanentRedirect } from "next/navigation";
import { SETUP_HREF } from "@/lib/nav";

/**
 * The provider catalogue is Setup's Connections tab. The hosted LinkedIn sign-in returns to
 * `?connected=`/`?failed=` on Setup now (see lib/channels/connect.ts), but an older in-flight
 * sign-in may still come back here, so the query string is carried across.
 */
export default async function IntegrationsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["connected", "failed"]) {
    const value = params[key];
    if (typeof value === "string") query.set(key, value);
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  permanentRedirect(`${SETUP_HREF}${suffix}`);
}
