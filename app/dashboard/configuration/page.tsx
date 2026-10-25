import type { Metadata } from "next";
import { ConfigurationScreen } from "@/components/app/ConfigurationScreen";
import { linkedInConnectConfigured } from "@/lib/channels";

export const metadata: Metadata = { title: "Setup" };

export default function ConfigurationPage() {
  return <ConfigurationScreen linkedInConfigured={linkedInConnectConfigured()} />;
}
