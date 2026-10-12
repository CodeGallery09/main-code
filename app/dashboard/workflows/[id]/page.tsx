import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkflowBuilder } from "@/components/app/builder/WorkflowBuilder";
import { blankWorkflow, getWorkflow, TEMPLATES } from "@/lib/app/workflow";

type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ template?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (id === "new") return { title: "New workflow" };
  const workflow = getWorkflow(Number(id));
  return { title: workflow ? workflow.name : "Workflow" };
}

/** The builder. `/new?template=` starts from one of the library templates. */
export default async function WorkflowBuilderPage({ params, searchParams }: Params) {
  const { id } = await params;

  if (id === "new") {
    const { template } = await searchParams;
    const key = TEMPLATES.some((t) => t.k === template) ? template : "blank";
    return <WorkflowBuilder workflow={blankWorkflow(key)} />;
  }

  const workflow = getWorkflow(Number(id));
  if (!workflow) notFound();

  return <WorkflowBuilder workflow={workflow} />;
}
