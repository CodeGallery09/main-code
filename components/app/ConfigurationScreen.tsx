"use client";

/**
 * The Configuration screen: everything a workspace sets up once, so campaigns can run.
 *
 * LinkedIn accounts and mailboxes belong to the **workspace**, not to a campaign: connect one and
 * any number of campaigns can send from it. This screen therefore has no campaign scope. It loads
 * the workspace's accounts and campaigns, derives the setup checks from them, and hands each tab
 * what it needs.
 *
 * Account dials (daily caps, rotation) and which campaigns use an account are saved. The rule
 * switches on the other tabs are not stored yet, and say so.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Screen } from "./AppShell";
import { Tabs } from "./ui";
import { SampleBanner } from "./SampleBanner";
import { api } from "@/lib/api";
import { CONFIG_TABS, type ConfigTab } from "@/lib/app/configuration";
import { setupChecks, tabIssues } from "@/lib/data/setup";
import type { AccountActivity, AccountsSnapshot, Campaign } from "@/lib/data/types";
import { Overview } from "./configuration/Overview";
import { CallsTab, EmailTab, LinkedInTab, SmsTab, WhatsAppTab } from "./configuration/ChannelTabs";
import { ComplianceTab, SendingRulesTab, VariablesTab } from "./configuration/RuleTabs";

const EMPTY: AccountsSnapshot = { accounts: [], domains: [] };

export function ConfigurationScreen({ linkedInConfigured = false }: { linkedInConfigured?: boolean }) {
  const [tab, setTab] = useState<ConfigTab>("overview");
  const [snapshot, setSnapshot] = useState<AccountsSnapshot>(EMPTY);
  const [activity, setActivity] = useState<AccountActivity[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [accounts, list, counts] = await Promise.all([
        api.accounts(),
        api.campaigns(),
        // Activity is a nice-to-have on this screen: a failure there must not blank the tabs.
        api.accountActivity(30).catch(() => ({ activity: [] })),
      ]);
      setSnapshot(accounts);
      setCampaigns(list.items);
      setActivity(counts.activity);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checks = useMemo(() => setupChecks(snapshot), [snapshot]);
  const issues = useMemo(() => tabIssues(checks), [checks]);

  return (
    <Screen title="Configuration">
      <div className="cf-main">
        <SampleBanner onRemoved={() => void load()} />

        <div className="cf-head between">
          <Tabs<ConfigTab>
            value={tab}
            onChange={setTab}
            items={CONFIG_TABS.map(([k, label]) => [k, label, k in issues ? (issues as Record<string, number>)[k] : null])}
          />
        </div>

        {error && (
          <p className="empty" role="status">
            {error}{" "}
            <button className="sortb" onClick={() => void load()}>
              Retry
            </button>
          </p>
        )}

        {loading ? (
          <p className="empty">Loading your configuration…</p>
        ) : (
          <>
            {tab === "overview" && <Overview go={setTab} checks={checks} snapshot={snapshot} />}
            {tab === "li" && (
              <LinkedInTab
                snapshot={snapshot}
                campaigns={campaigns}
                onChange={load}
                activity={activity}
                linkedInConfigured={linkedInConfigured}
              />
            )}
            {tab === "mail" && <EmailTab snapshot={snapshot} campaigns={campaigns} onChange={load} />}
            {tab === "wa" && <WhatsAppTab />}
            {tab === "call" && <CallsTab />}
            {tab === "sms" && <SmsTab />}
            {tab === "variables" && <VariablesTab />}
            {tab === "sending" && <SendingRulesTab />}
            {tab === "compliance" && <ComplianceTab />}
          </>
        )}
      </div>
    </Screen>
  );
}
