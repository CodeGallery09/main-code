import type { Metadata } from "next";
import { getRepository } from "@/lib/data";
import { AnalyticsScreen } from "@/components/app/AnalyticsScreen";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const analytics = await getRepository().getAnalytics("30d", null);
  return <AnalyticsScreen initial={analytics} />;
}
