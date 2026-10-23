"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Create/edit dialog for a lead.
 *
 * Markup follows the workspace's existing modal pattern — a `.scrim` sibling plus a
 * self-centering `.modal` with `.m-h`/`.m-b`/`.m-f` sections — so it inherits the glass
 * treatment `app.css` already defines for those classes. No new glass surface is introduced,
 * which is why nothing had to be added to the selector lists in `glass.ts` (see CLAUDE.md).
 *
 * It asks only for who the person is and how to reach them. Company, title and the rest come
 * from an imported file or, later, from enrichment; stage, source and owner are set by the
 * server (a new lead is `new`, from `form`, owned by whoever added it). An edit sends only these
 * fields, so it never overwrites what an import or the workflow stored on the lead.
 */

/** Flat, primitives-only shape the form edits. `id` null means "create". */
export type LeadDraft = {
  id: string | null;
  name: string;
  email: string;
  phone: string;
  linkedin: string;
  consent: boolean;
};

type Props = {
  draft: LeadDraft;
  onCancel: () => void;
  /** Resolves to null on success, or the field errors the server rejected. */
  onSave: (draft: LeadDraft) => Promise<Record<string, string> | null>;
};

export function LeadEditor({ draft, onCancel, onSave }: Props) {
  const [form, setForm] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => firstField.current?.focus(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const set = <K extends keyof LeadDraft>(key: K, value: LeadDraft[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    // The server re-runs the same validation, and is the authority on what is valid.
    const result = await onSave(form);
    if (result) setErrors(result);
    setSaving(false);
  }

  const problem = (key: string) =>
    errors[key] ? (
      <small className="warn" role="alert">
        {errors[key]}
      </small>
    ) : null;

  const title = form.id ? "Edit lead" : "New lead";

  return (
    <>
      <div className="scrim" onClick={onCancel} />
      <form method="post" className="modal wide" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
        <header className="m-h">
          <div>
            <h2>{title}</h2>
            <p>Saved straight to the workspace database.</p>
          </div>
          <button type="button" className="ib sm" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="m-b">
          {errors._ && (
            <p className="warn" role="alert">
              {errors._}
            </p>
          )}

          <label>
            Name
            <input
              ref={firstField}
              className="inp"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
            {problem("name")}
          </label>

          <label>
            Email
            <input
              className="inp"
              type="email"
              value={form.email}
              placeholder="name@company.com"
              onChange={(e) => set("email", e.target.value)}
            />
            {problem("email")}
          </label>

          <label>
            Phone number
            <input
              className="inp"
              type="tel"
              value={form.phone}
              placeholder="+44 7700 900123"
              onChange={(e) => set("phone", e.target.value)}
            />
            {problem("phone")}
          </label>

          <label>
            LinkedIn URL
            <input
              className="inp"
              inputMode="url"
              autoComplete="url"
              value={form.linkedin}
              placeholder="linkedin.com/in/name"
              onChange={(e) => set("linkedin", e.target.value)}
            />
            {problem("linkedin")}
          </label>

          {/* Consent gates outreach, so it is never pre-ticked and never inferred from anything else. */}
          <label className="opt">
            <input type="checkbox" checked={form.consent} onChange={(e) => set("consent", e.target.checked)} />
            <span>
              <b>Consent to be contacted</b>
              <small className="muted">Required before this lead can be contacted.</small>
            </span>
          </label>
        </div>

        <div className="m-f">
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn pri" disabled={saving}>
            {saving ? "Saving…" : form.id ? "Save changes" : "Create lead"}
          </button>
        </div>
      </form>
    </>
  );
}
