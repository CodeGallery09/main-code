/**
 * Demo lead book for the signed-in app — illustrative data, not real contacts.
 *
 * Each row is stored in the compact shape the design reference uses, and the
 * derived fields (score, tags, masked phone, counts) are computed once below, so
 * a row stays easy to eyeball and edit.
 */

import type { ChannelKey } from "./channels";

/** Engagement signals, and what each is worth towards a lead's score. */
export const SIGNAL_SCORE: Record<string, number> = {
  acc: 10, // accepted connection
  op: 6, // opened email
  op3: 18, // opened email 3x
  clk: 20, // clicked a link
  rep: 30, // replied
  vis: 12, // visited pricing
  vis2: 20, // visited pricing twice
  prof: 4, // viewed your profile
  read: 8, // read WhatsApp
  rnn: 10, // replied "not now"
  neg: -100, // asked to be removed
  ooo: 0, // out of office
};

export const SIGNAL_LABEL: Record<string, string> = {
  acc: "Accepted connection",
  op: "Opened email",
  op3: "Opened email 3×",
  clk: "Clicked a link",
  rep: "Replied",
  vis: "Visited pricing",
  vis2: "Visited pricing twice",
  prof: "Viewed your profile",
  read: "Read WhatsApp",
  rnn: "Replied “not now”",
  neg: "Asked to be removed",
  ooo: "Out of office",
};

export type Stage = "Hot" | "Meeting" | "Engaged" | "Reaching" | "New" | "Nurture" | "Paused" | "Stopped";

export const STAGE_COLOR: Record<Stage, string> = {
  Hot: "var(--accent)",
  Meeting: "var(--pos)",
  Engaged: "var(--hl)",
  Reaching: "#9AA0A8",
  New: "#B9AE9E",
  Nurture: "#B9A27C",
  Paused: "var(--muted)",
  Stopped: "var(--muted)",
};

/**
 * id, name, title, company, signals, stage, source code, step, last touch,
 * last channel, next step, owner, phone.
 */
type Row = [
  number,
  string,
  string,
  string,
  string,
  Stage,
  number,
  string,
  string,
  ChannelKey,
  string,
  string,
  string?,
];

const ROWS: Row[] = [
  [1, "Maya Reyes", "Head of RevOps", "Example Co", "acc,op,clk,rep,prof", "Hot", 1, "Call task", "2h", "li", "Call today", "AK", "+1 415 555 0142"],
  [2, "Omar Haddad", "VP Sales", "Brightline Logistics", "op3,clk,rep,vis", "Hot", 1, "Paused · replied", "35m", "mail", "Reply", "AK", "+971 4 555 0199"],
  [3, "Priya Nair", "Founder", "Kitebox", "acc,op3,clk,vis2,prof", "Hot", 2, "Call task", "4h", "mail", "Call today", "NS", "+91 98200 55123"],
  [4, "Daniel Kim", "Sales Director", "Northwind HR", "acc", "Reaching", 1, "LinkedIn message", "1h", "li", "Approve message", "AK"],
  [5, "Sofia Marques", "COO", "Lumen Labs", "op,ooo", "Paused", 1, "Out of office", "1d", "mail", "Resumes 14 Oct", "RV"],
  [6, "Arjun Mehta", "Head of Growth", "Fieldcraft", "acc,op,clk", "Engaged", 1, "Email 2", "1d", "mail", "Email in 2 days", "NS"],
  [7, "Hannah Cole", "Ops Manager", "Parcel & Co", "op,neg", "Stopped", 3, "Opted out", "2d", "mail", "—", "RV"],
  [8, "Kenji Watanabe", "Revenue Lead", "Quanta Health", "acc,op,rep", "Engaged", 1, "Paused · replied", "3h", "li", "Reply", "AK"],
  [9, "Fatima Zahra", "CEO", "Orbit Freight", "", "New", 1, "Starts Monday", "Today", "li", "Connection request", "NS"],
  [10, "Lucas Weber", "Head of Sales", "Tandem Payroll", "op,rnn", "Nurture", 3, "Re-engage in Jan", "3d", "mail", "Email 12 Jan", "RV"],
  [11, "Ananya Iyer", "Sales Ops Lead", "Seedly", "read,op3,clk,vis", "Engaged", 2, "Watching", "6h", "wa", "Score check", "NS"],
  [12, "Ben Okafor", "Founder", "Harbor Clinics", "acc,op", "Reaching", 1, "Follow-up email", "2d", "mail", "Email tomorrow", "AK"],
  [13, "Chloe Martin", "VP Revenue", "Mosaic Retail", "acc,op3,clk,rep,vis2", "Meeting", 2, "Meeting booked", "Today", "mail", "Meeting Tue 11:00", "NS"],
  [14, "Vikram Rao", "Director, Partnerships", "Ridgeway Solar", "", "Reaching", 1, "Invite pending", "3d", "li", "Email Monday", "RV"],
  [15, "Rohan Desai", "Founder", "Tiffin Labs", "read,rep,clk", "Hot", 2, "Paused · replied", "20m", "wa", "Reply", "NS", "+91 99876 54321"],
];

export type Lead = {
  id: number;
  n: string;
  t: string;
  c: string;
  sig: string[];
  stage: Stage;
  step: string;
  last: string;
  lastCh: ChannelKey;
  next: string;
  own: string;
  ph?: string;
  score: number;
  src: string;
  tags: string[];
  calls: number;
  avgCall: number | null;
  msgs: number;
  consent: boolean;
  fav: boolean;
  email: string;
  li: string;
};

const SOURCE: Record<number, string> = { 1: "CSV", 2: "Form", 3: "CRM" };
const CALL_SECONDS = [170, 16, 50, 23, 92, 33, 19];

export const LEADS: Lead[] = ROWS.map(
  ([id, n, t, c, signals, stage, source, step, last, lastCh, next, own, ph]) => {
    const sig = signals ? signals.split(",") : [];
    const score = Math.max(0, Math.min(100, sig.reduce((sum, s) => sum + (SIGNAL_SCORE[s] || 0), 0)));

    const tags: string[] = [];
    if (stage === "Hot" || sig.includes("rep")) tags.push("Interested");
    if (stage === "Meeting") tags.push("Meeting");
    if (sig.includes("rnn")) tags.push("Callback Q1");
    if (sig.includes("ooo")) tags.push("Out of office");
    if (sig.includes("neg")) tags.push("Do not contact");
    if (sig.includes("vis") || sig.includes("vis2")) tags.push("Pricing visit");
    if (ph && stage !== "Meeting" && id % 3 === 0) tags.push("Voicemail");
    tags.push("Title: " + t);

    const first = n.split(" ")[0].toLowerCase();
    const slug = n.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, "-");
    const domain = c.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

    return {
      id,
      n,
      t,
      c,
      sig,
      stage,
      step,
      last,
      lastCh,
      next,
      own,
      ph,
      score,
      src: id === 11 || id === 14 ? "LinkedIn" : SOURCE[source] || "CSV",
      tags,
      calls: ph ? 1 + (id % 3) : 0,
      avgCall: ph ? CALL_SECONDS[id % 7] : null,
      msgs: sig.filter((s) => s !== "prof" && s !== "vis" && s !== "vis2").length + 1,
      consent: stage !== "Stopped",
      fav: id === 1 || id === 3,
      email: `${first}@${domain}.com`,
      li: `linkedin.com/in/${slug}`,
    };
  },
);

export const leadById = (id: number) => LEADS.find((l) => l.id === id);

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
