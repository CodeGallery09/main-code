import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getRepository } from "@/lib/data";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { HomeScreen } from "@/components/app/HomeScreen";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardHome() {
  const email = readSession((await cookies()).get(SESSION_COOKIE)?.value) ?? "";
  const user = await getRepository().getUser(email);
  return <HomeScreen user={user} />;
}
