import type { Metadata } from "next";
import { SetupConfigView } from "@/components/ws/setup/setup-config-view";
import { linkedInConnectConfigured } from "@/lib/channels";

export const metadata: Metadata = { title: "Config" };

export default function SetupConfigPage() {
  return <SetupConfigView linkedInConfigured={linkedInConnectConfigured()} />;
}
