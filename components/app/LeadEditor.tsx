"use client";

import { useEffect, useRef, useState } from "react";
import type { Campaign, Lead, Workspace } from "@/lib/data/types";
import type { Stage } from "@/lib/app/leads";

/**
 * Create/edit dialog for a lead.
 *
 * Markup follows the workspace's existing modal pattern — a `.scrim` sibling plus a
 * self-centering `.modal` with `.m-h`/`.m-b`/`.m-f` sections — so it inherits the glass
 * treatment `app.css` already defines for those classes. No new glass surface is introduced,
 * which is why nothing had to be added to the selector lists in `glass.ts` (see CLAUDE.md).
 */

/** Flat, primitives-only shape the form edits. `id` null means "create". */
export type LeadDraft = {
  id: string | null;
  name: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  stage: Stage;
  score: number;
  source: Lead["source"];
  tags: string[];
  consent: boolean;
  nextStep: string;
  campaignId: string;
  ownerId: string;
};

const STAGES: Stage[] = [
  "New",
  "Reaching",
  "Engaged",
  "Hot",
  "Meeting",
  "Nurture",
  "Paused",
  "Stopped",
  "Closed",
];

const SOURCES: [Lead["source"], string][] = [
  ["form", "Form"],
  ["csv", "CSV import"],
  ["linkedin", "LinkedIn"],
  ["crm", "CRM"],
  ["event", "Event"],
];

type Props = {
  draft: LeadDraft;
  campaigns: Campaign[];
  members: Workspace["members"];
  onCancel: () => void;
  /** Resolves to null on success, or the field errors the server rejected. */
  onSave: (draft: LeadDraft) => Promise<Record<string, string> | null>;
};

export function LeadEditor({ draft, campaigns, members, onCancel, onSave }: Props) {
  const [form, setForm] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [tagText, setTagText] = useState(draft.tags.join(", "));
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
    const tags = tagText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    // The server re-runs the same validation, and is the authority on what is valid.
    const result = await onSave({ ...form, tags });
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
      <form className="modal wide" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
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
            Job title
            <input className="inp" value={form.title} onChange={(e) => set("title", e.target.value)} />
            {problem("title")}
          </label>

          <label>
            Company
            <input className="inp" value={form.company} onChange={(e) => set("company", e.target.value)} />
            {problem("company")}
          </label>

          <label>
            Email
            <input className="inp" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            {problem("email")}
          </label>

          <label>
            Phone
            <input className="inp" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            {problem("phone")}
          </label>

          <label>
            Status
            <select className="sel" value={form.stage} onChange={(e) => set("stage", e.target.value as Stage)}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {problem("stage")}
          </label>

          <label>
            Source
            <select
              className="sel"
              value={form.source}
              onChange={(e) => set("source", e.target.value as Lead["source"])}
            >
              {SOURCES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {problem("source")}
          </label>

          <label>
            Score
            <input
              className="inp"
              type="number"
              min={0}
              max={100}
              value={form.score}
              onChange={(e) => set("score", Number(e.target.value))}
            />
            {problem("score")}
          </label>

          <label>
            Campaign
            <select className="sel" value={form.campaignId} onChange={(e) => set("campaignId", e.target.value)}>
              <option value="">No campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {problem("campaignId")}
          </label>

          <label>
            Owner
            <select className="sel" value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            {problem("ownerId")}
          </label>

          <label>
            Tags
            <input
              className="inp"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder="pricing, inbound"
            />
            <small className="muted">Comma separated.</small>
            {problem("tags")}
          </label>

          <label>
            Next step
            <input className="inp" value={form.nextStep} onChange={(e) => set("nextStep", e.target.value)} />
            {problem("nextStep")}
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
