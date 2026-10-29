"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { api } from "@/lib/api";
import type { Audience, Strategy } from "@/lib/data/types";
import type { AudiencePatch } from "@/lib/data/validate";
import { EASE_OUT } from "@/components/ws/ui/motion";
import { Button } from "@/components/ws/ui/button";

/**
 * Add or edit one lead by hand.
 *
 * It asks only for what a person can actually supply — who they are, where to
 * reach them, and which strategy they belong to — plus the consent attestation.
 * Stage, source, score, tags and owner are set by the server or by an import, so
 * showing them here would be asking the operator to invent them.
 *
 * **A lead is only ever in one strategy**, so the strategy select moves them
 * rather than adding: picking a new one releases them from the old one. A lead
 * with no strategy is on their own until one is chosen, here or at launch.
 */
export function LeadForm({
  open,
  lead,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Present for an edit, absent for a new lead. */
  lead?: Audience | null;
  onClose: () => void;
  onSaved: (saved: Audience) => void;
}) {
  const still = useReducedMotion();
  const [name, setName] = useState(lead?.name ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [linkedin, setLinkedin] = useState(lead?.linkedin ?? "");
  const [company, setCompany] = useState(lead?.company ?? "");
  const [title, setTitle] = useState(lead?.title ?? "");
  const [strategyId, setStrategyId] = useState(lead?.strategyId ?? "");
  const [strategies, setStrategies] = useState<Strategy[] | null>(null);
  const [consent, setConsent] = useState(lead ? lead.consent : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The strategy list is only needed while the dialog is open, and it is small.
  useEffect(() => {
    if (!open || strategies) return;
    let alive = true;
    api
      .strategies()
      .then(({ items }) => alive && setStrategies(items.filter((row) => !row.isSample)))
      .catch(() => alive && setStrategies([]));
    return () => {
      alive = false;
    };
  }, [open, strategies]);

  async function save() {
    setBusy(true);
    setError("");
    const patch: AudiencePatch = {
      name: name.trim(),
      company: company.trim(),
      title: title.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      linkedin: linkedin.trim() || null,
      strategyId: strategyId || null,
      consent,
    };
    try {
      const { audience } = lead ? await api.updateAudience(lead.id, patch) : await api.createAudience(patch);
      // A LinkedIn URL is worth a profile read, but it goes out to LinkedIn and takes seconds, so
      // the dialog never waits on it: the drawer shows the briefing once it lands.
      if (patch.linkedin && patch.linkedin !== lead?.linkedin) {
        void api.readLinkedInProfile(audience.id).catch(() => undefined);
      }
      onSaved(audience);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  const ready = name.trim().length > 0 && (consent || Boolean(lead));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,19,0.28)] p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: still ? 0 : 0.14 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={lead ? `Edit ${lead.name}` : "Add a lead"}
            className="w-full max-w-[440px] rounded-xl border border-border bg-card"
            initial={{ opacity: 0, y: still ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: still ? 0 : 6 }}
            transition={still ? { duration: 0 } : EASE_OUT}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-4 py-[10px]">
              <h2 className="font-mono text-[13px] font-bold tracking-[-0.01em]">
                {lead ? "Edit lead" : "Add a lead"}
              </h2>
            </div>

            <form
              method="post"
              className="flex flex-col gap-[13px] px-4 py-[12px]"
              onSubmit={(e) => {
                e.preventDefault();
                if (ready && !busy) void save();
              }}
            >
              <TextField id="lead-name" label="Name" value={name} onChange={setName} required />
              <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-[13px]">
                <TextField id="lead-company" label="Company" value={company} onChange={setCompany} />
                <TextField id="lead-title" label="Job title" value={title} onChange={setTitle} />
              </div>
              <TextField id="lead-email" label="Email" value={email} onChange={setEmail} type="email" />
              <TextField id="lead-phone" label="Phone" value={phone} onChange={setPhone} inputMode="tel" />
              {/* Not type="url": the server normalises "linkedin.com/in/x", which the browser's
                  own constraint check would refuse before onSubmit ever runs. */}
              <TextField
                id="lead-linkedin"
                label="LinkedIn URL"
                value={linkedin}
                onChange={setLinkedin}
                inputMode="url"
              />

              <span className="flex flex-col gap-[5px]">
                <label htmlFor="lead-strategy" className="label-mono">
                  Strategy
                </label>
                <select
                  id="lead-strategy"
                  value={strategyId}
                  disabled={strategies === null}
                  onChange={(e) => setStrategyId(e.target.value)}
                  className="h-[34px] rounded-lg border border-input bg-card px-[9px] text-[12px]"
                >
                  <option value="">No strategy</option>
                  {(strategies ?? []).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                {lead?.strategyId && strategyId !== lead.strategyId ? (
                  <span className="text-[11px] text-muted-foreground">
                    {strategyId ? "Moves them out of their current strategy." : "Releases them from their strategy."}
                  </span>
                ) : null}
              </span>

              {!lead && (
                <label className="flex items-start gap-[9px] rounded-[10px] bg-accent px-[13px] py-[8px] text-[11.5px] leading-[1.55] text-body">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-[2px] size-[14px] shrink-0"
                  />
                  <span>I can contact this person about my product, and they can opt out at any time.</span>
                </label>
              )}

              {error && (
                <p role="alert" className="text-[11.5px] text-destructive">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-[8px] pt-[2px]">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                  {busy ? "Saving…" : lead ? "Save changes" : "Add the lead"}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "email";
  inputMode?: "tel" | "url";
  required?: boolean;
}) {
  return (
    <span className="flex flex-col gap-[5px]">
      <label htmlFor={id} className="label-mono">
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="h-[34px] rounded-lg border border-input bg-card px-[11px] text-[12px]"
      />
    </span>
  );
}
