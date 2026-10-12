import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getRepository } from "@/lib/data";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { HomeScreen } from "@/components/app/HomeScreen";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardHome() {
  // Rendered on the server so the first paint already has data; the client takes over for
  // filtering and actions, which go back through /api.
  const email = readSession((await cookies()).get(SESSION_COOKIE)?.value) ?? "";
  const overview = await getRepository().getOverview(email, "30d");
  return <HomeScreen initial={overview} />;
}
