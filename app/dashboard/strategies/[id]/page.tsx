import { permanentRedirect } from "next/navigation";

type Params = { params: Promise<{ id: string }> };

/**
 * The builder lives under /dashboard/workflows. Strategy ids match workflow ids,
 * so older links keep working by redirecting rather than rendering a second copy.
 */
export default async function StrategyBuilderRedirect({ params }: Params) {
  const { id } = await params;
  permanentRedirect(`/dashboard/workflows/${id}`);
}
