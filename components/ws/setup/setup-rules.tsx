"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { api } from "@/lib/api";
import {
  AUDIENCE_RULES,
  CONSENT,
  HOLIDAY_COUNTRIES,
  REGIONAL_RULES,
  RETENTION_OPTIONS,
  STOP_RULES,
  VARIABLES,
  WEEK,
  type ToggleRow,
} from "@/lib/app/configuration";
import { CHANNEL_NAME } from "@/lib/ws/channels";
import type { Channel, Workspace, WorkspaceSettings } from "@/lib/data/types";
import type { SettingsPatch } from "@/lib/data/repository";
import { cn, fmt } from "@/lib/ws/utils";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ws/ui/card";
import { Button } from "@/components/ws/ui/button";
import { Confirm } from "@/components/ws/ui/confirm";
import { Segmented } from "@/components/ws/ui/segmented";
import { LoadError, NativeSelect, Skeleton, Switch, Tag } from "@/components/ws/ui/misc";
import { Appear } from "@/components/ws/ui/motion";

/**
 * Setup · Config — the rules a workspace can set, and the workspace itself.
 *
 * These persist (`/api/settings` → `workspace_settings`), so the screen says
 * they are saved and says plainly that nothing enforces them yet: there is no
 * sender. Every label and hint still comes from the catalogue in
 * `lib/app/configuration.ts` — this file owns no copy about a rule's meaning.
 */

/** `li`-style keys the consent table uses, mapped to the domain channel for its display name. */
const CONSENT_CHANNEL: Record<string, Channel> = {
  li: "linkedin",
  mail: "email",
  wa: "whatsapp",
  call: "call",
  sms: "sms",
};

type Save = "idle" | "pending" | "saving" | "saved" | "failed";

const SAVE_LABEL: Record<Save, string> = {
  idle: "",
  pending: "unsaved changes",
  saving: "saving…",
  saved: "saved",
  failed: "not saved — change it again to retry",
};

/**
 * One copy of the stored settings, edited locally and pushed as a patch 600 ms
 * after the last edit. Only the sections actually touched are sent, so two
 * cards editing different sections never overwrite each other.
 */
