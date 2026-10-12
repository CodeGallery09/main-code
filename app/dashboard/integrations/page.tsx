import type { Metadata } from "next";
import { IntegrationsScreen } from "@/components/app/IntegrationsScreen";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return <IntegrationsScreen />;
}
