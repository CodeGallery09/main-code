import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import "../workspace.css";
import { getRepository } from "@/lib/data";
import { resolveSession, SESSION_COOKIE } from "@/lib/auth";
import { LOGIN_HREF } from "@/lib/site";
import { AppShell } from "@/components/ws/shell/AppShell";

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
  const ctx = { workspaceId: who.workspaceId, userId: who.userId };
  const repo = getRepository();
  const [user, workspace] = await Promise.all([repo.getUser(ctx), repo.getWorkspace(ctx)]);
  // A valid session whose user, membership or workspace has since been removed: treat it as
  // signed out rather than rendering a shell with no identity.
  if (!user || !workspace) redirect(LOGIN_HREF);

  return (
    <AppShell user={user} workspace={workspace}>
      {children}
    </AppShell>
  );
}
