import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getRepository } from "@/lib/data";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { SettingsScreen } from "@/components/app/SettingsScreen";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const email = readSession((await cookies()).get(SESSION_COOKIE)?.value) ?? "";
  const repo = getRepository();
  const [user, workspace] = await Promise.all([repo.getUser(email), repo.getWorkspace()]);
  return <SettingsScreen user={user} workspace={workspace} />;
}
