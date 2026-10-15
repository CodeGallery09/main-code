"use client";

import { SENDING_ENABLED, SENDING_OFF_NOTE } from "@/lib/capabilities";
import { useEffect, useRef, useState } from "react";
import { Dot } from "./ui";
import { CHANNELS, type ChannelKey } from "@/lib/app/channels";
import type { CampaignStatus } from "@/lib/data/types";

/**
 * Create/edit dialog for a campaign. Same modal pattern as `LeadEditor` — a `.scrim` sibling
 * plus a self-centering `.modal` — so it reuses the glass treatment `app.css` already defines.
 */

export type CampaignDraft = {
  id: string | null;
  name: string;
  type: "single" | "multi";
  status: CampaignStatus;
  channels: ChannelKey[];
  /** ISO date, or "" to let the server stamp now. */
  startedAt: string;
};

const STATUSES: [CampaignStatus, string][] = [
  ["draft", "Draft"],
  ["scheduled", "Scheduled"],
  ["live", "Live"],
  ["paused", "Paused"],
  ["completed", "Completed"],
];

type Props = {
  draft: CampaignDraft;
  onCancel: () => void;
  onSave: (draft: CampaignDraft) => Promise<Record<string, string> | null>;
};

export function CampaignEditor({ draft, onCancel, onSave }: Props) {
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

  function toggleChannel(key: ChannelKey) {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(key) ? f.channels.filter((k) => k !== key) : [...f.channels, key],
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
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

  const title = form.id ? "Edit campaign" : "New campaign";

  return (
    <>
      <div className="scrim" onClick={onCancel} />
      <form className="modal" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
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
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            {problem("name")}
          </label>

          <label>
            Type
            <select
              className="sel"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "single" | "multi" }))}
            >
              <option value="single">Standalone — one channel</option>
              <option value="multi">Multichannel — a workflow</option>
            </select>
            <small className="muted">
              A multichannel campaign needs two or more channels and opens in the workflow builder.
            </small>
            {problem("type")}
          </label>

          <label>
            Status
            <select
              className="sel"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as CampaignStatus }))}
            >
              {STATUSES.filter(
                ([value]) => SENDING_ENABLED || (value !== "live" && value !== "scheduled") || value === form.status,
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {!SENDING_ENABLED && <small className="muted">{SENDING_OFF_NOTE}</small>}
            {problem("status")}
          </label>

          <fieldset>
            <legend>Channels</legend>
            <div className="chips">
              {CHANNELS.map((c) => (
                <label key={c.k} className="chip">
                  <input
                    type="checkbox"
                    checked={form.channels.includes(c.k)}
                    onChange={() => toggleChannel(c.k)}
                  />
                  <Dot k={c.k} off={!form.channels.includes(c.k)} />
                  {c.name}
                </label>
              ))}
            </div>
            {/* LinkedIn and email are the only channels that actually send today; the rest are
                roadmap, per the content rules in CLAUDE.md. */}
            <small className="muted">WhatsApp, calls and SMS are planned — they do not send yet.</small>
            {problem("channels")}
          </fieldset>

          <label>
            Start date
            <input
              className="inp"
              type="date"
              value={form.startedAt}
              onChange={(e) => setForm((f) => ({ ...f, startedAt: e.target.value }))}
            />
            <small className="muted">Leave blank to start it now.</small>
            {problem("startedAt")}
          </label>
        </div>

        <div className="m-f">
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn pri" disabled={saving}>
            {saving ? "Saving…" : form.id ? "Save changes" : "Create campaign"}
          </button>
        </div>
      </form>
    </>
  );
}
