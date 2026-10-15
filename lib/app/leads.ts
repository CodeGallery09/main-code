/**
 * Display helpers for leads: the stage vocabulary and its colours, the score band, phone masking,
 * tag colours and avatar tints. Pure functions and constants, shared by every screen that shows a
 * person. Lead *data* lives in the database (`lib/data/`), never here.
 */

/** "Closed" is a won deal, distinct from "Stopped" (asked not to be contacted). */
export type Stage =
  | "Hot"
  | "Meeting"
  | "Engaged"
  | "Reaching"
  | "New"
  | "Nurture"
  | "Paused"
  | "Stopped"
  | "Closed";

export const STAGE_COLOR: Record<Stage, string> = {
  Hot: "var(--accent)",
  Meeting: "var(--pos)",
  Engaged: "var(--hl)",
  Reaching: "#9AA0A8",
  New: "#B9AE9E",
  Nurture: "#B9A27C",
  Paused: "var(--muted)",
  Stopped: "var(--muted)",
  Closed: "var(--pos)",
};

/** Heat band used for the score pill. */
export const scoreBand = (score: number) => (score >= 70 ? "hot" : score >= 40 ? "warm" : "");

/** Phone numbers are masked everywhere outside the call screen. */
export const maskPhone = (phone?: string) => {
  if (!phone) return null;
  const digits = phone.replace(/\s/g, "");
  return digits.slice(0, 3) + "•••••" + digits.slice(-2);
};

/** Background and text colour for a lead tag. */
export const tagColors = (tag: string): [string, string] => {
  if (tag.startsWith("Title:")) return ["rgba(24,26,30,.06)", "#3A3F46"];
  const map: Record<string, [string, string]> = {
    Interested: ["rgba(79,107,69,.16)", "#3F5937"],
    Meeting: ["rgba(201,80,120,.13)", "#9A2F5A"],
    "Callback Q1": ["rgba(201,80,120,.13)", "#9A2F5A"],
    "Pricing visit": ["rgba(201,146,46,.18)", "#7A5310"],
    "Do not contact": ["rgba(169,58,35,.14)", "#A93A23"],
  };
  return map[tag] || ["rgba(24,26,30,.07)", "#454B53"];
};

/** Deterministic avatar tint, so a person keeps the same colour across screens. */
const AVATAR_TINTS: [string, string][] = [
  ["#EEEFF1", "#2E343B"],
  ["#E4F1EA", "#2F5D46"],
  ["#EFEAF8", "#5B3F86"],
  ["#ECEEF1", "#2E343B"],
  ["#FBF0E2", "#8A5A1F"],
  ["#E3F3F5", "#1F6672"],
];

export const avatarTint = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
};

export const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

