"use client";

/**
 * Configuration · Variables, Sending rules and Compliance — the three tabs that
 * apply across every channel.
 *
 * Variables is scoped by channel: a variable belongs to the channels listed in
 * its own set, so the sub-tab splits them into the ones specific to that
 * channel and the ones it shares. Snippets are shared everywhere.
 *
 * All three tabs now load from and save to `/api/settings` (`workspace_settings` in the
 * database, a module-level object in demo mode) — see `lib/data/validate.ts` for what each field
 * accepts and `lib/app/configuration.ts#defaultWorkspaceSettings()` for what a workspace starts
 * with. They still don't *do* anything: `SavedNote` says so, because `SENDING_ENABLED` stays
 * false until a real sender exists. A few controls remain genuinely unbuilt (snippets, "Add
 * variable", the do-not-contact CSV upload) and still say so inline with `DemoNote`-style text,
 * not because saving is fake but because there is nowhere yet to save them to.
 */

import { useEffect, useRef, useState } from "react";
import { CHANNEL } from "@/lib/app/channels";
import {
  AUDIENCE_RULES,
  CONSENT,
  GUARDRAILS,
  HOLIDAY_COUNTRIES,
  REGIONAL_RULES,
  RETENTION_OPTIONS,
  STOP_RULES,
  VARIABLES,
  VARIABLE_CHANNELS,
  WEEK,
  defaultWorkspaceSettings,
  type Variable,
} from "@/lib/app/configuration";
import type { ChannelKey } from "@/lib/app/channels";
import type { WorkspaceSettings } from "@/lib/data/types";
import type { SettingsPatch } from "@/lib/data/repository";
import { api, fieldErrorsOf } from "@/lib/api";
import { Segmented, Switch } from "../ui";
import { Glyph } from "../icons";
import { Panel, Row, SavedNote, Stepper, ToggleRowView } from "./parts";

const DEFAULTS = defaultWorkspaceSettings();

/* ---------- saving ---------------------------------------------------------- */

/**
 * Loads one section of `/api/settings` on mount (starting from its default so the screen never
 * flashes empty) and saves it back a moment after the last edit. Mirrors the `useSavedSetting`
 * pattern in `ChannelTabs.tsx`, generalised to a whole object instead of one number.
 */
function useSavedSection<K extends "variableFallbacks" | "sendingRules" | "compliance">(
  section: K,
  initial: WorkspaceSettings[K],
) {
  const [value, setValue] = useState<WorkspaceSettings[K]>(initial);
  const [failed, setFailed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((r) => setValue(r.settings[section]))
      .catch(() => {
        // Demo mode with no session, or a transient failure: keep showing the default.
      });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [section]);

  const save = (next: WorkspaceSettings[K]) => {
    setValue(next);
    setFailed(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.updateSettings({ [section]: next } as SettingsPatch).catch((caught) => {
        const fields = fieldErrorsOf(caught);
        setFailed(fields ? Object.values(fields)[0] : "Couldn't save that. Try again.");
      });
    }, 500);
  };

  const patch = (partial: Partial<WorkspaceSettings[K]>) => save({ ...value, ...partial });

  return { value, save, patch, failed };
}

/* ========== Variables ==================================================== */

export function VariablesTab() {
  const [channel, setChannel] = useState<ChannelKey>("li");
  const { value: fallbacks, patch, failed } = useSavedSection("variableFallbacks", DEFAULTS.variableFallbacks);
  const name = CHANNEL[channel].name;
  const own = VARIABLES.filter((v) => v.channels.length === 1 && v.channels[0] === channel);
  const shared = VARIABLES.filter((v) => v.channels.length > 1 && v.channels.includes(channel));

  const setFallback = (token: string, text: string) => patch({ [token]: text || null });

  return (
    <div className="cf-stack">
      <Segmented
        value={channel}
        onChange={setChannel}
        items={VARIABLE_CHANNELS.map((k) => [k, CHANNEL[k].name] as [ChannelKey, string])}
      />

      <Panel
        title={`${name} variables`}
        sub={`Write {first_name} in any message on this channel. The fallback is used when a lead has no value.`}
        action={
          <button type="button" className="btn sm line" disabled title="Not available yet">
            Add variable
          </button>
        }
      >
        <VariableTable
          variables={own}
          fallbacks={fallbacks}
          onFallback={setFallback}
          empty={`No variables specific to ${name} yet.`}
        />
      </Panel>

      <Panel
        title="Shared with other channels"
        sub="Also usable on this channel, plus every channel listed in each variable's own set"
      >
        <VariableTable
          variables={shared}
          fallbacks={fallbacks}
          onFallback={setFallback}
          empty="Nothing shared with this channel yet."
        />
      </Panel>

      <Panel
        title="Snippets"
        sub="Reusable text, shared across every channel. Write {{booking_link}} and it updates everywhere when you change it here."
      >
        <p className="cf-nocontent">
          No snippets yet. Saving snippets isn&apos;t available yet, so write the text in the message for now.
        </p>
      </Panel>

      {failed && <p className="cf-bad">{failed}</p>}
      <SavedNote what="fallbacks above" />
    </div>
  );
}

