"use client";

/**
 * The Configuration screen: everything a workspace sets up once, so campaigns
 * can run. Nine tabs — an overview of what is broken, one per channel, then the
 * variables, sending rules and compliance that apply across all of them.
 *
 * Edits live in component state for the length of the visit; there is no
 * configuration store behind it yet, and every tab says so.
 */

import { useState } from "react";
import Link from "next/link";
import { Screen } from "./AppShell";
import { Tabs } from "./ui";
import { CheckIcon } from "./icons";
import { CONFIG_TABS, TAB_ISSUES, type ConfigTab } from "@/lib/app/configuration";
import { CAMPAIGNS } from "@/lib/app/campaigns";
import { Overview } from "./configuration/Overview";
import { CallsTab, EmailTab, LinkedInTab, SmsTab, WhatsAppTab } from "./configuration/ChannelTabs";
import { ComplianceTab, SendingRulesTab, VariablesTab } from "./configuration/RuleTabs";

export function ConfigurationScreen() {
  const [tab, setTab] = useState<ConfigTab>("overview");
  const [scope, setScope] = useState<number | "all">("all");
  const scopedCampaign = scope === "all" ? null : CAMPAIGNS.find((c) => c.id === scope) ?? null;

  return (
    <Screen title="Configuration">
      <div className="cf-main">
        <div className="cf-head between">
          <Tabs<ConfigTab>
            value={tab}
            onChange={setTab}
            items={CONFIG_TABS.map(([k, label]) => [k, label, TAB_ISSUES[k] ?? null])}
          />
          <span className="row" style={{ gap: 10 }}>
            <select
              className="sel pill"
              aria-label="Scope settings to a campaign"
              value={scope}
              onChange={(e) => setScope(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">All campaigns</option>
              {CAMPAIGNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {scopedCampaign?.type === "multi" && (
              <Link className="btn sm" href={`/dashboard/workflows/${scopedCampaign.id}`}>
                Open workflow
              </Link>
            )}
            <span className="cf-saved on">
              <CheckIcon />
              Changes last for this visit
            </span>
          </span>
        </div>

        {scopedCampaign && (
          <p className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>
            Showing LinkedIn and email account assignment for <b>{scopedCampaign.name}</b>. Sending rules,
            variables and compliance apply workspace-wide, whichever campaign is selected.
          </p>
        )}

        {tab === "overview" && <Overview go={setTab} />}
        {tab === "li" && <LinkedInTab scopeCampaignId={scope === "all" ? null : scope} />}
        {tab === "mail" && <EmailTab scopeCampaignId={scope === "all" ? null : scope} />}
        {tab === "wa" && <WhatsAppTab />}
        {tab === "call" && <CallsTab />}
        {tab === "sms" && <SmsTab />}
        {tab === "variables" && <VariablesTab />}
        {tab === "sending" && <SendingRulesTab />}
        {tab === "compliance" && <ComplianceTab />}
      </div>
    </Screen>
  );
}
