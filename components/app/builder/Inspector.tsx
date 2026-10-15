"use client";

import { useRef } from "react";
import { Glyph } from "../icons";
import { Switch } from "../ui";
import { StepChip } from "./StepCard";
import {
  CHECKS,
  GEOS,
  GOALS,
  LISTS,
  MERGE_VARS,
  SIZES,
  STEPS,
  WA_TEMPLATES,
  WEEKDAYS,
  defaults,
  stepLabel,
  type CheckKey,
  type GoalKey,
  type StepData,
  type StepNode,
  type Workflow,
  ATTRIBUTE_LABEL,
  STEP_ATTRIBUTE,
  type AudienceList,
} from "@/lib/app/workflow";

/** Shared text area with a merge-variable row and an optional length counter. */
function MessageField({
  label = "Message",
  value,
  onChange,
  rows = 6,
  max,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  max?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Insert at the caret, then put the caret back after what was inserted.
  const insert = (token: string) => {
    const el = ref.current;
    const at = el ? el.selectionStart : value.length;
    onChange(value.slice(0, at) + token + value.slice(at));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(at + token.length, at + token.length);
    });
  };

  return (
    <div className="fld">
      <div className="between">
        <label>{label}</label>
        {max && (
          <span className="hint num" style={value.length > max ? { color: "var(--alert)" } : undefined}>
            {value.length}/{max}
          </span>
        )}
      </div>
      <textarea ref={ref} className="ta" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="vars">
        {MERGE_VARS.map((token) => (
          <button type="button" key={token} onClick={() => insert(token)}>
            {token}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span>{value}</span>
      <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}

/** The right-hand panel: the settings for whichever step is selected. */
export function Inspector({
  node,
  issue,
  onChange,
  onClose,
  onDelete,
  onDuplicate,
  lists = LISTS,
  audienceKey,
}: {
  node: StepNode;
  issue?: string;
  /** Uploaded segments first, then the demo lists. */
  lists?: AudienceList[];
  audienceKey?: string;
  onChange: (patch: StepData) => void;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const d = node.data;
  const kind = node.kind;
  const own = lists.filter((l) => l.src === "This campaign" || l.src === "Workspace");
  const uploaded = lists.filter((l) => l.src === "Uploaded file");
  const demo = lists.filter((l) => l.src !== "Uploaded file" && !own.includes(l));
  const attribute = STEP_ATTRIBUTE[kind];
  const audience = lists.find((l) => l.k === (kind === "audience" ? d.list : audienceKey));
  const column = attribute && audience && audience.columns ? audience.columns[attribute] : undefined;

  return (
    <aside className="inspector" aria-label="Step settings">
      <div className="ins-h">
        <StepChip kind={kind} />
        <div>
          <b>{STEPS[kind].label}</b>
          <small>{stepLabel(kind, d, lists)}</small>
        </div>
        <button className="ib sm" onClick={onClose} aria-label="Close">
          <Glyph n="x" />
        </button>
      </div>

      <div className="ins-b">
        {issue && (
          <div className="issue">
            <Glyph n="alert" />
            {issue}
          </div>
        )}

        {attribute && (
          <div className="fld">
            <label>Reads from the segment</label>
            {column ? (
              <p className="insread">
                <b>{ATTRIBUTE_LABEL[attribute]}</b> from column “{column}”
                {audience ? ` in ${audience.name}` : ""} ·{" "}
                {(audience && audience.reach ? audience.reach[attribute] || 0 : 0).toLocaleString("en-US")} reachable
              </p>
            ) : (
              <p className="insread none">
                {ATTRIBUTE_LABEL[attribute]} — the chosen audience has no column mapped to it, so this step has
                nobody to send to.
              </p>
            )}
          </div>
        )}

        {kind === "audience" && (
          <>
            <div className="fld">
              <label htmlFor="ins-list">Audience</label>
              <select
                id="ins-list"
                className="sel"
                value={d.list}
                onChange={(e) => onChange({ list: e.target.value })}
              >
                {own.length > 0 && (
                  <optgroup label="Your leads">
                    {own.map((l) => (
                      <option value={l.k} key={l.k}>
                        {l.name} · {l.n}
                      </option>
                    ))}
                  </optgroup>
                )}
                {uploaded.length > 0 && (
                  <optgroup label="File segments">
                    {uploaded.map((l) => (
                      <option value={l.k} key={l.k}>
                        {l.name} · {l.n} reachable
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Demo lists">
                  {demo.map((l) => (
                    <option value={l.k} key={l.k}>
                      {l.name} · {l.n}
                    </option>
                  ))}
                </optgroup>
              </select>
              <span className="hint">
                {audience && audience.src === "Uploaded file"
                  ? "Counted from the leads that file can actually reach, not its row count."
                  : audience && own.includes(audience)
                    ? "Counted live from the leads in your workspace."
                    : "Demo lists are illustrative. Pick your own leads, or upload a file from Leads."}
              </span>
            </div>

            {audience && audience.columns && Object.keys(audience.columns).length > 0 && (
              <div className="fld">
                <label>Channels this segment can reach</label>
                <div className="insattrs">
                  {(Object.keys(audience.columns) as (keyof typeof ATTRIBUTE_LABEL)[]).map((key) => (
                    <span className="insattr" key={key}>
                      {ATTRIBUTE_LABEL[key]}
                      <b>{(audience.reach ? audience.reach[key] || 0 : 0).toLocaleString("en-US")}</b>
                      <small>{audience.columns ? audience.columns[key] : ""}</small>
                    </span>
                  ))}
                </div>
                <span className="hint">
                  Channel steps read these columns automatically — there is nothing to set per step.
                </span>
              </div>
            )}
            <div className="fld">
              <label htmlFor="ins-titles">Job titles</label>
              <input
                id="ins-titles"
                className="inp"
                value={d.titles}
                onChange={(e) => onChange({ titles: e.target.value })}
              />
            </div>
            <div className="grid2">
              <div className="fld">
                <label htmlFor="ins-size">Company size</label>
                <select
                  id="ins-size"
                  className="sel"
                  value={d.size}
                  onChange={(e) => onChange({ size: e.target.value })}
                >
                  {SIZES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label htmlFor="ins-geo">Location</label>
                <select id="ins-geo" className="sel" value={d.geo} onChange={(e) => onChange({ geo: e.target.value })}>
                  {GEOS.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {kind === "li_invite" && (
          <>
            <div className="trow" style={{ padding: 0 }}>
              <b>Add a note</b>
              <Switch
                on={!!d.note}
                label="Add a note"
                onChange={(on) => onChange({ note: on ? defaults("li_invite").note : "" })}
              />
            </div>
            {!!d.note && (
              <MessageField label="Note" value={d.note} onChange={(note) => onChange({ note })} rows={4} max={300} />
            )}
          </>
        )}

        {kind === "li_msg" && <MessageField value={d.body || ""} onChange={(body) => onChange({ body })} />}

        {kind === "sms" && (
          <MessageField value={d.body || ""} onChange={(body) => onChange({ body })} rows={4} max={160} />
        )}

        {kind === "email" && (
          <>
            <div className="fld">
              <label htmlFor="ins-subject">Subject</label>
              <input
                id="ins-subject"
                className="inp"
                value={d.subject}
                onChange={(e) => onChange({ subject: e.target.value })}
              />
            </div>
            <MessageField label="Body" value={d.body || ""} onChange={(body) => onChange({ body })} rows={8} />
            <div className="trow">
              <b>Reply in same thread</b>
              <Switch on={!!d.thread} label="Same thread" onChange={(thread) => onChange({ thread })} />
            </div>
          </>
        )}

        {kind === "wa" && (
          <>
            <div className="fld">
              <label htmlFor="ins-template">Template</label>
              <select
                id="ins-template"
                className="sel"
                value={d.template}
                onChange={(e) => onChange({ template: e.target.value })}
              >
                {Object.entries(WA_TEMPLATES).map(([k, name]) => (
                  <option value={k} key={k}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <MessageField value={d.body || ""} onChange={(body) => onChange({ body })} rows={5} />
          </>
        )}

        {kind === "call" && (
          <>
            <div className="fld">
              <label htmlFor="ins-assign">Assign to</label>
              <select
                id="ins-assign"
                className="sel"
                value={d.assign}
                onChange={(e) => onChange({ assign: e.target.value as "owner" | "rr" })}
              >
                <option value="owner">Lead owner</option>
                <option value="rr">Round robin</option>
              </select>
            </div>
            <div className="fld">
              <label htmlFor="ins-notes">Talking points</label>
              <textarea
                id="ins-notes"
                className="ta"
                rows={4}
                value={d.notes}
                onChange={(e) => onChange({ notes: e.target.value })}
              />
            </div>
          </>
        )}

        {kind === "wait" && (
          <>
            <div className="trow" style={{ padding: 0 }}>
              <b>Days</b>
              <Stepper value={d.days ?? 3} min={1} max={30} label="days" onChange={(days) => onChange({ days })} />
            </div>
            <div className="trow">
              <b>Business days only</b>
              <Switch on={!!d.biz} label="Business days" onChange={(biz) => onChange({ biz })} />
            </div>
          </>
        )}

        {kind === "cond" && (
          <>
            <div className="fld">
              <label htmlFor="ins-check">If the lead</label>
              <select
                id="ins-check"
                className="sel"
                value={d.check}
                onChange={(e) => onChange({ check: e.target.value as CheckKey })}
              >
                {Object.entries(CHECKS).map(([k, name]) => (
                  <option value={k} key={k}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {d.check === "score" ? (
              <div className="trow">
                <b>Score at least</b>
                <Stepper
                  value={d.score ?? 70}
                  min={10}
                  max={100}
                  step={5}
                  label="score"
                  onChange={(score) => onChange({ score })}
                />
              </div>
            ) : (
              <div className="trow">
                <b>Within (days)</b>
                <Stepper
                  value={d.within ?? 3}
                  min={1}
                  max={30}
                  label="days"
                  onChange={(within) => onChange({ within })}
                />
              </div>
            )}
          </>
        )}

        {kind === "split" && (
          <div className="fld">
            <div className="between">
              <label htmlFor="ins-split">Split</label>
              <span className="num" style={{ fontWeight: 600 }}>
                A {d.a}% · B {100 - (d.a ?? 50)}%
              </span>
            </div>
            <input
              id="ins-split"
              type="range"
              min="10"
              max="90"
              step="5"
              value={d.a ?? 50}
              onChange={(e) => onChange({ a: +e.target.value })}
              style={{ accentColor: "var(--accent)" }}
            />
          </div>
        )}

        {kind === "goal" && (
          <div className="fld">
            <label htmlFor="ins-goal">Goal</label>
            <select
              id="ins-goal"
              className="sel"
              value={d.goal}
              onChange={(e) => onChange({ goal: e.target.value as GoalKey })}
            >
              {Object.entries(GOALS).map(([k, name]) => (
                <option value={k} key={k}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {kind === "exit" && <p className="muted" style={{ fontSize: 13 }}>Leads leave this workflow here.</p>}
      </div>

      {kind !== "audience" && (
        <div className="ins-f">
          <button className="btn sm line" onClick={onDuplicate}>
            Duplicate
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn sm danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      )}
    </aside>
  );
}

/** The same panel, holding the workflow's own sending window. */
export function WorkflowSettings({
  meta,
  setMeta,
  onClose,
}: {
  meta: Workflow;
  setMeta: (next: (prev: Workflow) => Workflow) => void;
  onClose: () => void;
}) {
  return (
    <aside className="inspector" aria-label="Workflow settings">
      <div className="ins-h">
        <div>
          <b>Workflow settings</b>
        </div>
        <button className="ib sm" onClick={onClose} aria-label="Close">
          <Glyph n="x" />
        </button>
      </div>

      <div className="ins-b">
        <div className="fld">
          <span className="flabel">Send on</span>
          <div className="days">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={meta.days.includes(day)}
                className={meta.days.includes(day) ? "on" : ""}
                onClick={() =>
                  setMeta((w) => ({
                    ...w,
                    days: w.days.includes(day)
                      ? w.days.filter((d) => d !== day)
                      : WEEKDAYS.filter((d) => w.days.includes(d) || d === day),
                  }))
                }
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div className="grid2">
          <div className="fld">
            <label htmlFor="wf-from">From</label>
            <select
              id="wf-from"
              className="sel"
              value={meta.from}
              onChange={(e) => setMeta((w) => ({ ...w, from: e.target.value }))}
            >
              {["08:00", "09:00", "10:00"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="wf-to">Until</label>
            <select
              id="wf-to"
              className="sel"
              value={meta.to}
              onChange={(e) => setMeta((w) => ({ ...w, to: e.target.value }))}
            >
              {["17:00", "18:00", "19:00"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="trow">
          <b>New leads per day</b>
          <Stepper
            value={meta.daily}
            min={5}
            max={200}
            step={5}
            label="leads per day"
            onChange={(daily) => setMeta((w) => ({ ...w, daily }))}
          />
        </div>

        <div className="trow">
          <b>
            Stop on reply{" "}
            <span className="muted" style={{ fontWeight: 400 }}>
              · always on
            </span>
          </b>
          <Switch on disabled label="Stop on reply" />
        </div>

        <div className="trow">
          <b>Skip leads in other workflows</b>
          <Switch on={meta.skipOther} label="Skip" onChange={(skipOther) => setMeta((w) => ({ ...w, skipOther }))} />
        </div>

        <p className="muted" style={{ fontSize: 12.5 }}>
          Changes save automatically. Figures on this canvas are illustrative estimates from the audience size, not results. Sending isn&apos;t connected yet, so nothing is sent.
        </p>
      </div>
    </aside>
  );
}
