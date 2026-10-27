import type { Metadata } from "next";
import { SetupIntegrationsView } from "@/components/ws/setup/setup-integrations-view";
import { linkedInConnectConfigured } from "@/lib/channels";

export const metadata: Metadata = { title: "Integrations" };

export default function SetupIntegrationsPage() {
  return <SetupIntegrationsView linkedInConfigured={linkedInConnectConfigured()} />;
}
