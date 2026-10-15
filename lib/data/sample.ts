/**
 * The sample content every new workspace starts with: one multichannel campaign and a handful of
 * leads, so a new account can see what the product does before it has any data of its own.
 *
 * **Everything here is invented, and says so.** Rows seeded from it carry `is_sample = true`, the
 * UI shows a "Sample" label and a banner, and "Remove sample data" deletes them. The content
 * rules (CLAUDE.md) forbid presenting invented figures as real, so the labelling is the point of
 * the flag, not decoration.
 *
 * Two safety properties, pinned by tests/sample.test.mjs because getting either wrong would be a
 * real incident rather than a cosmetic bug:
 * - every address uses a reserved documentation domain (`.example`), which cannot be registered,
 *   so a sample lead can never receive a real email;
 * - every phone number sits in a fictional range, so a sample lead can never be a real person's.
 *
 * Import-free and erasable, so `node --test` can load it. The database insert and the workflow
 * graph are built where the transaction lives (lib/data/sampleSeed.ts).
 */

export type SampleLead = {
  name: string;
  company: string;
  title: string;
  email: string;
  /** E.164, in the fictional 555-01xx range. */
  phone: string | null;
  stage: "new" | "reaching" | "engaged" | "hot" | "meeting" | "nurture";
  score: number;
  source: "form" | "csv" | "linkedin" | "crm" | "event";
  tags: string[];
  /** Mixed on purpose, so the Consent column shows both states. */
  consent: boolean;
  nextStep: string;
  messageCount: number;
  callCount: number;
  avgCallSeconds: number | null;
  starred: boolean;
};

export const SAMPLE_CAMPAIGN = {
  name: "Sample · Net-new outbound",
  type: "multichannel",
  /** Not running: nothing sends yet, and "live" on an invented campaign would be a false claim. */
  status: "paused",
  channels: ["linkedin", "email", "call"],
  version: "v1",
  /** Days before signup the sample campaign "started", so its dates look lived-in. */
  startedDaysAgo: 21,
  /**
   * Illustrative figures, labelled as such wherever they are shown. They are derived from
   * `SAMPLE_ROLLUPS` below (delivered = total reached, open rate = engaged / reached, reply rate =
   * replied / reached), so the campaigns table, Home and Analytics always agree with each other.
   */
  sent: 31,
  delivered: 30,
  openRate: 43.3,
  replyRate: 16.7,
  clicks: 4,
} as const;

export const SAMPLE_LEADS: SampleLead[] = [
  { name: "Priya Raman", company: "Kitebox Labs", title: "Founder", email: "priya@kitebox.example", phone: "+12025550111", stage: "hot", score: 82, source: "linkedin", tags: ["pricing", "replied"], consent: true, nextStep: "Call today", messageCount: 5, callCount: 1, avgCallSeconds: 184, starred: true },
  { name: "Daniel Okafor", company: "Northwind Freight", title: "VP Sales", email: "daniel@northwind.example", phone: "+12025550112", stage: "meeting", score: 91, source: "form", tags: ["booked"], consent: true, nextStep: "Demo Thursday 3pm", messageCount: 8, callCount: 2, avgCallSeconds: 268, starred: true },
  { name: "Sofia Marques", company: "Lumen Retail", title: "Head of Growth", email: "sofia@lumen.example", phone: null, stage: "engaged", score: 64, source: "csv", tags: ["opened 3x"], consent: true, nextStep: "Send case study", messageCount: 4, callCount: 0, avgCallSeconds: null, starred: false },
  { name: "Arjun Mehta", company: "Fieldcraft", title: "Revenue Lead", email: "arjun@fieldcraft.example", phone: "+12025550114", stage: "engaged", score: 58, source: "linkedin", tags: ["accepted invite"], consent: true, nextStep: "Follow up Tuesday", messageCount: 3, callCount: 0, avgCallSeconds: null, starred: false },
  { name: "Hannah Cole", company: "Parcel & Co", title: "Ops Manager", email: "hannah@parcel.example", phone: null, stage: "reaching", score: 31, source: "csv", tags: [], consent: true, nextStep: "Awaiting first reply", messageCount: 1, callCount: 0, avgCallSeconds: null, starred: false },
  { name: "Lucas Weber", company: "Tandem Payroll", title: "Head of Sales", email: "lucas@tandem.example", phone: "+12025550116", stage: "nurture", score: 36, source: "event", tags: ["not now"], consent: true, nextStep: "Revisit in January", messageCount: 3, callCount: 1, avgCallSeconds: 96, starred: false },
  { name: "Ben Adeyemi", company: "Harbor Clinics", title: "Founder", email: "ben@harbor.example", phone: "+12025550117", stage: "reaching", score: 22, source: "crm", tags: [], consent: false, nextStep: "Consent needed before outreach", messageCount: 0, callCount: 0, avgCallSeconds: null, starred: false },
  { name: "Chloe Martin", company: "Mosaic Retail", title: "VP Revenue", email: "chloe@mosaic.example", phone: null, stage: "new", score: 12, source: "form", tags: [], consent: true, nextStep: "Add to the sequence", messageCount: 0, callCount: 0, avgCallSeconds: null, starred: false },
];

