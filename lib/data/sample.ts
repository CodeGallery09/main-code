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
  /** Illustrative figures, labelled as such wherever they are shown. */
  sent: 412,
  delivered: 401,
  openRate: 44.2,
  replyRate: 7.1,
  clicks: 38,
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
