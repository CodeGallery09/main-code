"use client";

/**
 * Configuration · Variables, Sending rules and Compliance — the three tabs that
 * apply across every channel.
 *
 * Variables is scoped by channel: a variable belongs to the channels listed in
 * its own set, so the sub-tab splits them into the ones specific to that
 * channel and the ones it shares. Snippets are shared everywhere.
 */

import { useState } from "react";
import { CHANNEL } from "@/lib/app/channels";
import {
  AUDIENCE_RULES,
  CONSENT,
  DNC_COUNT,
  GUARDRAILS,
  HOLIDAY_COUNTRIES,
  REGIONAL_RULES,
  RETENTION_OPTIONS,
  SENDING_RULES,
  SNIPPETS,
  STOP_RULES,
  SUPPRESSED_DOMAINS,
  VARIABLES,
  VARIABLE_CHANNELS,
  WEEK,
  type Variable,
} from "@/lib/app/configuration";
import type { ChannelKey } from "@/lib/app/channels";
import { Segmented, Switch } from "../ui";
import { Glyph } from "../icons";
import { DemoNote, Panel, Row, Stepper, ToggleRowView, useToggles } from "./parts";

/* ========== Variables ==================================================== */

export function VariablesTab() {
  const [channel, setChannel] = useState<ChannelKey>("li");
  const name = CHANNEL[channel].name;
  const own = VARIABLES.filter((v) => v.channels.length === 1 && v.channels[0] === channel);
  const shared = VARIABLES.filter((v) => v.channels.length > 1 && v.channels.includes(channel));

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
          <button type="button" className="btn sm line">
            Add variable
          </button>
        }
      >
        <VariableTable variables={own} empty={`No variables specific to ${name} yet.`} />
      </Panel>

      <Panel
        title="Shared with other channels"
        sub="Also usable on this channel, plus every channel listed in each variable's own set"
      >
        <VariableTable variables={shared} empty="Nothing shared with this channel yet." />
      </Panel>

      <Panel
        title="Snippets"
        sub="Reusable text, shared across every channel. Write {{booking_link}} and it updates everywhere when you change it here."
        action={
          <button type="button" className="btn sm line">
            Add snippet
          </button>
        }
      >
        {SNIPPETS.map((s) => (
          <div className="cf-vrow snip" key={s.token}>
            <span className="mono">{s.token}</span>
            <textarea className="ta" defaultValue={s.body} rows={s.body.includes("\n") ? 3 : 1} aria-label={s.token} />
          </div>
        ))}
      </Panel>

      <DemoNote what="variables" />
    </div>
  );
}

function VariableTable({ variables, empty }: { variables: Variable[]; empty: string }) {
  if (!variables.length) return <p className="cf-nocontent">{empty}</p>;
  return (
    <>
      <div className="cf-vrow head">
        <span>Variable</span>
        <span>Comes from</span>
        <span>Fallback</span>
        <span />
      </div>
      {variables.map((v) => (
        <div className="cf-vrow" key={v.token}>
          <span className="mono">{v.token}</span>
          <span className="muted">{v.from}</span>
          <input
            className={"inp" + (v.fallback ? "" : " warnin")}
            defaultValue={v.fallback ?? ""}
            placeholder="No fallback"
            aria-label={`Fallback for ${v.token}`}
          />
          {v.fallback ? <span /> : <span className="cf-bad">Blank if missing</span>}
        </div>
      ))}
    </>
  );
}

/* ========== Sending rules ================================================ */

