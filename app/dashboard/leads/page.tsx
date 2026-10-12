import type { Metadata } from "next";
import { LeadsScreen } from "@/components/app/LeadsScreen";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  return <LeadsScreen />;
}
