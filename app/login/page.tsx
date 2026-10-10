import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthPage } from "@/components/auth/AuthPage";
import { LoginForm } from "@/components/auth/LoginForm";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { DASHBOARD_HREF } from "@/lib/site";

export const metadata: Metadata = { title: "Sign in — Flightpath" };

export default async function LoginPage() {
  if (readSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect(DASHBOARD_HREF);
  return (
    <AuthPage title="Welcome back." subtitle="Sign in to your Flightpath workspace.">
      <LoginForm />
    </AuthPage>
  );
}
