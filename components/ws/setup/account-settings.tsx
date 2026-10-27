"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { AccountSettingsPatch } from "@/lib/data/validate";
import type { ChannelAccount } from "@/lib/data/types";
import { Button } from "@/components/ws/ui/button";
import { Switch } from "@/components/ws/ui/misc";

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
        Limits belong to the account and are shared by every strategy that sends from it. Nothing sends yet, so these
        are the ceilings that will apply the day it does.
      </p>

      {error ? (
        <p role="alert" className="text-[11.5px] text-warning">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save the limits"}
        </Button>
      </div>
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
