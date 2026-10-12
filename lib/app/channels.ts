/**
 * Channel vocabulary for the signed-in app. Import-free so it can be read from
 * server components, client components and tests alike.
 */

export type ChannelKey = "li" | "mail" | "wa" | "call" | "sms";

export type Channel = {
  k: ChannelKey;
  name: string;
  hex: string;
  soft: string;
  /** Healthy reply-rate band for the channel, in percent. */
  bench: [number, number];
};

export const CHANNELS: Channel[] = [
  { k: "li", name: "LinkedIn", hex: "#C2477E", soft: "#F7E3EB", bench: [6, 10] },
  { k: "mail", name: "Email", hex: "#B5841A", soft: "#F4EAD2", bench: [2, 5] },
  { k: "wa", name: "WhatsApp", hex: "#2A8C6C", soft: "#DCEEE7", bench: [12, 20] },
  { k: "call", name: "Calls", hex: "#C2552B", soft: "#F6E0D6", bench: [25, 40] },
  { k: "sms", name: "SMS", hex: "#8A63B8", soft: "#ECE5F5", bench: [4, 8] },
];

export const CHANNEL: Record<ChannelKey, Channel> = Object.fromEntries(
  CHANNELS.map((c) => [c.k, c]),
) as Record<ChannelKey, Channel>;

export const ALL_CHANNELS: ChannelKey[] = CHANNELS.map((c) => c.k);

export const channelNames = (keys: ChannelKey[]) => keys.map((k) => CHANNEL[k].name).join(" · ");

export const OWNERS: Record<string, string> = {
  AK: "Aarav Kapoor",
  NS: "Neha Sharma",
  RV: "Ravi Verma",
};
