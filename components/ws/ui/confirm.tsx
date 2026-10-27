"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EASE_OUT } from "./motion";
import { Button } from "./button";

/**
 * Confirmation for a step that cannot be undone.
 *
 * The body says what will happen to the rows behind the thing being deleted —
 * "what happens to leads mid-sequence" is the question the operator actually
 * has. Focus moves to the dialog and Escape closes it.
 */
export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-5"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={EASE_OUT}
        >
          <button type="button" aria-label="Cancel" onClick={onCancel} className="absolute inset-0 bg-[rgba(20,20,19,0.28)]" />
          <motion.div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal
            aria-label={title}
            className="relative w-full max-w-[440px] rounded-xl border border-border bg-card p-5 outline-none"
            initial={still ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={EASE_OUT}
          >
            <h2 className="mb-2 font-mono text-[15px] font-bold tracking-[-0.01em]">{title}</h2>
            <div className="mb-4 text-[13px] leading-[1.6] text-body">{body}</div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={onConfirm} disabled={busy}>
                {busy ? "Working…" : confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
