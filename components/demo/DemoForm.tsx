"use client";

import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, ChevronDown, Loader2 } from "lucide-react";
import {
  CHALLENGES,
  FIELD_ORDER,
  NOTES_MAX,
  ROLES,
  TEAM_SIZES,
  validateDemoRequest,
  type DemoErrors,
  type DemoField,
  type DemoRequest,
  type DemoSubmitResponse,
} from "@/lib/demoRequest";

type Values = Record<DemoField, string>;
type Status = { kind: "idle" | "submitting" | "success" } | { kind: "error"; message: string };

const EMPTY: Values = { fullName: "", workEmail: "", company: "", website: "", role: "", teamSize: "", challenge: "", notes: "" };

/** Typed client boundary: the only place the form talks to the network. */
async function submitDemoRequest(data: DemoRequest): Promise<DemoSubmitResponse> {
  try {
    const res = await fetch("/api/demo-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return (await res.json()) as DemoSubmitResponse;
  } catch {
    return { ok: false, code: "delivery_failed", message: "We couldn't reach the server. Check your connection and try again." };
  }
}

export function DemoForm({ deliveryConfigured }: { deliveryConfigured: boolean }) {
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<DemoErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const uid = useId();

  const fieldError = (name: DemoField, next: Values) => {
    const r = validateDemoRequest(next);
    return r.ok ? undefined : r.errors[name];
  };

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const name = e.target.name as DemoField;
    const next = { ...values, [name]: e.target.value };
    setValues(next);
    // Once a field shows an error, re-check it live so the message clears as soon as it's fixed.
    if (attempted || errors[name]) setErrors((prev) => ({ ...prev, [name]: fieldError(name, next) }));
    if (status.kind === "error") setStatus({ kind: "idle" });
  };

  const onBlur = (e: { target: { name: string; value: string } }) => {
    const name = e.target.name as DemoField;
    // Don't nag about empty required fields on first pass — only about malformed input.
    if (!attempted && !e.target.value.trim()) return;
    setErrors((prev) => ({ ...prev, [name]: fieldError(name, values) }));
  };

  const focusField = (name: DemoField) =>
    formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    setAttempted(true);

    const result = validateDemoRequest(values);
    if (!result.ok) {
      setErrors(result.errors);
      const first = FIELD_ORDER.find((f) => result.errors[f]);
      if (first) focusField(first);
      return;
    }

    setErrors({});
    inFlight.current = true;
    setStatus({ kind: "submitting" });
    const res = await submitDemoRequest(result.data);
    inFlight.current = false;

    if (res.ok) {
      setStatus({ kind: "success" });
      requestAnimationFrame(() => successRef.current?.focus());
    } else if (res.code === "invalid") {
      setErrors(res.errors);
      setStatus({ kind: "error", message: "Some details need another look." });
      const first = FIELD_ORDER.find((f) => res.errors[f]);
      if (first) focusField(first);
    } else {
      setStatus({ kind: "error", message: res.message });
    }
  };

  if (status.kind === "success") {
    return (
      <div className="demo-success py-6 text-center sm:py-10" role="status">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
          <Check size={22} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <h2 ref={successRef} tabIndex={-1} className="mt-5 font-serif text-[2rem] leading-tight text-ink outline-none">
          Request received.
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-ink-2/85">
          Thanks, {values.fullName.split(" ")[0]}. We&rsquo;ll reply to <span className="font-medium text-ink">{values.workEmail}</span>{" "}
          to find a time that works for your team.
        </p>
        <Link href="/" className="btn btn-secondary mt-8">
          Back to Flightpath
        </Link>
      </div>
    );
  }

  const submitting = status.kind === "submitting";
  const errorCount = Object.values(errors).filter(Boolean).length;
  const f = (name: DemoField) => ({
    id: `${uid}-${name}`,
    name,
    value: values[name],
    onChange,
    onBlur,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${uid}-${name}-error` : undefined,
  });

  return (
    <form ref={formRef} method="post" data-pip-host noValidate onSubmit={onSubmit} aria-describedby={`${uid}-legend`}>
      <p id={`${uid}-legend`} className="text-[12.5px] text-muted">
        Fields marked <span className="text-alert">*</span> are required.
      </p>

      {/* Announces the validation outcome to screen readers after a failed submit. */}
      <p className="sr-only" aria-live="polite">
        {attempted && errorCount ? `${errorCount} field${errorCount > 1 ? "s need" : " needs"} attention.` : ""}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
        <Field label="Full name" required htmlFor={`${uid}-fullName`} error={errors.fullName} errorId={`${uid}-fullName-error`}>
          <input {...f("fullName")} data-explain="Your full name, so we know who we're meeting. Example: Maya Reyes" type="text" autoComplete="name" required className="field" />
        </Field>
        <Field label="Work email" required htmlFor={`${uid}-workEmail`} error={errors.workEmail} errorId={`${uid}-workEmail-error`}>
          <input {...f("workEmail")} data-explain="Your work email. That's where we'll reply to find a time. Example: maya@yourcompany.com" type="email" inputMode="email" autoComplete="email" spellCheck={false} required className="field" />
        </Field>
        <Field label="Company name" required htmlFor={`${uid}-company`} error={errors.company} errorId={`${uid}-company-error`}>
          <input {...f("company")} data-explain="Your company name. Example: Example Co." type="text" autoComplete="organization" required className="field" />
        </Field>
        <Field label="Company website" htmlFor={`${uid}-website`} error={errors.website} errorId={`${uid}-website-error`} optional>
          <input
            {...f("website")}
            data-explain="Optional. Your website helps us prepare. Example: yourcompany.com"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="acme.com"
            className="field"
          />
        </Field>
        <Field label="Your role" required htmlFor={`${uid}-role`} error={errors.role} errorId={`${uid}-role-error`}>
          <Select {...f("role")} data-explain="Your role helps us pitch the right level of detail." options={ROLES} autoComplete="organization-title" />
        </Field>
        <Field label="Team size" required htmlFor={`${uid}-teamSize`} error={errors.teamSize} errorId={`${uid}-teamSize-error`}>
          <Select {...f("teamSize")} data-explain="How many people sell on your team, including you?" options={TEAM_SIZES} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Biggest GTM challenge" required htmlFor={`${uid}-challenge`} error={errors.challenge} errorId={`${uid}-challenge-error`}>
            <Select {...f("challenge")} data-explain="Pick the one that hurts most. We'll start the demo there." options={CHALLENGES} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Anything else?"
            htmlFor={`${uid}-notes`}
            error={errors.notes}
            errorId={`${uid}-notes-error`}
            optional
            aside={
              <span className={`font-mono text-[11px] ${values.notes.length > NOTES_MAX ? "text-alert" : "text-muted"}`}>
                {values.notes.length}/{NOTES_MAX}
              </span>
            }
          >
            <textarea
              {...f("notes")}
              data-explain="Optional. Anything that helps us prepare. Example: 8 reps, selling to HR teams, mostly cold outreach so far."
              rows={4}
              placeholder="Current tools, target audience, or what you'd like to see."
              className="field min-h-[112px] resize-y py-3"
            />
          </Field>
        </div>
      </div>

      {status.kind === "error" && (
        <div role="alert" className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-alert/30 bg-alert-soft/60 px-4 py-3 text-[14px] text-ink">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-alert" aria-hidden="true" />
          <span>{status.message}</span>
        </div>
      )}

      <button
        type="submit"
        aria-disabled={submitting || undefined}
        aria-busy={submitting || undefined}
        className="btn btn-primary mt-7 w-full aria-disabled:cursor-wait aria-disabled:opacity-80 aria-disabled:hover:bg-ink sm:w-auto"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Sending request…
          </>
        ) : (
          <>
            Request my demo
            <ArrowRight size={16} className="btn-arrow" aria-hidden="true" />
          </>
        )}
      </button>

      {!deliveryConfigured && (
        <p className="mt-4 rounded-[8px] border border-dashed border-line-strong px-3 py-2 font-mono text-[11px] leading-relaxed text-muted">
          Setup note: demo-request delivery isn&rsquo;t connected yet. Submissions are validated but not sent until a
          webhook is configured.
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  optional,
  error,
  errorId,
  aside,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  errorId: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13.5px] font-medium text-ink">
          {label}
          {required && (
            <span className="ml-0.5 text-alert" aria-hidden="true">
              *
            </span>
          )}
          {optional && <span className="ml-1.5 font-normal text-muted">(optional)</span>}
        </label>
        {aside}
      </div>
      {children}
      {error && (
        <p id={errorId} className="field-error mt-1.5 flex items-center gap-1.5 text-[12.5px] text-alert">
          <AlertCircle size={13} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

function Select({
  options,
  value,
  ...rest
}: { options: readonly string[]; value: string } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value">) {
  return (
    <div className="relative">
      <select {...rest} value={value} required className={`field appearance-none pr-10 ${value ? "" : "text-muted"}`}>
        <option value="" disabled>
          Select…
        </option>
        {options.map((o) => (
          <option key={o} value={o} className="text-ink">
            {o}
          </option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted" />
    </div>
  );
}
