import type { Metadata } from "next";
import { StrategiesScreen } from "@/components/app/StrategiesScreen";

export const metadata: Metadata = { title: "Strategies" };

export default function StrategiesPage() {
  return <StrategiesScreen />;
}
