import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "../app.css";
import { getRepository } from "@/lib/data";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { LOGIN_HREF } from "@/lib/site";
import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = {
  title: { default: "Workspace — Flightpath", template: "%s — Flightpath" },
  robots: { index: false },
};

// The session is read per request, so signing out takes effect on the very next navigation.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const email = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!email) redirect(LOGIN_HREF);

  // Read straight from the repository on the server; the REST API is there for client components.
  const user = await getRepository().getUser(email);

  return <AppShell user={user}>{children}</AppShell>;
}
