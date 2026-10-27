"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, FileUp, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { MAX_DESCRIPTION } from "@/lib/audiences/upload";
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_MB } from "@/lib/audiences/limits";
import { ATTRIBUTES, type Mapping } from "@/lib/audiences/validation";
import type { MappingReport, Segment, UploadPreview } from "@/lib/audiences/segments";
import { EASE_OUT } from "@/components/ws/ui/motion";
import { Button } from "@/components/ws/ui/button";
import { cn, fmt } from "@/lib/ws/utils";
import { ImportReview } from "./import-review";

type Step = "file" | "map" | "review";

const STEPS: [Step, string][] = [
  ["file", "File"],
  ["map", "Match columns"],
  ["review", "Review & save"],
];

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Upload an audience. One file is one audience.
 *
 * Three steps, and the third is the point: the drop zone promises a review, so
 * nothing is written until the user has seen duplicates, rows missing a
 * contact, invalid numbers and anyone already in another strategy. The file is
 * parsed on the server; the browser only ever holds the upload id.
 */
export function UploadAudiences({ onClose, onSaved }: { onClose: () => void; onSaved: (segment: Segment) => void }) {
  const [step, setStep] = useState<Step>("file");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [report, setReport] = useState<MappingReport | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<"" | "parsing" | "checking" | "saving">("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const still = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy("parsing");
    try {
      const next = await api.uploadAudienceFile(file);
      setPreview(next);
      setMapping(next.suggestedMapping);
      setReport(null);
      if (!name.trim()) setName(file.name.replace(/\.(csv|xlsx)$/i, ""));
      setStep("map");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That file could not be read.");
    } finally {
      setBusy("");
    }
  }

  async function check() {
    if (!preview) return;
    setError("");
    setBusy("checking");
    try {
      setReport(await api.validateUpload(preview.uploadId, mapping));
      setStep("review");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Those columns could not be checked.");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!preview) return;
    if (!name.trim()) {
      setError("Give the audience a name.");
      setStep("file");
      return;
    }
    setError("");
    setBusy("saving");
    try {
      const saved = await api.createSegment({
        uploadId: preview.uploadId,
        name: name.trim(),
        description: description.trim(),
        mapping,
        consent,
      });
      onSaved(saved.segment);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That audience could not be saved.");
    } finally {
      setBusy("");
    }
  }

  const mapped = Object.values(mapping).filter(Boolean).length;
  const at = STEPS.findIndex(([k]) => k === step);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-5">
      <button type="button" aria-label="Cancel" onClick={onClose} className="fixed inset-0 bg-[rgba(20,20,19,0.28)]" />
      <motion.div
        role="dialog"
        aria-modal
        aria-label="Upload an audience"
        className="relative my-6 w-full max-w-[920px] rounded-xl border border-border bg-card"
        initial={still ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={EASE_OUT}
      >
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-mono text-[14.5px] font-bold tracking-[-0.01em]">Upload an audience</h2>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              One file is one audience. It is read on the server, and nothing is saved until you confirm the review.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <X aria-hidden strokeWidth={2.2} />
          </Button>
        </header>

        <ol aria-label="Steps" className="flex flex-wrap items-center gap-[18px] border-b border-border bg-chrome px-5 py-[8px]">
          {STEPS.map(([key, label], i) => (
            <li key={key} className="flex items-center gap-[8px]">
              <span
                className={cn(
                  "flex size-[20px] items-center justify-center rounded-full font-mono text-[10.5px] font-bold",
                  i < at ? "bg-success-bg text-success" : i === at ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {i < at ? <Check aria-hidden className="size-[12px]" strokeWidth={2.4} /> : i + 1}
              </span>
              <span className={cn("text-[11.5px]", i === at ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {label}
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-4 px-5 py-[16px]">
          {error && (
            <p role="alert" className="rounded-[10px] border border-warning-border bg-warning-bg px-[13px] py-[10px] text-[11.5px] text-warning">
              {error}
            </p>
          )}

          {step === "file" && (
            <>
              <Field id="seg-name" label="Audience name">
                <input
                  id="seg-name"
                  value={name}
                  placeholder="Q4 SaaS founders"
                  onChange={(e) => setName(e.target.value)}
                  className="h-[36px] w-full rounded-lg border border-input bg-card px-[12px] text-[12px]"
                />
              </Field>
              <Field id="seg-desc" label="Description (optional)">
                <textarea
                  id="seg-desc"
                  value={description}
                  maxLength={MAX_DESCRIPTION}
                  placeholder="Where this list came from and who is on it."
                  onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
                  className="min-h-[72px] w-full resize-y rounded-lg border border-input bg-card px-[12px] py-[9px] text-[12px] leading-[1.55]"
                />
                <span className="font-mono text-[10.5px] text-muted-foreground">
                  {description.length} / {MAX_DESCRIPTION}
                </span>
              </Field>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void pickFile(e.dataTransfer.files[0]);
                }}
                className={cn(
                  "flex flex-col items-center gap-[10px] rounded-xl border border-dashed px-5 py-9 text-center transition-colors",
                  dragging ? "border-primary bg-accent" : "border-input bg-chrome",
                )}
              >
                <span className="flex size-[40px] items-center justify-center rounded-[10px] border border-border bg-card text-body">
                  <FileUp aria-hidden className="size-[19px]" strokeWidth={1.7} />
                </span>
                <span className="text-[12.5px] font-semibold">
                  {busy === "parsing" ? "Reading the file…" : "Drop a .csv or .xlsx here"}
                </span>
                <span className="max-w-[420px] text-[11.5px] leading-[1.55] text-muted-foreground">
                  Up to {MAX_UPLOAD_MB} MB. We match the columns, flag duplicates against leads you already have, and
                  show you everything before saving.
                </span>
                <Button variant="outline" disabled={busy === "parsing"} onClick={() => fileInput.current?.click()}>
                  Choose a file
                </Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS.join(",")}
                  hidden
                  onChange={(e) => void pickFile(e.target.files?.[0])}
                />
              </div>
            </>
          )}

          {step === "map" && preview && (
            <>
              <p className="flex flex-wrap items-baseline gap-[10px]">
                <span className="text-[12.5px] font-semibold">{preview.fileName}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {size(preview.fileSize)} · {fmt(preview.totalRows)} rows · {preview.headers.length} columns
                </span>
              </p>

              <div className="max-h-[200px] overflow-auto rounded-[11px] border border-border">
                <table className="w-full border-collapse text-left">
                  <thead className="sticky top-0 bg-chrome">
                    <tr>
                      {preview.headers.map((header) => (
                        <th key={header} className="label-mono whitespace-nowrap border-b border-border px-[12px] py-[8px] text-[10.5px]">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className="whitespace-nowrap border-b border-divider px-[12px] py-[8px] text-[11.5px]">
                            {cell || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-[10px]">
                <span className="label-mono">Match columns to attributes</span>
                <p className="text-[11.5px] leading-[1.55] text-muted-foreground">
                  Column names don&apos;t have to match. Every entry is checked on its own content — an “@” for email, a
                  country code with that country&apos;s exact digit count for numbers, and a web address for LinkedIn.
                </p>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                  {ATTRIBUTES.map(({ key, label, hint }) => (
                    <div key={key} className="flex flex-col gap-[5px]">
                      <label htmlFor={`map-${key}`} className="label-mono">
                        {label}
                      </label>
                      <select
                        id={`map-${key}`}
                        value={mapping[key] || ""}
                        onChange={(e) =>
                          setMapping((m) => {
                            const next = { ...m };
                            if (e.target.value) next[key] = e.target.value;
                            else delete next[key];
                            return next;
                          })
                        }
                        className="h-[36px] rounded-lg border border-input bg-card px-[11px] text-[12px]"
                      >
                        <option value="">Not mapped</option>
                        {preview.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                      <span className="text-[11px] leading-[1.45] text-muted-foreground">{hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === "review" && report && <ImportReview report={report} consent={consent} onConsent={setConsent} />}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-[10px]">
          {step === "map" && (
            <Button variant="outline" onClick={() => setStep("file")}>
              Back
            </Button>
          )}
          {step === "review" && (
            <Button variant="outline" onClick={() => setStep("map")}>
              Back to columns
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {step === "map" && (
            <Button disabled={!mapped || busy === "checking"} onClick={() => void check()}>
              {busy === "checking" ? "Checking…" : "Review the import"}
            </Button>
          )}
          {step === "review" && report && (
            <Button disabled={busy === "saving" || report.plan.people === 0} onClick={() => void save()}>
              {busy === "saving"
                ? "Saving…"
                : `Save ${fmt(report.plan.people)} ${report.plan.people === 1 ? "lead" : "leads"}`}
            </Button>
          )}
        </footer>
      </motion.div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[5px]">
      <label htmlFor={id} className="label-mono">
        {label}
      </label>
      {children}
    </div>
  );
}
