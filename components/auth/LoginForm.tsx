"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { DASHBOARD_HREF, SIGNUP_HREF } from "@/lib/site";
import { AuthField } from "./AuthField";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const router = useRouter();
  const uid = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    const next: typeof errors = {};
    if (!email) next.email = "Enter your email.";
    else if (!EMAIL_RE.test(email)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    setFormError("");
    if (next.email || next.password) {
      (next.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (json.ok) {
        router.push(DASHBOARD_HREF);
        router.refresh();
        return;
      }
      setFormError(json.message ?? "Couldn't sign you in. Try again.");
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    }
    inFlight.current = false;
    setSubmitting(false);
  };

  return (
    <form method="post" noValidate onSubmit={onSubmit} className="space-y-5">
      <AuthField label="Email" htmlFor={`${uid}-email`} error={errors.email} errorId={`${uid}-email-error`}>
        <input
          ref={emailRef}
          id={`${uid}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          spellCheck={false}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? `${uid}-email-error` : undefined}
          className="field"
        />
      </AuthField>
      <AuthField label="Password" htmlFor={`${uid}-password`} error={errors.password} errorId={`${uid}-password-error`}>
        <input
          ref={passwordRef}
          id={`${uid}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? `${uid}-password-error` : undefined}
          className="field"
        />
      </AuthField>

      {formError && (
        <div role="alert" className="flex items-start gap-2.5 rounded-[10px] border border-alert/30 bg-alert-soft/60 px-4 py-3 text-[14px] text-ink">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-alert" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <button
        type="submit"
        aria-disabled={submitting || undefined}
        aria-busy={submitting || undefined}
        className="btn btn-primary w-full aria-disabled:cursor-wait aria-disabled:opacity-80 aria-disabled:hover:bg-ink"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRight size={16} className="btn-arrow" aria-hidden="true" />
          </>
        )}
      </button>

      <p className="text-center text-[14px] text-muted">
        New to Flightpath?{" "}
        <Link href={SIGNUP_HREF} className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
