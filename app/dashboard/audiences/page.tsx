import type { Metadata } from "next";
import { AudiencesScreen } from "@/components/app/AudiencesScreen";

export const metadata: Metadata = { title: "Audiences" };

export default function AudiencesPage() {
  return <AudiencesScreen />;
}
