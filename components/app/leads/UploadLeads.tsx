"use client";

/**
 * The Upload leads modal, opened from the Leads dropdown in the rail.
 *
 * Three steps, in the order the product describes them:
 *   1. File     — segment name, description (300 characters) and the file itself.
 *                 The file is sent straight to the server, which parses it and
 *                 returns the headers and the first five rows.
 *   2. Mapping  — the user points each system attribute at a column. Column
 *                 names are only ever a guess; the rules run on row content.
 *   3. Summary  — reachable leads per channel and the row-by-row error log,
 *                 a warning for anyone already in a journey in another campaign
 *                 (they are left out), then Submit, which saves the segment and
 *                 merges the rows into the workspace's leads.
 *
 * Nothing is kept in the browser but the upload id: every count on screen was
 * worked out on the server, and the server works them out again on submit.
 */

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { MAX_DESCRIPTION } from "@/lib/leads/upload";
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_MB } from "@/lib/leads/limits";
import { ATTRIBUTES, type Mapping } from "@/lib/leads/validation";
import type { MappingReport, Segment, UploadPreview } from "@/lib/leads/segments";
import { CheckIcon } from "../icons";

type Step = "file" | "map" | "summary";

const STEP_LABEL: [Step, string][] = [
  ["file", "File"],
  ["map", "Mapping"],
  ["summary", "Reachable leads"],
];

const kb = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function UploadLeads({ onClose, onSaved }: { onClose: () => void; onSaved: (segment: Segment) => void }) {
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
      const next = await api.uploadLeadFile(file);
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
      setError("Give the segment a name.");
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
      setError(e instanceof ApiError ? e.message : "That segment could not be saved.");
    } finally {
      setBusy("");
    }
  };

  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal wide upmodal" role="dialog" aria-modal="true" aria-label="Upload leads">
        <div className="m-h">
          <div>
            <h2>Upload leads</h2>
            <p>One file is one segment. The file is read on the server; only a preview comes back.</p>
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
                <label htmlFor="seg-name">Segment name</label>
                <input
                  id="seg-name"
                  className="inp"
                  value={name}
                  placeholder="Q4 SaaS founders"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="fld">
                <label htmlFor="seg-desc">Segment description</label>
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
            <>
              <div className="reachrow">
                {report.channels
                  .filter((c) => c.column)
                  .map((c) => {
                    const meta = ATTRIBUTES.find((a) => a.key === c.attribute);
                    return (
                      <div className="reach" key={c.attribute}>
                        <span className="eyebrow">{meta ? meta.label : c.attribute}</span>
                        <b>
                          {report.totalRows.toLocaleString("en-US")} uploaded,{" "}
                          {c.reachable.toLocaleString("en-US")} reachable
                        </b>
                        <small>
                          from “{c.column}” · {c.invalid.toLocaleString("en-US")} invalid ·{" "}
                          {c.blank.toLocaleString("en-US")} blank
                        </small>
                      </div>
                    );
                  })}
              </div>
              {report.journey.excluded > 0 && (
                <div className="warnbox" role="alert">
                  <b>
                    {report.journey.excluded.toLocaleString("en-US")}{" "}
                    {report.journey.excluded === 1 ? "lead" : "leads"} will be excluded
                  </b>
                  <span>
                    {report.journey.excluded === 1 ? "This person is" : "These people are"} already in a journey in
                    another campaign (
                    {report.journey.byCampaign
                      .map((c) => `${c.name}: ${c.count.toLocaleString("en-US")}`)
                      .join(", ")}
                    ), so they are left out rather than added to a second sequence. The counts below don’t include
                    them.
                  </span>
                </div>
              )}
              <p className="uprow">
                <b>
                  {report.reachableRows.toLocaleString("en-US")} of {report.totalRows.toLocaleString("en-US")} rows
                  will be added, reachable on at least one channel
                </b>
                <span className="hint">
                  {report.errorCount.toLocaleString("en-US")} entries could not be used
                  {report.errorCount > report.errors.length
                    ? `, showing the first ${report.errors.length.toLocaleString("en-US")}`
                    : ""}
                  .
                </span>
              </p>

              {report.errors.length > 0 && (
                <div className="tblw errlog">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Attribute</th>
                        <th>Entry</th>
                        <th>Why it is unreachable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.errors.map((e, i) => (
                        <tr key={`${e.row}-${e.attribute}-${i}`}>
                          <td className="num">{e.row}</td>
                          <td>{ATTRIBUTES.find((a) => a.key === e.attribute)?.label || e.attribute}</td>
                          <td className="num">{e.value || "—"}</td>
                          <td>{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <label className="uprow" style={{ alignItems: "flex-start", gap: 8, display: "flex" }}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <b>These people have agreed to be contacted, or I have a lawful basis to contact them.</b>
                  <span className="hint" style={{ display: "block" }}>
                    Leads this file adds are marked with that consent. Without it they are saved, but they are
                    flagged and won’t be contacted.
                  </span>
                </span>
              </label>

              <p className="hint">
                On submit, rows that match a lead you already have (same email, mobile, WhatsApp or LinkedIn) are
                merged into that lead, and anything it was missing is filled in. An existing lead’s consent is never
                changed by an upload.
              </p>
            </>
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
              {busy === "checking" ? "Checking…" : "Check reachable leads"}
            </button>
          )}
          {step === "summary" && (
            <button
              className="btn pri"
              onClick={() => void submit()}
              disabled={busy === "saving" || !report || report.reachableRows === 0}
            >
              {busy === "saving" ? "Saving…" : "Submit segment"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
