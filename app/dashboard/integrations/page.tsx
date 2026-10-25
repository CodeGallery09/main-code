import type { Metadata } from "next";
import { IntegrationsScreen } from "@/components/app/IntegrationsScreen";
import { linkedInConnectConfigured } from "@/lib/channels";

export const metadata: Metadata = { title: "Integrations" };

/**
 * Whether a LinkedIn sign-in can be opened depends on this deployment's provider key, which only
 * the server can see. It is read here and handed down, so the screen never offers a Connect button
 * that would answer 503.
 */
export default function IntegrationsPage() {
  return <IntegrationsScreen linkedInConfigured={linkedInConnectConfigured()} />;
}
