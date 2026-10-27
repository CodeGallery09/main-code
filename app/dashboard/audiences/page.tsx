import type { Metadata } from "next";
import { AudiencesView } from "@/components/ws/audiences/audiences-view";

export const metadata: Metadata = { title: "Audiences" };

export default function AudiencesPage() {
  return <AudiencesView />;
}
