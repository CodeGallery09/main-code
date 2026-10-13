import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "../app.css";
import { getRepository } from "@/lib/data";
import { resolveSession, SESSION_COOKIE } from "@/lib/auth";
import { LOGIN_HREF } from "@/lib/site";
import { AppShell } from "@/components/app/AppShell";

export const metadata: Metadata = {
  title: { default: "Workspace — Flightpath", template: "%s — Flightpath" },
  robots: { index: false },
};

// The session is read per request, so signing out takes effect on the very next navigation.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const who = await resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!who) redirect(LOGIN_HREF);

  // Read straight from the repository on the server; the REST API is there for client components.
  const user = await getRepository().getUser({ workspaceId: who.workspaceId, userId: who.userId });
  // A valid session whose user or membership has since been removed: treat it as signed out
  // rather than rendering a shell with no identity.
  if (!user) redirect(LOGIN_HREF);

  return <AppShell user={user}>{children}</AppShell>;
}
