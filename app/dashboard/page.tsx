import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRepository } from "@/lib/data";
import { resolveSession, SESSION_COOKIE } from "@/lib/auth";
import { LOGIN_HREF } from "@/lib/site";
import { HomeScreen } from "@/components/app/HomeScreen";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardHome() {
  const who = await resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!who) redirect(LOGIN_HREF);

  const user = await getRepository().getUser({ workspaceId: who.workspaceId, userId: who.userId });
  if (!user) redirect(LOGIN_HREF);

  return <HomeScreen user={user} />;
}
