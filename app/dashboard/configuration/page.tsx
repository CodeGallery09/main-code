import type { Metadata } from "next";
import { ConfigurationScreen } from "@/components/app/ConfigurationScreen";

export const metadata: Metadata = { title: "Configuration" };

export default function ConfigurationPage() {
  return <ConfigurationScreen />;
}