function useSettings() {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [save, setSave] = useState<Save>("idle");
  const pending = useRef<SettingsPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(() => {
    setFailed(false);
    api
      .getSettings()
      .then(({ settings: s }) => setSettings(s))
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  const flush = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    setSave("saving");
    try {
      const { settings: s } = await api.updateSettings(patch);
      setSettings(s);
      setSave("saved");
    } catch {
      setSave("failed");
    }
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  /** Edit one section: the local copy changes now, the patch goes out shortly. */
  const edit = useCallback(
    <K extends keyof WorkspaceSettings>(section: K, next: Partial<WorkspaceSettings[K]>) => {
      setSettings((current) => {
        if (!current) return current;
        const merged = { ...current[section], ...next } as WorkspaceSettings[K];
        pending.current = { ...pending.current, [section]: { ...pending.current[section], ...next } };
        return { ...current, [section]: merged };
      });
      setSave("pending");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 600);
    },
    [flush],
  );

  return { settings, failed, save, edit, reload: load };
}

export function RulesCards({ workspace, index = 0 }: { workspace: Workspace; index?: number }) {
  const { settings, failed, save, edit, reload } = useSettings();

  if (failed) {
    return (
      <Card>
        <LoadError message="We couldn't read your rules." onRetry={reload} />
      </Card>
    );
  }
  if (!settings) return <Skeleton className="h-[260px] rounded-xl" />;

  const rules = settings.sendingRules;
  const compliance = settings.compliance;

  return (
    <>
      <Appear index={index}>
        <Card>
          <CardHeader>
            <span className="flex basis-full flex-col gap-[4px]">
              <span className="flex flex-wrap items-baseline justify-between gap-[10px]">
                <CardTitle>Sending rules</CardTitle>
                <SaveNote save={save} />
              </span>
              <CardDescription>
                Saved against this workspace. Nothing enforces them yet, because nothing sends — they take effect
                with the first sender.
              </CardDescription>
            </span>
          </CardHeader>

          <Field label="Days" hint="Touches only go out on these days.">
            <span className="flex flex-wrap gap-[6px]">
              {WEEK.map((day) => {
                const on = rules.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      edit("sendingRules", {
                        days: on ? rules.days.filter((d) => d !== day) : [...rules.days, day],
                      })
                    }
                    className={cn(
                      "rounded-full border px-[11px] py-[5px] font-mono text-[11px] transition-colors duration-150",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-card text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </span>
          </Field>

          <Field label="Hours" hint="A touch due outside this window waits for the next one.">
            <span className="flex flex-wrap items-center gap-[8px]">
              <TimeInput
                id="rules-from"
                label="From"
                value={rules.from}
                onChange={(from) => edit("sendingRules", { from })}
              />
              <TimeInput id="rules-to" label="To" value={rules.to} onChange={(to) => edit("sendingRules", { to })} />
              <Segmented
                size="sm"
                label="Which time zone the window is read in"
                value={rules.timezone}
                onChange={(timezone) => edit("sendingRules", { timezone })}
                options={[
                  { value: "audience", label: "Their time" },
                  { value: "workspace", label: "Our time" },
                ]}
              />
            </span>
          </Field>

          <Field label="Holidays" hint="Public holidays in these countries are skipped.">
            <span className="flex flex-wrap gap-[6px]">
              {HOLIDAY_COUNTRIES.map((country) => {
                const on = rules.holidays.includes(country);
                return (
                  <button
                    key={country}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      edit("sendingRules", {
                        holidays: on ? rules.holidays.filter((c) => c !== country) : [...rules.holidays, country],
                      })
                    }
                    className={cn(
                      "rounded-full border px-[11px] py-[5px] text-[12px] transition-colors duration-150",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-card text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {country}
                  </button>
                );
              })}
            </span>
          </Field>

          <Field label="How much" hint="Per audience, across every channel.">
            <span className="flex flex-wrap items-center gap-[10px]">
              <Switch
                checked={rules.limitOn}
                onChange={(limitOn) => edit("sendingRules", { limitOn })}
                label="Limit how often one person is contacted"
              />
              <NumberInput
                id="rules-per-day"
                label="A day"
                value={rules.perDay}
                min={1}
                max={20}
                disabled={!rules.limitOn}
                onChange={(perDay) => edit("sendingRules", { perDay })}
              />
              <NumberInput
                id="rules-per-week"
                label="A week"
                value={rules.perWeek}
                min={1}
                max={50}
                disabled={!rules.limitOn}
                onChange={(perWeek) => edit("sendingRules", { perWeek })}
              />
              <NumberInput
                id="rules-cooloff"
                label="Days before re-contact"
                value={rules.cooloff}
                min={0}
                max={365}
                disabled={!rules.limitOn}
                onChange={(cooloff) => edit("sendingRules", { cooloff })}
              />
            </span>
          </Field>
        </Card>
      </Appear>

      <Appear index={index + 1}>
        <Card>
          <CardHeader>
            <span className="flex basis-full flex-col gap-[4px]">
              <CardTitle>When a sequence stops</CardTitle>
              <CardDescription>A locked rule is one the product keeps on.</CardDescription>
            </span>
          </CardHeader>
          {STOP_RULES.map((rule) => (
            <ToggleLine
              key={rule.id}
              rule={rule}
              checked={rules.stops[rule.id] ?? rule.on}
              onChange={(on) => edit("sendingRules", { stops: { ...rules.stops, [rule.id]: on } })}
            />
          ))}
          <CardHeader className="border-t border-t-border">
            <CardTitle>Who gets skipped</CardTitle>
          </CardHeader>
          {AUDIENCE_RULES.map((rule) => (
            <ToggleLine
              key={rule.id}
              rule={rule}
              checked={rules.audience[rule.id] ?? rule.on}
              onChange={(on) => edit("sendingRules", { audience: { ...rules.audience, [rule.id]: on } })}
            />
          ))}
        </Card>
      </Appear>

      <Appear index={index + 2}>
        <Card>
          <CardHeader>
            <span className="flex basis-full flex-col gap-[4px]">
              <CardTitle>Variables</CardTitle>
              <CardDescription>
                What a touch says when the audience has no value for a token. Leave one blank and the token renders as
                nothing.
              </CardDescription>
            </span>
          </CardHeader>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-x-8 px-[18px] pb-[14px] pt-[8px]">
            {VARIABLES.map((variable) => (
              <label key={variable.token} className="flex items-center gap-[10px] border-b border-divider py-[11px]">
                <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="font-mono text-[12px] font-medium">{variable.token}</span>
                  <span className="truncate text-[11.5px] text-muted-foreground">from {variable.from}</span>
                </span>
                <input
                  type="text"
                  value={settings.variableFallbacks[variable.token] ?? ""}
                  placeholder="blank"
                  maxLength={60}
                  aria-label={`Fallback for ${variable.token}`}
                  onChange={(e) =>
                    edit("variableFallbacks", { [variable.token]: e.target.value || null } as Record<
                      string,
                      string | null
                    >)
                  }
                  className="h-[30px] w-[130px] shrink-0 rounded-lg border border-input bg-card px-[9px] text-[12.5px]"
                />
              </label>
            ))}
          </div>
          <p className="px-[18px] pb-[14px] text-[12px] text-muted-foreground">
            Adding a new token, snippets and a do-not-contact list are not built yet — there is nowhere to store them.
          </p>
        </Card>
      </Appear>

      <Appear index={index + 3}>
        <Card>
          <CardHeader>
            <span className="flex basis-full flex-col gap-[4px]">
              <CardTitle>Compliance</CardTitle>
              <CardDescription>What you are relying on to contact people, and for how long you keep them.</CardDescription>
            </span>
          </CardHeader>

          {CONSENT.map((basis) => {
            const channel = CONSENT_CHANNEL[basis.k];
            return (
              <div key={basis.k} className="flex items-center gap-3 border-b border-divider px-[18px] py-[11px]">
                <span className="flex-1 text-[13px]">{channel ? CHANNEL_NAME[channel] : basis.k}</span>
                {basis.options.length === 0 ? (
                  <Tag>{basis.fixed}</Tag>
                ) : (
                  <NativeSelect
                    id={`consent-${basis.k}`}
                    label="Basis"
                    hideLabel
                    value={String(compliance.consent[basis.k] ?? basis.chosen ?? 0)}
                    onChange={(v) =>
                      edit("compliance", { consent: { ...compliance.consent, [basis.k]: Number(v) } })
                    }
                    options={basis.options.map((label, i) => ({ value: String(i), label }))}
                  />
                )}
              </div>
            );
          })}

          {REGIONAL_RULES.map((rule) => (
            <ToggleLine
              key={rule.id}
              rule={rule}
              checked={compliance.regional[rule.id] ?? rule.on}
              onChange={(on) => edit("compliance", { regional: { ...compliance.regional, [rule.id]: on } })}
            />
          ))}

          <div className="flex items-center gap-3 px-[18px] py-[13px]">
            <span className="flex-1 text-[13px]">Keep audience data for</span>
            <NativeSelect
              id="retention"
              label="Retention"
              hideLabel
              value={compliance.retention}
              onChange={(retention) =>
                edit("compliance", { retention: retention as (typeof RETENTION_OPTIONS)[number] })
              }
              options={RETENTION_OPTIONS.map((o) => ({ value: o, label: o }))}
            />
          </div>
        </Card>
      </Appear>

      <Appear index={index + 4}>
        <WorkspaceCard workspace={workspace} />
      </Appear>
    </>
  );
}

/** The workspace's own facts, plus the one destructive action on this screen. */
function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState(workspace.sample);

  const hasSample = sample.strategies > 0 || sample.audiences > 0;

  async function remove() {
    setBusy(true);
    try {
      await api.removeSampleData();
      setSample({ strategies: 0, audiences: 0 });
      setRemoving(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <span className="flex basis-full flex-col gap-[4px]">
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Inviting a teammate is not built yet, so a workspace is one person today.</CardDescription>
        </span>
      </CardHeader>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-8 px-[18px] pb-[14px] pt-[10px]">
        <Fact label="Name" value={workspace.name} />
        <Fact label="Plan" value={workspace.plan} />
        <Fact label="Seats" value={`${fmt(workspace.seatsUsed)} of ${fmt(workspace.seats)} used`} />
        <Fact label="Workspace id" value={workspace.id} mono />
      </dl>

      {hasSample && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-[18px] py-[13px]">
          <span className="grow-[999] text-[12.5px] leading-[1.55] text-muted-foreground">
            This workspace still has {fmt(sample.strategies)} sample{" "}
            {sample.strategies === 1 ? "strategy" : "strategies"} and {fmt(sample.audiences)} sample{" "}
            {sample.audiences === 1 ? "audience" : "audiences"}, labelled wherever they appear.
          </span>
          <Button variant="danger" size="sm" onClick={() => setRemoving(true)}>
            Remove sample data
          </Button>
        </div>
      )}

      <Confirm
        open={removing}
        title="Remove the sample data?"
        body="The sample strategy, its workflow and every sample audience are deleted. Nothing you created is touched, and this cannot be undone."
        confirmLabel="Remove it"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(false)}
      />
    </Card>
  );
}

/* ---------- small parts ---------- */

function SaveNote({ save }: { save: Save }) {
  const label = SAVE_LABEL[save];
  if (!label) return null;
  return (
    <span aria-live="polite" className="font-mono text-[10.5px] text-muted-foreground">
      {label}
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-[8px] border-b border-divider px-[18px] py-[13px] last:border-b-0">
      <span className="flex basis-[200px] flex-col gap-[2px]">
        <span className="text-[13px] font-medium">{label}</span>
        {hint && <span className="text-[11.5px] leading-[1.5] text-muted-foreground">{hint}</span>}
      </span>
      <span className="grow-[999] basis-[320px]">{children}</span>
    </div>
  );
}

function ToggleLine({
  rule,
  checked,
  onChange,
}: {
  rule: ToggleRow;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-divider px-[18px] py-[11px] last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="text-[13px]">{rule.label}</span>
        {rule.hint && <span className="text-[11.5px] leading-[1.5] text-muted-foreground">{rule.hint}</span>}
      </span>
      {rule.locked ? (
        <span className="flex shrink-0 items-center gap-[6px] font-mono text-[10.5px] uppercase tracking-[0.07em] text-muted-foreground">
          <Lock aria-hidden size={13} strokeWidth={2} /> Always on
        </span>
      ) : (
        <Switch checked={checked} onChange={onChange} label={rule.label} />
      )}
    </div>
  );
}

function TimeInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <span className="flex items-center gap-[7px]">
      <label htmlFor={id} className="label-mono">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[30px] rounded-lg border border-input bg-card px-[9px] font-mono text-[12.5px]"
      />
    </span>
  );
}

function NumberInput({
  id,
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <span className="flex items-center gap-[7px]">
      <label htmlFor={id} className={cn("label-mono", disabled && "opacity-50")}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next) && next >= min && next <= max) onChange(next);
        }}
        className="h-[30px] w-[64px] rounded-lg border border-input bg-card px-[9px] font-mono text-[12.5px] disabled:opacity-50"
      />
    </span>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-divider py-[11px]">
      <dt className="label-mono">{label}</dt>
      <dd className={cn("truncate text-[13px]", mono && "font-mono text-[12px]")}>{value}</dd>
    </div>
  );
}
