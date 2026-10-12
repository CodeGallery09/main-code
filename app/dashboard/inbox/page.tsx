import type { Metadata } from "next";
import { getRepository } from "@/lib/data";
import { InboxScreen } from "@/components/app/InboxScreen";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const threads = await getRepository().listThreads({ filter: "to-reply" });
  return <InboxScreen initial={threads} />;
}
