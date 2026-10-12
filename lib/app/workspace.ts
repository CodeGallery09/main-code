/**
 * Workspace-level demo state: who is signed in, channel connections and the
 * sending caps the dashboard reports against.
 */

import type { ChannelKey } from "./channels";

export const WORKSPACE = { name: "Acme Growth", user: "Aarav Kapoor" };

export type ChannelSetting = {
  k: ChannelKey;
  /** Account or number the channel sends from. */
  via: string;
  status: { label: string; tone: string };
  /** Daily sending cap. */
  cap: number;
  on: boolean;
};

export const CHANNEL_SETTINGS: ChannelSetting[] = [
  { k: "li", via: "Aarav Kapoor", status: { label: "Healthy", tone: "pos" }, cap: 25, on: true },
  { k: "mail", via: "aarav@acme.co · sales@acme.co", status: { label: "Warming 1/2", tone: "hl" }, cap: 200, on: true },
  { k: "wa", via: "+91 80 4567 1200 · Business API", status: { label: "Connected", tone: "pos" }, cap: 120, on: true },
  { k: "call", via: "Tasks to your phone", status: { label: "Ready", tone: "pos" }, cap: 12, on: true },
  { k: "sms", via: "+1 415 555 0100", status: { label: "Connected", tone: "pos" }, cap: 100, on: true },
];

/** How much of today's cap each channel has used. */
export const SENDING_TODAY: { k: ChannelKey; used: number; cap: number }[] = [
  { k: "li", used: 52, cap: 105 },
  { k: "mail", used: 142, cap: 200 },
  { k: "wa", used: 36, cap: 120 },
  { k: "sms", used: 12, cap: 100 },
];

export const SETTINGS_SECTIONS = [
  ["channels", "Channels"],
  ["sending", "Sending"],
  ["team", "Team"],
  ["plan", "Plan"],
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number][0];

/** Sending window the workspace runs on. */
export const SENDING_WINDOW = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  from: "09:00",
  to: "18:00",
  timezone: "Asia/Kolkata",
  skipOther: true,
};

export const TEAM = [
  { initials: "AK", name: "Aarav Kapoor", email: "aarav@acme.co", role: "Owner", share: 0.42, respondsIn: "1.8h" },
  { initials: "NS", name: "Neha Sharma", email: "neha@acme.co", role: "Member", share: 0.35, respondsIn: "3.1h" },
  { initials: "RV", name: "Ravi Verma", email: "ravi@acme.co", role: "Member", share: 0.23, respondsIn: "6.2h" },
];

export const PLAN = {
  name: "Growth",
  seats: 3,
  seatCap: 5,
  leads: 1284,
  leadCap: 2500,
  renews: "12 Nov",
};

/** Sending domains and their DNS state. */
export const DOMAINS = [
  { host: "acme.co", ok: true, note: "SPF · DKIM · DMARC verified" },
  { host: "getacme.io", ok: true, note: "SPF · DKIM verified" },
  { host: "acmehq.com", ok: false, note: "DNS records pending" },
];