function VariableTable({
  variables,
  fallbacks,
  onFallback,
  empty,
}: {
  variables: Variable[];
  fallbacks: Record<string, string | null>;
  onFallback: (token: string, value: string) => void;
  empty: string;
}) {
  if (!variables.length) return <p className="cf-nocontent">{empty}</p>;
  return (
    <>
      <div className="cf-vrow head">
        <span>Variable</span>
        <span>Comes from</span>
        <span>Fallback</span>
        <span />
      </div>
      {variables.map((v) => {
        const fallback = fallbacks[v.token] ?? null;
        return (
          <div className="cf-vrow" key={v.token}>
            <span className="mono">{v.token}</span>
            <span className="muted">{v.from}</span>
            <input
              className={"inp" + (fallback ? "" : " warnin")}
              value={fallback ?? ""}
              onChange={(e) => onFallback(v.token, e.target.value)}
              placeholder="No fallback"
              aria-label={`Fallback for ${v.token}`}
            />
            {fallback ? <span /> : <span className="cf-bad">Blank if missing</span>}
          </div>
        );
      })}
    </>
  );
}

/* ========== Sending rules ================================================ */

export function SendingRulesTab() {
  const { value: rules, patch, failed } = useSavedSection("sendingRules", DEFAULTS.sendingRules);

  const toggleIn = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const toggleStop = (id: string) => patch({ stops: { ...rules.stops, [id]: !rules.stops[id] } });
  const toggleAudience = (id: string) => patch({ audience: { ...rules.audience, [id]: !rules.audience[id] } });

  return (
    <div className="cf-stack">
      <Panel title="Sending window" sub="Nothing sends outside these hours, on any channel">
        <Row label="Days">
          <div className="days">
            {WEEK.map((d) => (
              <button
                type="button"
                key={d}
                className={rules.days.includes(d) ? "on" : ""}
                aria-pressed={rules.days.includes(d)}
                onClick={() => patch({ days: toggleIn(rules.days, d) })}
              >
                {d}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Hours">
          <span className="row" style={{ gap: 8 }}>
            <input
              className="inp cf-in sm"
              type="time"
              value={rules.from}
              onChange={(e) => patch({ from: e.target.value })}
              aria-label="From"
            />
            <span className="muted">to</span>
            <input
              className="inp cf-in sm"
              type="time"
              value={rules.to}
              onChange={(e) => patch({ to: e.target.value })}
              aria-label="To"
            />
          </span>
        </Row>
        <Row label="Time zone">
          <Segmented
            value={rules.timezone}
            onChange={(timezone) => patch({ timezone })}
            items={[
              ["lead", "Lead's local time"],
              ["workspace", "Workspace (IST)"],
            ]}
          />
        </Row>
        <Row label="Skip public holidays" hint="No sends to leads in a country on its holidays">
          <div className="days">
            {HOLIDAY_COUNTRIES.map((c) => (
              <button
                type="button"
                key={c}
                className={rules.holidays.includes(c) ? "on" : ""}
                aria-pressed={rules.holidays.includes(c)}
                onClick={() => patch({ holidays: toggleIn(rules.holidays, c) })}
              >
                {c}
              </button>
            ))}
          </div>
        </Row>
      </Panel>

      <Panel
        title="Contact limit per lead"
        sub="Counts every touch across standalone and multichannel campaigns"
      >
        <Row label="Limit how often a lead is contacted">
          <Switch
            on={rules.limitOn}
            label="Limit how often a lead is contacted"
            onChange={(limitOn) => patch({ limitOn })}
          />
        </Row>
        {rules.limitOn && (
          <>
            <Row label="Per day">
              <Stepper value={rules.perDay} min={1} max={10} onChange={(perDay) => patch({ perDay })} />
            </Row>
            <Row label="Per week">
              <Stepper value={rules.perWeek} min={1} max={30} onChange={(perWeek) => patch({ perWeek })} />
            </Row>
          </>
        )}
      </Panel>

      <Panel title="Stop rules" sub="When a campaign stops for a lead">
        {STOP_RULES.map((r) => (
          <ToggleRowView key={r.id} {...r} on={rules.stops[r.id] ?? r.on} onChange={toggleStop} />
        ))}
      </Panel>

      <Panel
        title="Auto-pause guardrails"
        sub="Sending pauses and you get an alert before reputation takes a hit"
      >
        <Row label="Email bounce rate above">
          <span className="row" style={{ gap: 8 }}>
            <Stepper value={rules.bounceRate} min={1} max={20} onChange={(bounceRate) => patch({ bounceRate })} />
            <span className="muted">% · pauses the mailbox</span>
          </span>
        </Row>
        <Row label="Spam complaints above">
          <span className="num">{GUARDRAILS.spamComplaints}</span>
        </Row>
        <Row label="LinkedIn acceptance below">
          <span className="row" style={{ gap: 8 }}>
            <Stepper value={rules.acceptance} min={5} max={60} onChange={(acceptance) => patch({ acceptance })} />
            <span className="muted">% for 3 days · pauses invites</span>
          </span>
        </Row>
        <Row
          label="Slow WhatsApp when quality drops to Medium"
          hint="Halves new conversations until quality recovers"
        >
          <Switch
            on={rules.slowWhatsApp}
            label="Slow WhatsApp on Medium quality"
            onChange={(slowWhatsApp) => patch({ slowWhatsApp })}
          />
        </Row>
      </Panel>

      <Panel title="Who gets contacted">
        {AUDIENCE_RULES.map((r) => (
          <ToggleRowView key={r.id} {...r} on={rules.audience[r.id] ?? r.on} onChange={toggleAudience} />
        ))}
        <Row label="Wait before contacting a lead again">
          <span className="row" style={{ gap: 8 }}>
            <Stepper value={rules.cooloff} max={365} step={30} onChange={(cooloff) => patch({ cooloff })} />
            <span className="muted">days after a campaign ends</span>
          </span>
        </Row>
      </Panel>

      {failed && <p className="cf-bad">{failed}</p>}
      <SavedNote what="rules above" />
    </div>
  );
}

/* ========== Compliance =================================================== */

export function ComplianceTab() {
  const { value: compliance, patch, failed } = useSavedSection("compliance", DEFAULTS.compliance);
  const [draft, setDraft] = useState("");

  const addDomain = () => {
    const d = draft.trim().toLowerCase();
    if (!d) return;
    patch({ domains: Array.from(new Set([...compliance.domains, d])) });
    setDraft("");
  };

  return (
    <div className="cf-stack">
      <div className="grid2 cf-g2">
        <section className="card cf-card">
          <div className="card-h">
            <div>
              <h3>Do-not-contact list</h3>
            </div>
            <button type="button" className="btn sm line" disabled title="Not available yet">
              Upload CSV
            </button>
          </div>
          <div className="cf-body">
            <div className="cf-big">
              <b className="num">0</b>
              <span className="muted">emails and numbers on your do-not-contact list</span>
            </div>
            <small className="muted">
              Nothing is on the list yet. Uploading a list isn&apos;t available yet.
            </small>
          </div>
        </section>

        <Panel title="Suppressed domains" sub="Competitors, partners and your own company">
          <div className="cf-chips">
            {compliance.domains.map((d) => (
              <span className="tag" key={d}>
                {d}
                <button
                  type="button"
                  aria-label={`Remove ${d}`}
                  onClick={() => patch({ domains: compliance.domains.filter((x) => x !== d) })}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              className="inp cf-in sm"
              aria-label="Add domain"
              placeholder="Add domain"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addDomain();
              }}
              onBlur={addDomain}
            />
          </div>
        </Panel>
      </div>

      <Panel title="Consent by channel">
        {CONSENT.map((c) => {
          const channel = CHANNEL[c.k];
          const chosen = compliance.consent[c.k] ?? c.chosen ?? 0;
          return (
            <Row
              key={c.k}
              label={
                <span className="row" style={{ gap: 8 }}>
                  <i className="cdot" style={{ background: channel.hex }} />
                  {channel.name}
                </span>
              }
              locked={!c.options.length}
            >
              {c.options.length ? (
                <Segmented
                  value={String(chosen)}
                  onChange={(v) => patch({ consent: { ...compliance.consent, [c.k]: Number(v) } })}
                  items={c.options.map((o, i) => [String(i), o] as [string, string])}
                />
              ) : (
                <span className="muted">{c.fixed}</span>
              )}
            </Row>
          );
        })}
      </Panel>

      <Panel title="Regional rules" sub="Applied by each lead's country">
        {REGIONAL_RULES.map((r) => (
          <ToggleRowView
            key={r.id}
            {...r}
            on={compliance.regional[r.id] ?? r.on}
            onChange={(id) => patch({ regional: { ...compliance.regional, [id]: !compliance.regional[id] } })}
          />
        ))}
      </Panel>

      <Panel title="Data retention">
        <Row label="Delete inactive lead data after">
          <select
            className="sel cf-in"
            aria-label="Delete inactive lead data after"
            value={compliance.retention}
            onChange={(e) => patch({ retention: e.target.value })}
          >
            {RETENTION_OPTIONS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Row>
        <Row label="Export a lead's data on request" hint="Everything Flightpath holds, as a CSV">
          <button type="button" className="btn sm line">
            <Glyph n="users" />
            Export
          </button>
        </Row>
      </Panel>

      {failed && <p className="cf-bad">{failed}</p>}
      <SavedNote what="choices above" />
    </div>
  );
}
