"use client";

/**
 * Start a campaign from a template.
 *
 * A campaign *is* a workflow, so there is one creation path: pick a shape, and the campaign, its
 * workflow and the builder all follow from that one choice. Nothing else is asked for up front —
 * the name can be edited in the builder's header, the channels follow from the steps, and the
 * status follows from what the user does.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dot } from "../ui";
import { api, fieldErrorsOf } from "@/lib/api";
import { toChannel } from "@/lib/app/adapt";
import { graphFromTemplate, TEMPLATES } from "@/lib/app/workflow";

export function TemplatePicker({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function start(key: string, label: string, templateChannels: readonly string[]) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const name = key === "blank" ? "Untitled campaign" : label;
      // A multichannel campaign needs two or more channels. A blank workflow has none yet, so it
      // starts with the two the product can connect; the steps decide what it really uses.
      const channels =
        templateChannels.length >= 2
          ? templateChannels.map((k) => toChannel(k as Parameters<typeof toChannel>[0]))
          : (["linkedin", "email"] as const);
      const { campaign } = await api.createCampaign({
        name,
        type: "multichannel",
        status: "draft",
        channels: [...channels],
      });
      await api.saveWorkflow(campaign.id, { name, graph: graphFromTemplate(key) });
      router.push(`/dashboard/workflows/${campaign.id}`);
    } catch (caught) {
      const fields = fieldErrorsOf(caught);
      setError(
        fields
          ? Object.values(fields)[0]
          : caught instanceof Error
            ? caught.message
            : "Could not start that campaign.",
      );
      setBusy(null);
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tpl-title">
        <header className="m-h">
          <b id="tpl-title">Start a campaign</b>
          <button type="button" className="ib sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="m-b">
          <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            Pick a shape to start from, then edit every step in the builder. It opens as a draft.
          </p>
          {error && (
            <p className="empty" role="alert">
              {error}
            </p>
          )}
          <div className="tplgrid">
            {TEMPLATES.map((t) => (
              <button
                key={t.k}
                type="button"
                className="tpl"
                disabled={busy !== null}
                aria-busy={busy === t.k}
                onClick={() => void start(t.k, t.name, t.ch)}
              >
                <b>{t.name}</b>
                <span className="dots">
                  {t.ch.map((k) => (
                    <Dot key={k} k={k} />
                  ))}
                </span>
                <small>
                  {busy === t.k ? "Creating…" : t.k === "blank" ? "Start from scratch" : `${t.steps} steps`}
                </small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
