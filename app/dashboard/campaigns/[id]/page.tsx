import { permanentRedirect } from "next/navigation";

type Params = { params: Promise<{ id: string }> };

/**
 * The builder lives under /dashboard/workflows. Campaign ids match workflow ids,
 * so older links keep working by redirecting rather than rendering a second copy.
 */
export default async function CampaignBuilderRedirect({ params }: Params) {
  const { id } = await params;
  permanentRedirect(`/dashboard/workflows/${id}`);
}