/* ------------------------------------------------- the rest of the sample world -- */

/** One day of the sample campaign's funnel on one channel, counted from `daysAgo` before signup. */
export type SampleRollup = {
  daysAgo: number;
  channel: "linkedin" | "email";
  reached: number;
  engaged: number;
  replied: number;
  positive: number;
  meetings: number;
};

/** Totals: reached 30, engaged 13, replied 5, positive 3, meetings 1. */
export const SAMPLE_ROLLUPS: SampleRollup[] = [
  { daysAgo: 19, channel: "linkedin", reached: 3, engaged: 1, replied: 0, positive: 0, meetings: 0 },
  { daysAgo: 18, channel: "email", reached: 2, engaged: 1, replied: 0, positive: 0, meetings: 0 },
  { daysAgo: 16, channel: "linkedin", reached: 2, engaged: 1, replied: 1, positive: 0, meetings: 0 },
  { daysAgo: 14, channel: "email", reached: 4, engaged: 2, replied: 0, positive: 0, meetings: 0 },
  { daysAgo: 12, channel: "linkedin", reached: 3, engaged: 1, replied: 1, positive: 1, meetings: 0 },
  { daysAgo: 11, channel: "email", reached: 2, engaged: 1, replied: 0, positive: 0, meetings: 0 },
  { daysAgo: 9, channel: "email", reached: 3, engaged: 2, replied: 1, positive: 1, meetings: 0 },
  { daysAgo: 7, channel: "linkedin", reached: 2, engaged: 1, replied: 0, positive: 0, meetings: 0 },
  { daysAgo: 6, channel: "email", reached: 3, engaged: 1, replied: 1, positive: 0, meetings: 0 },
  { daysAgo: 4, channel: "linkedin", reached: 2, engaged: 1, replied: 0, positive: 0, meetings: 0 },
  { daysAgo: 3, channel: "email", reached: 2, engaged: 1, replied: 1, positive: 1, meetings: 1 },
  { daysAgo: 1, channel: "linkedin", reached: 2, engaged: 0, replied: 0, positive: 0, meetings: 0 },
];

export type SampleMessage = { from: "them" | "us"; body: string; hoursAgo: number };

export type SampleThread = {
  /** Which sample lead it is with, by email. */
  leadEmail: string;
  channel: "linkedin" | "email";
  intent: "interested" | "question" | "objection" | "out-of-office" | "opt-out";
  role: string;
  unread: boolean;
  needsReply: boolean;
  signals: { label: string; points: number }[];
  messages: SampleMessage[];
};

