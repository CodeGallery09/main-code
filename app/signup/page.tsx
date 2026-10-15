import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/AuthPage";
import { SignupForm } from "@/components/auth/SignupForm";
import { resolveSession, SESSION_COOKIE } from "@/lib/auth";
import { DASHBOARD_HREF } from "@/lib/site";

export const metadata: Metadata = { title: "Create account — Flightpath" };

// The session is read per request, so a signed-in visitor is sent on rather than shown a form.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await resolveSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect(DASHBOARD_HREF);
  return (
    <AuthPage title="Create your account." subtitle="Sign-up is invite-only for now. Use the email address you were invited with.">
      <SignupForm />
    </AuthPage>
  );
}
