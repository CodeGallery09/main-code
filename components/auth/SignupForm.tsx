"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { LOGIN_HREF } from "@/lib/site";
import { AuthField } from "./AuthField";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = { name?: string; email?: string; password?: string };

/** Dummy form: validates input but never creates an account, and says so rather than faking success. */
export function SignupForm() {
  const uid = useId();
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState(false);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    const next: Errors = {};
    if (!name) next.name = "Enter your name.";
    if (!email) next.email = "Enter your work email.";
    else if (!EMAIL_RE.test(email)) next.email = "Enter a valid email address.";
    if (password.length < 8) next.password = "Use at least 8 characters.";
    setErrors(next);
    setNotice(Object.keys(next).length === 0);
    if (Object.keys(next).length) {
      const first = (["name", "email", "password"] as const).find((k) => next[k]);
      e.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    }
  };

  const f = (name: keyof Errors) => ({
    id: `${uid}-${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${uid}-${name}-error` : undefined,
    className: "field",
  });

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-5">
      <AuthField label="Full name" htmlFor={`${uid}-name`} error={errors.name} errorId={`${uid}-name-error`}>
        <input {...f("name")} type="text" autoComplete="name" />
      </AuthField>
      <AuthField label="Work email" htmlFor={`${uid}-email`} error={errors.email} errorId={`${uid}-email-error`}>
        <input {...f("email")} type="email" inputMode="email" autoComplete="email" spellCheck={false} />
      </AuthField>
      <AuthField label="Password" htmlFor={`${uid}-password`} error={errors.password} errorId={`${uid}-password-error`}>
        <input {...f("password")} type="password" autoComplete="new-password" />
      </AuthField>

      {notice && (
        <div role="status" className="flex items-start gap-2.5 rounded-[10px] border border-line-strong bg-bg px-4 py-3 text-[14px] text-ink">
          <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <span>Account creation isn&rsquo;t available yet, so nothing was saved. Sign-in is limited to the demo account for now.</span>
        </div>
      )}

      <button type="submit" className="btn btn-primary w-full">
        Create account
      </button>

      <p className="text-center text-[14px] text-muted">
        Already have an account?{" "}
        <Link href={LOGIN_HREF} className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
