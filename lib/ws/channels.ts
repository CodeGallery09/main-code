import type { Channel } from "@/lib/data/types";

/**
 * How each channel is written and coloured in the workspace.
 *
 * The colours are the vendor brand colours darkened until white text on the
 * tile clears 4.5:1 — they live in app/workspace.css as --ch-*. A tile is
 * decoration: the channel name is always next to it, so colour never carries
 * the meaning alone.
 */
export const CHANNEL_NAME: Record<Channel, string> = {
  linkedin: "LinkedIn",
  email: "Email",
  whatsapp: "WhatsApp",
  call: "Calls",
  sms: "SMS",
};

/** Monogram shown on a tile until each vendor's official partner SVG replaces it. */
export const CHANNEL_MONO: Record<Channel, string> = {
  linkedin: "in",
  email: "@",
  whatsapp: "wa",
  call: "☎",
  sms: "sms",
};

export const CHANNEL_COLOR: Record<Channel, string> = {
  linkedin: "var(--ch-linkedin)",
  email: "var(--ch-email)",
  whatsapp: "var(--ch-whatsapp)",
  call: "var(--ch-calls)",
  sms: "var(--ch-sms)",
};

/** Display order wherever every channel is listed. */
export const CHANNEL_ORDER: Channel[] = ["linkedin", "email", "whatsapp", "call", "sms"];

export const channelNames = (channels: Channel[]) => channels.map((c) => CHANNEL_NAME[c]).join(" · ");
