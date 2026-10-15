"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { DASHBOARD_HREF, LOGIN_HREF } from "@/lib/site";
import { validateSignup, type SignupErrors, type SignupResponse } from "@/lib/signup";
import { AuthField } from "./AuthField";

/**
 * Creates a real account through POST /api/signup.
 *
 * It validates first with the same `validateSignup()` the server runs, so obvious mistakes never
 * cost a round trip — but the server is the authority, and the form moves on **only** when it
 * answers `{ ok: true }`. Everything else (not invited, already registered, no database, a
 * network failure) is shown as an error; nothing is ever presented as success on its own say-so.
 */
export function SignupForm() {
  const router = useRouter();
  const uid = useId();
  const inFlight = useRef(false);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [formError, setFormError] = useState("");
  const [exists, setExists] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const focusFirst = (form: HTMLFormElement, next: SignupErrors) => {
    const first = (["name", "email", "password"] as const).find((k) => next[k]);
    if (first) form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlight.current) return;
    const form = e.currentTarget;
    const data = new FormData(form);

    const checked = validateSignup({
      name: data.get("name"),
      email: data.get("email"),
      password: data.get("password"),
    });
    setFormError("");
    setExists(false);
    if (!checked.ok) {
      setErrors(checked.errors);
      focusFirst(form, checked.errors);
      return;
    }
    setErrors({});

    inFlight.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked.data),
      });
      const json = (await res.json()) as SignupResponse;

      if (json.ok) {
        router.push(DASHBOARD_HREF);
        router.refresh();
        return;
      }
      if (json.code === "invalid") {
        setErrors(json.errors);
        focusFirst(form, json.errors);
      } else {
        setExists(json.code === "exists");
        setFormError(json.message);
      }
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    }
    inFlight.current = false;
    setSubmitting(false);
  };

  const f = (name: keyof SignupErrors) => ({
    id: `${uid}-${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${uid}-${name}-error` : undefined,
    className: "field",
  });

  return (
    <form method="post" noValidate onSubmit={onSubmit} className="space-y-5">
      <AuthField label="Full name" htmlFor={`${uid}-name`} error={errors.name} errorId={`${uid}-name-error`}>
        <input {...f("name")} type="text" autoComplete="name" />
      </AuthField>
      <AuthField label="Work email" htmlFor={`${uid}-email`} error={errors.email} errorId={`${uid}-email-error`}>
        <input {...f("email")} type="email" inputMode="email" autoComplete="email" spellCheck={false} />
      </AuthField>
      <AuthField label="Password" htmlFor={`${uid}-password`} error={errors.password} errorId={`${uid}-password-error`}>
        <input {...f("password")} type="password" autoComplete="new-password" />
      </AuthField>

      {formError && (
        <div role="alert" className="flex items-start gap-2.5 rounded-[10px] border border-alert/30 bg-alert-soft/60 px-4 py-3 text-[14px] text-ink">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-alert" aria-hidden="true" />
          <span>
            {formError}
            {exists && (
              <>
                {" "}
                <Link href={LOGIN_HREF} className="font-medium text-accent hover:underline">
                  Go to sign in
                </Link>
              </>
            )}
          </span>
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
            Creating account…
          </>
        ) : (
          <>
            Create account
            <ArrowRight size={16} className="btn-arrow" aria-hidden="true" />
          </>
        )}
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
