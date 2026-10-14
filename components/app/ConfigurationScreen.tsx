"use client";

/**
 * The Configuration screen: everything a workspace sets up once, so campaigns
 * can run. Nine tabs — an overview of what is broken, one per channel, then the
 * variables, sending rules and compliance that apply across all of them.
 *
 * It wears the marketing site's akkari-style skin rather than the workspace's
 * cream one: the `.cfg` scope at the end of `app/app.css` flips the tokens on
 * this column only (#FAFAF8 page, near-black ink, the mono display face), so
 * the screen reads like the home page while the rail keeps the shared chrome.
 *
 * Edits live in component state for the length of the visit; there is no
 * configuration store behind it yet, and every tab says so.
 */

import { useState } from "react";
import { Screen } from "./AppShell";
import { Tabs } from "./ui";
import { CheckIcon } from "./icons";
import { CONFIG_TABS, TAB_ISSUES, type ConfigTab } from "@/lib/app/configuration";
import { Overview } from "./configuration/Overview";
import { CallsTab, EmailTab, LinkedInTab, SmsTab, WhatsAppTab } from "./configuration/ChannelTabs";
import { ComplianceTab, SendingRulesTab, VariablesTab } from "./configuration/RuleTabs";

export function ConfigurationScreen() {
  const [tab, setTab] = useState<ConfigTab>("overview");

  return (
    <Screen title="Configuration" className="cfg">
      <div className="cf-main">
        <div className="cf-head between">
          <Tabs<ConfigTab>
            value={tab}
            onChange={setTab}
            items={CONFIG_TABS.map(([k, label]) => [k, label, TAB_ISSUES[k] ?? null])}
          />
          <span className="cf-saved on">
            <CheckIcon />
            Changes last for this visit
          </span>
        </div>

        {tab === "overview" && <Overview go={setTab} />}
        {tab === "li" && <LinkedInTab />}
        {tab === "mail" && <EmailTab />}
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
