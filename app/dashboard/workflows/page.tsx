import type { Metadata } from "next";
import { WorkflowsScreen } from "@/components/app/WorkflowsScreen";
import { workflowSummaries } from "@/lib/app/workflowLibrary";

export const metadata: Metadata = { title: "Workflows" };

export default function WorkflowsPage() {
  return <WorkflowsScreen workflows={workflowSummaries()} />;
}
