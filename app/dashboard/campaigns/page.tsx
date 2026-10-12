import type { Metadata } from "next";
import { getRepository } from "@/lib/data";
import { CampaignsScreen } from "@/components/app/CampaignsScreen";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const { items, totals } = await getRepository().listCampaigns({});
  return <CampaignsScreen initialItems={items} initialTotals={totals} />;
}
