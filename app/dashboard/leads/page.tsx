import type { Metadata } from "next";
import { getRepository } from "@/lib/data";
import { LeadsScreen } from "@/components/app/LeadsScreen";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage() {
  const repo = getRepository();
  const [page, workspace, campaigns] = await Promise.all([
    repo.listLeads({ sort: "score", dir: "desc", pageSize: 25 }),
    repo.getWorkspace(),
    repo.listCampaigns({}),
  ]);
  return (
    <LeadsScreen
      initial={page}
      owners={workspace.members.map((m) => ({ id: m.id, name: m.name }))}
      campaigns={campaigns.items.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