export function SendingRulesTab() {
  const stops = useToggles(STOP_RULES);
  const audience = useToggles(AUDIENCE_RULES);
  const [days, setDays] = useState<string[]>([...SENDING_RULES.days]);
  const [zone, setZone] = useState(SENDING_RULES.timezone);
  const [holidays, setHolidays] = useState<string[]>([...SENDING_RULES.holidays]);
  const [perDay, setPerDay] = useState(SENDING_RULES.perDay);
  const [perWeek, setPerWeek] = useState(SENDING_RULES.perWeek);
  const [limitOn, setLimitOn] = useState(true);
  const [cooloff, setCooloff] = useState(SENDING_RULES.cooloff);
  const [bounce, setBounce] = useState(GUARDRAILS.bounceRate);
  const [acceptance, setAcceptance] = useState(GUARDRAILS.acceptance);
  const [slowWa, setSlowWa] = useState(GUARDRAILS.slowWhatsApp);

  const pick = (list: string[], set: (next: string[]) => void) => (value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <div className="cf-stack">
      <Panel title="Sending window" sub="Nothing sends outside these hours, on any channel">
        <Row label="Days">
          <div className="days">
            {WEEK.map((d) => (
              <button
                type="button"
                key={d}
                className={days.includes(d) ? "on" : ""}
                aria-pressed={days.includes(d)}
                onClick={() => pick(days, setDays)(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Hours">
          <span className="row" style={{ gap: 8 }}>
            <input className="inp cf-in sm" type="time" defaultValue={SENDING_RULES.from} aria-label="From" />
            <span className="muted">to</span>
            <input className="inp cf-in sm" type="time" defaultValue={SENDING_RULES.to} aria-label="To" />
          </span>
        </Row>
        <Row label="Time zone">
          <Segmented
            value={zone}
            onChange={setZone}
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
                className={holidays.includes(c) ? "on" : ""}
                aria-pressed={holidays.includes(c)}
                onClick={() => pick(holidays, setHolidays)(c)}
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
          <Switch on={limitOn} label="Limit how often a lead is contacted" onChange={setLimitOn} />
        </Row>
        {limitOn && (
          <>
            <Row label="Per day">
              <Stepper value={perDay} min={1} max={10} onChange={setPerDay} />
            </Row>
            <Row label="Per week">
              <Stepper value={perWeek} min={1} max={30} onChange={setPerWeek} />
            </Row>
          </>
        )}
      </Panel>

      <Panel title="Stop rules" sub="When a campaign stops for a lead">
        {STOP_RULES.map((r) => (
          <ToggleRowView key={r.id} {...r} on={stops.on[r.id]} onChange={stops.toggle} />
        ))}
      </Panel>

      <Panel
        title="Auto-pause guardrails"
        sub="Sending pauses and you get an alert before reputation takes a hit"
      >
        <Row label="Email bounce rate above">
          <span className="row" style={{ gap: 8 }}>
            <Stepper value={bounce} min={1} max={20} onChange={setBounce} />
            <span className="muted">% · pauses the mailbox</span>
          </span>
        </Row>
        <Row label="Spam complaints above">
          <span className="num">{GUARDRAILS.spamComplaints}</span>
        </Row>
        <Row label="LinkedIn acceptance below">
          <span className="row" style={{ gap: 8 }}>
            <Stepper value={acceptance} min={5} max={60} onChange={setAcceptance} />
            <span className="muted">% for 3 days · pauses invites</span>
          </span>
        </Row>
        <Row
          label="Slow WhatsApp when quality drops to Medium"
          hint="Halves new conversations until quality recovers"
        >
          <Switch on={slowWa} label="Slow WhatsApp on Medium quality" onChange={setSlowWa} />
        </Row>
      </Panel>

      <Panel title="Who gets contacted">
        {AUDIENCE_RULES.map((r) => (
          <ToggleRowView key={r.id} {...r} on={audience.on[r.id]} onChange={audience.toggle} />
        ))}
        <Row label="Wait before contacting a lead again">
          <span className="row" style={{ gap: 8 }}>
            <Stepper value={cooloff} max={365} step={30} onChange={setCooloff} />
            <span className="muted">days after a campaign ends</span>
          </span>
        </Row>
      </Panel>

      <DemoNote what="limits" />
    </div>
  );
}

/* ========== Compliance =================================================== */

export function ComplianceTab() {
  const regional = useToggles(REGIONAL_RULES);
  const [domains, setDomains] = useState(SUPPRESSED_DOMAINS);
  const [draft, setDraft] = useState("");
  const [consent, setConsent] = useState(() =>
    Object.fromEntries(CONSENT.map((c) => [c.k, c.chosen ?? 0])),
  );
  const [retention, setRetention] = useState(RETENTION_OPTIONS[1]);

  return (
    <div className="cf-stack">
      <div className="grid2 cf-g2">
        <section className="card cf-card">
          <div className="card-h">
            <div>
              <h3>Do-not-contact list</h3>
            </div>
            <button type="button" className="btn sm line">
              Upload CSV
            </button>
          </div>
          <div className="cf-body">
            <div className="cf-big">
              <b className="num">{DNC_COUNT.toLocaleString("en-US")}</b>
              <span className="muted">emails and numbers never contacted, on any channel</span>
            </div>
            <small className="muted">
              Opt-outs and &ldquo;Do not call&rdquo; outcomes are added here automatically.
            </small>
          </div>
        </section>

        <Panel title="Suppressed domains" sub="Competitors, partners and your own company">
          <div className="cf-chips">
            {domains.map((d) => (
              <span className="tag" key={d}>
                {d}
                <button
                  type="button"
                  aria-label={`Remove ${d}`}
                  onClick={() => setDomains((list) => list.filter((x) => x !== d))}
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
                if (e.key === "Enter" && draft.trim()) {
                  setDomains((list) => Array.from(new Set([...list, draft.trim()])));
                  setDraft("");
                }
              }}
            />
          </div>
        </Panel>
      </div>

      <Panel title="Consent by channel">
        {CONSENT.map((c) => {
          const channel = CHANNEL[c.k];
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
                  value={String(consent[c.k])}
                  onChange={(v) => setConsent((s) => ({ ...s, [c.k]: Number(v) }))}
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
          <ToggleRowView key={r.id} {...r} on={regional.on[r.id]} onChange={regional.toggle} />
        ))}
      </Panel>

      <Panel title="Data retention">
        <Row label="Delete inactive lead data after">
          <select
            className="sel cf-in"
            aria-label="Delete inactive lead data after"
            value={retention}
            onChange={(e) => setRetention(e.target.value)}
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

      <DemoNote what="counts" />
    </div>
  );
}
