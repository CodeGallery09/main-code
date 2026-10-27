import type { Metadata } from "next";
import { NewStrategyView } from "@/components/ws/strategies/new-strategy-view";

export const metadata: Metadata = { title: "New strategy" };

export default function NewStrategyPage() {
  return <NewStrategyView />;
}
