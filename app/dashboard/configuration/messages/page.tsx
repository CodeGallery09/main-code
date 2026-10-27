import type { Metadata } from "next";
import { SetupMessagesView } from "@/components/ws/setup/setup-messages-view";

export const metadata: Metadata = { title: "Messages" };

export default function SetupMessagesPage() {
  return <SetupMessagesView />;
}
