"use client";

/**
 * Rename a campaign.
 *
 * This used to be a five-field create/edit dialog: a name, a "standalone or multichannel" type, a
 * status list that included Completed, five channel checkboxes with a note saying three of them do
 * not send, and a start date hinting it would "start now" when nothing starts. None of it was a
 * question the user could answer before seeing the campaign. Creating now happens by picking a
 * template (`campaigns/TemplatePicker.tsx`), the channels follow from the steps, and the status
 * follows from what the user does — so the only thing left to edit here is the name.
 */

import { useEffect, useRef, useState } from "react";
import { api, fieldErrorsOf } from "@/lib/api";

export function RenameCampaign({
  id,
  name,
  onCancel,
  onSaved,
}: {
  id: string;
  name: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => field.current?.select(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateCampaign(id, { name: value });
      onSaved();
    } catch (caught) {
      const fields = fieldErrorsOf(caught);
      setError(
        fields
          ? (fields.name ?? Object.values(fields)[0])
          : caught instanceof Error
            ? caught.message
            : "Could not save that name.",
      );
      setSaving(false);
    }
  }

  return (
    <>
      <div className="scrim" onClick={onCancel} />
      <form className="modal" role="dialog" aria-modal="true" aria-label="Rename campaign" onSubmit={submit}>
        <header className="m-h">
          <h2>Rename campaign</h2>
          <button type="button" className="ib sm" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="m-b">
          <label>
            Name
            <input
              ref={field}
              className="inp"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
            {error && (
              <small className="warn" role="alert">
                {error}
              </small>
            )}
          </label>
        </div>

        <div className="m-f">
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn pri" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </>
  );
}
