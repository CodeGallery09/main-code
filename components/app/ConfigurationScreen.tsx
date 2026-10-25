"use client";

/**
 * Setup: everything a workspace sets up once, so campaigns can run.
 *
 * One screen, six tabs. It used to be three rail destinations — Configuration, Integrations and
 * Settings — all answering "what is connected and how does sending behave", with Integrations
 * drawing its own tab strip across the three to admit as much. Settings held no controls at all,
 * only read-only copies of this screen. Connections and Workspace are those two screens, as tabs.
 *
 * LinkedIn accounts and mailboxes belong to the **workspace**, not to a campaign: connect one and
 * any number of campaigns can send from it. This screen therefore has no campaign scope. It loads
 * the workspace's accounts and campaigns, derives the setup checks from them, and hands each tab
 * what it needs.
 *
 * Account dials (daily caps, rotation) and which campaigns use an account are saved. The rule
 * switches on the Rules tab are not enforced yet, and say so.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Screen } from "./AppShell";
import { Tabs } from "./ui";
import { api } from "@/lib/api";
import { CONFIG_TABS, type ConfigTab } from "@/lib/app/configuration";
import { setupChecks, tabIssues } from "@/lib/data/setup";
import type { AccountActivity, AccountsSnapshot, Campaign } from "@/lib/data/types";
import { Overview } from "./configuration/Overview";
import { Connections } from "./configuration/Connections";
import { Workspace } from "./configuration/Workspace";
import { EmailTab, LinkedInTab } from "./configuration/ChannelTabs";
import { ComplianceTab, SendingRulesTab, VariablesTab } from "./configuration/RuleTabs";

const EMPTY: AccountsSnapshot = { accounts: [], domains: [] };

/** Tabs that read the workspace's accounts; the others load their own data or have none. */
const NEEDS_ACCOUNTS: ConfigTab[] = ["overview", "li", "mail"];

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
      setError(caught instanceof Error ? caught.message : "Could not load your setup.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The hosted LinkedIn sign-in returns to this screen with `?connected=` or `?failed=`. The tab
  // that knows what to do with it is Connections, so open it — it reads and clears the query
  // itself once mounted.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("connected") || params.has("failed")) setTab("connections");
  }, []);

  const checks = useMemo(() => setupChecks(snapshot), [snapshot]);
  const issues = useMemo(() => tabIssues(checks), [checks]);

  return (
    <Screen title="Setup">
      <div className="cf-main">
        <div className="cf-head between">
          <Tabs<ConfigTab>
            value={tab}
            onChange={setTab}
            items={CONFIG_TABS.map(([k, label]) => [
              k,
              label,
              k in issues ? (issues as Record<string, number>)[k] : null,
            ])}
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

        {loading && NEEDS_ACCOUNTS.includes(tab) ? (
          <p className="empty">Loading your setup…</p>
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
            {tab === "connections" && <Connections linkedInConfigured={linkedInConfigured} go={setTab} />}
            {/* Three groups of switches over one subject: personalisation, when sending happens,
                and what must never be sent. They were three tabs. */}
            {tab === "rules" && (
              <>
                <VariablesTab />
                <SendingRulesTab />
                <ComplianceTab />
              </>
            )}
            {tab === "workspace" && <Workspace />}
          </>
        )}
      </div>
    </Screen>
  );
}
