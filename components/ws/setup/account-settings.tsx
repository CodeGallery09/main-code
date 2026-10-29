"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { AccountSettingsPatch } from "@/lib/data/validate";
import type { ChannelAccount } from "@/lib/data/types";
import { Button } from "@/components/ws/ui/button";
import { Switch } from "@/components/ws/ui/misc";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The dials on one account: daily ceilings, and for a mailbox whether it joins
 * the rotation. Identity, health and connection state are facts the provider
 * reports, so they are read-only here and the server refuses them anyway.
 */
export function AccountSettings({ account, onSaved }: { account: ChannelAccount; onSaved: () => void }) {
  const [values, setValues] = useState<AccountSettingsPatch>(() =>
    account.channel === "linkedin"
      ? {
          connections: account.settings.connections,
          messages: account.settings.messages,
          visits: account.settings.visits,
          hours: { ...account.settings.hours, days: [...account.settings.hours.days] },
          warmup: account.settings.warmup,
        }
      : { cap: account.settings.cap, rotate: account.settings.rotate },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api.updateAccount(account.id, values);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Those limits could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-[13px] flex flex-col gap-3 rounded-[10px] border border-border bg-chrome px-[14px] py-3">
      <span className="label-mono">Daily limits</span>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {account.channel === "linkedin" ? (
          <>
            <Number
              id={`${account.id}-connections`}
              label="Connection requests"
              value={values.connections ?? 0}
              onChange={(v) => setValues((s) => ({ ...s, connections: v }))}
            />
            <Number
              id={`${account.id}-messages`}
              label="Messages"
              value={values.messages ?? 0}
              onChange={(v) => setValues((s) => ({ ...s, messages: v }))}
            />
            <Number
              id={`${account.id}-visits`}
              label="Profile visits"
              value={values.visits ?? 0}
              onChange={(v) => setValues((s) => ({ ...s, visits: v }))}
            />
          </>
        ) : (
          <>
            <Number
              id={`${account.id}-cap`}
              label="Emails per day"
              value={values.cap ?? 0}
              onChange={(v) => setValues((s) => ({ ...s, cap: v }))}
            />
            <div className="flex items-center justify-between gap-3 rounded-lg border border-input bg-card px-[11px] py-[7px]">
              <span className="text-[11.5px] font-medium">Share the load with other mailboxes</span>
              <Switch
                checked={values.rotate ?? false}
                onChange={(v) => setValues((s) => ({ ...s, rotate: v }))}
                label="Share the load with other mailboxes"
              />
            </div>
          </>
        )}
      </div>

      <p className="text-[11.5px] leading-[1.55] text-muted-foreground">
        Limits belong to the account and are shared by every strategy that sends from it. When a limit is reached the plan does not skip anyone — the rest of
        the queue waits for the next working morning.
      </p>

      {account.channel === "linkedin" && values.hours ? (
        <>
          <span className="label-mono">Working hours</span>
          <div className="flex flex-wrap gap-[5px]">
            {WEEKDAYS.map((day) => {
              const on = values.hours!.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setValues((state) => {
                      const days = state.hours!.days.includes(day)
                        ? state.hours!.days.filter((d) => d !== day)
                        : [...state.hours!.days, day];
                      return { ...state, hours: { ...state.hours!, days: WEEKDAYS.filter((d) => days.includes(d)) } };
                    })
                  }
                  className={`h-[28px] rounded-lg border px-[10px] text-[11.5px] ${
                    on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <Clock
              id={`${account.id}-from`}
              label="Starts"
              value={values.hours.from}
              onChange={(v) => setValues((state) => ({ ...state, hours: { ...state.hours!, from: v } }))}
            />
            <Clock
              id={`${account.id}-to`}
              label="Stops"
              value={values.hours.to}
              onChange={(v) => setValues((state) => ({ ...state, hours: { ...state.hours!, to: v } }))}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-input bg-card px-[11px] py-[7px]">
            <span className="min-w-0 text-[11.5px] font-medium">
              Ease a new account in over two weeks
              <span className="block text-[11px] font-normal text-muted-foreground">
                Starts at a fifth of these limits and climbs. A fresh account sending its ceiling on day one is what gets a seat restricted.
              </span>
            </span>
            <Switch
              checked={values.warmup ?? true}
              onChange={(v) => setValues((state) => ({ ...state, warmup: v }))}
              label="Ease a new account in over two weeks"
            />
          </div>
          <p className="text-[11.5px] leading-[1.55] text-muted-foreground">
            Touches are spread across these hours with an uneven gap rather than sent in a burst, in{" "}
            {account.settings.hours.zone || "your workspace's time zone"}.
          </p>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-[11.5px] text-warning">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save these settings"}
        </Button>
      </div>
    </div>
  );
}

function Clock({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-[5px]">
      <label htmlFor={id} className="label-mono">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[34px] rounded-lg border border-input bg-card px-[11px] font-mono text-[12px]"
      />
    </div>
  );
}

function Number({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <label htmlFor={id} className="label-mono">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.floor(e.target.valueAsNumber || 0)))}
        className="h-[34px] rounded-lg border border-input bg-card px-[11px] font-mono text-[12px]"
      />
    </div>
  );
}
