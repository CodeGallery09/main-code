import type { Metadata } from "next";
import { CampaignsScreen } from "@/components/app/CampaignsScreen";

export const metadata: Metadata = { title: "Campaigns" };

export default function CampaignsPage() {
  return <CampaignsScreen />;
}
