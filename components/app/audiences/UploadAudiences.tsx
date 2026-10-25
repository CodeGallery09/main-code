"use client";

/**
 * The Import an audience modal, opened from the Audiences screen.
 *
 * Three steps, in the order the product describes them:
 *   1. File     — audience name, description (300 characters) and the file itself.
 *                 The file is sent straight to the server, which parses it and
 *                 returns the headers and the first five rows.
 *   2. Mapping  — the user points each system attribute at a column. Column
 *                 names are only ever a guess; the rules run on row content.
 *   3. Review   — `ImportReview`: totals (rows, valid, duplicates, missing
 *                 details, will be imported), every importable row with what
 *                 will happen to it, the error log and a warning for anyone
 *                 already in a journey in another strategy (they are left out).
 *                 Import saves the audience (a segment) and merges the rows into
 *                 the workspace's audiences. It never starts outreach.
 *
 * Nothing is kept in the browser but the upload id: every count on screen was
 * worked out on the server, and the server works them out again on submit.
 */

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { MAX_DESCRIPTION } from "@/lib/audiences/upload";
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_MB } from "@/lib/audiences/limits";
import { ATTRIBUTES, type Mapping } from "@/lib/audiences/validation";
import type { MappingReport, Segment, UploadPreview } from "@/lib/audiences/segments";
import { CheckIcon } from "../icons";
import { ImportReview } from "./ImportReview";

type Step = "file" | "map" | "summary";

const STEP_LABEL: [Step, string][] = [
  ["file", "File"],
  ["map", "Mapping"],
  ["summary", "Review & import"],
];

const kb = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickFile = async (file: File | undefined) => {
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
  };

  const check = async () => {
    if (!preview) return;
    setError("");
    setBusy("checking");
    try {
      setReport(await api.validateUpload(preview.uploadId, mapping));
      setStep("summary");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Those columns could not be checked.");
    } finally {
      setBusy("");
    }
  };

  const submit = async () => {
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
  };

  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal wide upmodal" role="dialog" aria-modal="true" aria-label="Import an audience">
        <div className="m-h">
          <div>
            <h2>Import an audience</h2>
            <p>One file is one audience. It is read on the server, and nothing is saved until you confirm the review.</p>
          </div>
          <button className="ib" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <ol className="upsteps" aria-label="Steps">
          {STEP_LABEL.map(([key, label], i) => {
            const at = STEP_LABEL.findIndex(([k]) => k === step);
            const state = i < at ? " done" : i === at ? " on" : "";
            return (
              <li className={"upstep" + state} key={key}>
                <span className="n">{i < at ? <CheckIcon /> : i + 1}</span>
                {label}
              </li>
            );
          })}
        </ol>

        <div className="m-b">
          {error && <p className="upwarn">{error}</p>}

          {step === "file" && (
            <>
              <div className="fld">
                <label htmlFor="seg-name">Audience name</label>
                <input
                  id="seg-name"
                  className="inp"
                  value={name}
                  placeholder="Q4 SaaS founders"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="fld">
                <label htmlFor="seg-desc">
                  Description <span className="hint">(optional)</span>
                </label>
                <textarea
                  id="seg-desc"
                  className="ta"
                  value={description}
                  maxLength={MAX_DESCRIPTION}
                  placeholder="Where this list came from and who is on it."
                  onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
                />
                <span className="hint">
                  {description.length} / {MAX_DESCRIPTION} characters
                </span>
              </div>

              <div
                className={"drop big" + (dragging ? " over" : "")}
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
              >
                <b>{busy === "parsing" ? "Reading the file…" : "Drop a .csv or .xlsx file here"}</b>
                <span>Up to {MAX_UPLOAD_MB} MB. The first five rows are shown back to you before anything is saved.</span>
                <button className="btn line sm" onClick={() => fileInput.current?.click()} disabled={busy === "parsing"}>
                  Choose file
                </button>
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
              <p className="uprow">
                <b>{preview.fileName}</b>
                <span className="hint">
                  {kb(preview.fileSize)} · {preview.totalRows.toLocaleString("en-US")} rows ·{" "}
                  {preview.headers.length} columns
                </span>
              </p>

              <div className="tblw upprev">
                <table className="tbl">
                  <thead>
                    <tr>
                      {preview.headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <span className="eyebrow">Map columns to attributes</span>
                <p className="hint upnote">
                  Column names don’t have to match. Every entry is checked on its own content — “@” for email, a
                  “+” country code with that country’s exact digit count for numbers, and a web URL for LinkedIn.
                </p>
                <div className="mapgrid">
                  {ATTRIBUTES.map(({ key, label, hint }) => (
                    <div className="fld" key={key}>
                      <label htmlFor={`map-${key}`}>{label}</label>
                      <select
                        id={`map-${key}`}
                        className="sel"
                        value={mapping[key] || ""}
                        onChange={(e) =>
                          setMapping((m) => {
                            const next = { ...m };
                            if (e.target.value) next[key] = e.target.value;
                            else delete next[key];
                            return next;
                          })
                        }
                      >
                        <option value="">Not mapped</option>
                        {preview.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                      <span className="hint">{hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === "summary" && report && (
            <ImportReview report={report} consent={consent} onConsent={setConsent} />
          )}
        </div>

        <div className="m-f">
          {step === "map" && (
            <button className="btn line" onClick={() => setStep("file")}>
              Back
            </button>
          )}
          {step === "summary" && (
            <button className="btn line" onClick={() => setStep("map")}>
              Back to mapping
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn line" onClick={onClose}>
            Cancel
          </button>
          {step === "map" && (
            <button className="btn pri" onClick={() => void check()} disabled={!mappedCount || busy === "checking"}>
              {busy === "checking" ? "Checking…" : "Review import"}
            </button>
          )}
          {step === "summary" && (
            <button
              className="btn pri"
              onClick={() => void submit()}
              disabled={busy === "saving" || !report || report.plan.people === 0}
            >
              {busy === "saving"
                ? "Importing…"
                : `Import ${(report?.plan.people ?? 0).toLocaleString("en-US")} ${report?.plan.people === 1 ? "prospect" : "prospects"}`}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
