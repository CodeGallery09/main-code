import type { Metadata } from "next";
import { SetupOverviewView } from "@/components/ws/setup/setup-overview-view";
import { linkedInConnectConfigured } from "@/lib/channels";

export const metadata: Metadata = { title: "Setup" };

export default function SetupOverviewPage() {
  return <SetupOverviewView linkedInConfigured={linkedInConnectConfigured()} />;
}