/** Conversations with the leads who replied. None involves the lead without consent. */
export const SAMPLE_THREADS: SampleThread[] = [
  {
    leadEmail: "priya@kitebox.example",
    channel: "linkedin",
    intent: "interested",
    role: "Founder",
    unread: true,
    needsReply: true,
    signals: [
      { label: "Replied", points: 25 },
      { label: "Asked about pricing", points: 20 },
    ],
    messages: [
      { from: "us", body: "Hi Priya, saw Kitebox is hiring SDRs. We help small sales teams run LinkedIn and email from one workflow. Worth a quick look?", hoursAgo: 120 },
      { from: "them", body: "Interesting timing. What does pricing look like for a team of four?", hoursAgo: 3 },
    ],
  },
  {
    leadEmail: "daniel@northwind.example",
    channel: "email",
    intent: "interested",
    role: "VP Sales",
    unread: false,
    needsReply: false,
    signals: [
      { label: "Replied", points: 25 },
      { label: "Booked a meeting", points: 40 },
    ],
    messages: [
      { from: "us", body: "Daniel, would a short demo next week be useful? Happy to walk through how teams like Northwind set up outbound.", hoursAgo: 96 },
      { from: "them", body: "Yes, Thursday at 3pm works for me.", hoursAgo: 52 },
      { from: "us", body: "Booked for Thursday 3pm. Calendar invite is on its way.", hoursAgo: 51 },
    ],
  },
  {
    leadEmail: "sofia@lumen.example",
    channel: "email",
    intent: "question",
    role: "Head of Growth",
    unread: true,
    needsReply: true,
    signals: [
      { label: "Replied", points: 25 },
      { label: "Opened 3 times", points: 10 },
    ],
    messages: [
      { from: "us", body: "Sofia, here is the one-pager on how we run multichannel sequences. Let me know what you think.", hoursAgo: 30 },
      { from: "them", body: "Thanks. Does this connect to HubSpot, or is it a separate list?", hoursAgo: 2 },
    ],
  },
  {
    leadEmail: "lucas@tandem.example",
    channel: "email",
    intent: "objection",
    role: "Head of Sales",
    unread: false,
    needsReply: false,
    signals: [{ label: "Replied: not now", points: 5 }],
    messages: [
      { from: "us", body: "Lucas, a quick follow up on my note about outbound for Tandem.", hoursAgo: 200 },
      { from: "them", body: "Not a priority until January. Please check back then.", hoursAgo: 150 },
    ],
  },
];

export type SampleTask = {
  leadEmail: string;
  kind: "reply" | "call" | "review";
  channel: "linkedin" | "email" | "call";
  summary: string;
  when: string;
};

export const SAMPLE_TASKS: SampleTask[] = [
  { leadEmail: "priya@kitebox.example", kind: "call", channel: "call", summary: "Asked about pricing. Call today", when: "Today" },
  { leadEmail: "sofia@lumen.example", kind: "reply", channel: "email", summary: "Asked if it connects to HubSpot", when: "2h" },
  { leadEmail: "hannah@parcel.example", kind: "review", channel: "linkedin", summary: "First LinkedIn message ready to review", when: "Waiting" },
];

/**
 * The org-level accounts the sample workspace shows, so the Configuration screen has something to
 * explain. They are invented, flagged `is_sample`, assigned to the sample campaign, and removed with
 * it. Connecting a real LinkedIn account or mailbox is not built yet.
 */
export const SAMPLE_ACCOUNTS = {
  linkedin: {
    name: "Sample LinkedIn account",
    handle: "linkedin.com/in/sample-account",
    state: "healthy",
    settings: { connections: 20, messages: 50, visits: 60, inmail: 25 },
  },
  email: {
    name: "Sample mailbox",
    handle: "sample@sample.example",
    state: "warm",
    settings: { provider: "Sample provider", health: 92, cap: 40, rotate: true },
  },
  domain: { host: "sample.example", spf: true, dkim: true, dmarc: true },
} as const;
