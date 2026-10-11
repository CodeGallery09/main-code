import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/AuthPage";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Create account — Flightpath" };

export default function SignupPage() {
  return (
    <AuthPage title="Create your account." subtitle="Account creation is coming soon. This form is a preview only.">
      <SignupForm />
    </AuthPage>
  );
}
