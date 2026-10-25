/**
 * Seeds a database with the demo workspace: `npm run db:seed`
 *
 * Run it against a fresh, migrated database. It is **idempotent by workspace** — it deletes the
 * demo workspace first, and every table cascades from it, so re-running replaces the demo data
 * instead of duplicating it. It touches nothing outside that one workspace id, so a real tenant
 * sitting in the same database is never affected.
 *
 * Imports are relative with explicit `.ts` extensions, and the modules it pulls in use only
 * erasable syntax, because this runs under `node --experimental-strip-types` where the `@/` alias
 * does not resolve (see CLAUDE.md).
 *
 * Every figure here is invented sample data. The UI labels it as such, and must keep doing so.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import {
  strategies,
  channelQuotas,
  dailyRollups,
  audiences,
  memberships,
  messages,
  tasks,
  threads,
  users,
  workspaces,
} from "../lib/db/schema.ts";
import { hashPassword } from "../lib/password.ts";

const WORKSPACE_ID = "w_demo";

const OWNER_EMAIL = (process.env.SEED_OWNER_EMAIL ?? "founders0910@gmail.com").toLowerCase();
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD ?? "Saayem#123";

type ChannelName = "linkedin" | "email" | "whatsapp" | "call" | "sms";

/* ------------------------------------------------------------------ team -- */

const TEAM = [
  { id: "u_1", name: "Aarav Kapoor", email: OWNER_EMAIL, role: "owner" as const, tz: "Asia/Kolkata" },
  { id: "u_2", name: "Neha Sharma", email: "neha@acmegrowth.example", role: "admin" as const, tz: "Asia/Kolkata" },
  { id: "u_3", name: "Ravi Verma", email: "ravi@acmegrowth.example", role: "member" as const, tz: "Asia/Kolkata" },
];

/* ------------------------------------------------------------- strategies -- */

type SeedStrategy = {
  id: string;
  name: string;
  status: "live" | "scheduled" | "paused" | "draft" | "completed";
  type: "standalone" | "multichannel";
  channels: ChannelName[];
  audiences: number;
  version: string | null;
  daysAgo: number;
  sent: number | null;
  delivered: number | null;
  openRate: number | null;
  replyRate: number | null;
  clicks: number | null;
};

const CAMPAIGNS: SeedStrategy[] = [
  { id: "c_launch_v3", name: "Product launch · v3", status: "scheduled", type: "standalone", channels: ["email"], audiences: 5200, version: null, daysAgo: -12, sent: null, delivered: null, openRate: null, replyRate: null, clicks: null },
  { id: "c_net_new", name: "Net-new outbound", status: "live", type: "multichannel", channels: ["linkedin", "email", "call"], audiences: 612, version: "v2", daysAgo: 30, sent: 4820, delivered: 4712, openRate: 41.2, replyRate: 6.8, clicks: 388 },
  { id: "c_webinar", name: "Q4 webinar invite", status: "live", type: "standalone", channels: ["email"], audiences: 2400, version: "v1", daysAgo: 15, sent: 2400, delivered: 2338, openRate: 38.4, replyRate: 3.1, clicks: 201 },
  { id: "c_inbound", name: "Inbound follow-up", status: "live", type: "multichannel", channels: ["email", "whatsapp", "call"], audiences: 214, version: "v1", daysAgo: 70, sent: 1340, delivered: 1312, openRate: 52.6, replyRate: 12.4, clicks: 176 },
  { id: "c_trial", name: "Trial expiring · Oct cohort", status: "live", type: "standalone", channels: ["email"], audiences: 640, version: "v1", daysAgo: 20, sent: 1880, delivered: 1844, openRate: 47.1, replyRate: 8.2, clicks: 149 },
  { id: "c_saasboomi", name: "SaaSBoomi follow-up", status: "live", type: "standalone", channels: ["linkedin"], audiences: 180, version: "v1", daysAgo: 10, sent: 180, delivered: 174, openRate: null, replyRate: 14.6, clicks: null },
  { id: "c_relapse", name: "Closed-lost re-engage", status: "live", type: "multichannel", channels: ["email", "linkedin", "sms"], audiences: 458, version: "v1", daysAgo: 22, sent: 1620, delivered: 1588, openRate: 33.8, replyRate: 5.4, clicks: 118 },
  { id: "c_renewal", name: "Renewal check-ins", status: "live", type: "standalone", channels: ["call"], audiences: 96, version: "v1", daysAgo: 30, sent: 96, delivered: 92, openRate: null, replyRate: 36.2, clicks: null },
  { id: "c_demo_rem", name: "Demo reminders", status: "paused", type: "standalone", channels: ["sms"], audiences: 420, version: "v1", daysAgo: 60, sent: 840, delivered: 822, openRate: null, replyRate: 4.9, clicks: null },
  { id: "c_event", name: "Event follow-up", status: "paused", type: "multichannel", channels: ["whatsapp", "call", "email"], audiences: 180, version: "v1", daysAgo: 100, sent: 520, delivered: 508, openRate: 44.0, replyRate: 9.7, clicks: 61 },
  { id: "c_draft_apac", name: "APAC expansion (draft)", status: "draft", type: "multichannel", channels: ["linkedin", "email"], audiences: 0, version: null, daysAgo: 2, sent: null, delivered: null, openRate: null, replyRate: null, clicks: null },
];

/* ----------------------------------------------------------------- audiences -- */

type SeedAudience = {
  id: string;
  name: string;
  company: string;
  role: string;
  stage: "new" | "reaching" | "engaged" | "hot" | "meeting" | "nurture" | "paused" | "stopped" | "closed";
  score: number;
  source: "form" | "csv" | "linkedin" | "crm" | "event";
  tags: string[];
  consent: boolean;
  owner: string;
  strategyId: string | null;
  nextStep: string;
  phone: string | null;
  email: string | null;
  starred: boolean;
  messageCount: number;
  callCount: number;
  avgCallSeconds: number | null;
};

const LEADS: SeedAudience[] = [
  { id: "l_omar", name: "Omar Haddad", company: "Brightline Logistics", role: "Head of Ops", stage: "hot", score: 80, source: "linkedin", tags: ["pricing", "8 seats"], consent: true, owner: "u_1", strategyId: "c_net_new", nextStep: "Send pricing for 8 seats", phone: "+971500000001", email: "omar@brightline.example", starred: true, messageCount: 6, callCount: 1, avgCallSeconds: 212 },
  { id: "l_maya", name: "Maya Reyes", company: "Example Co", role: "VP Sales", stage: "hot", score: 70, source: "form", tags: ["clicked pricing"], consent: true, owner: "u_1", strategyId: "c_inbound", nextStep: "Call today", phone: "+6391000002", email: "maya@example.example", starred: true, messageCount: 4, callCount: 2, avgCallSeconds: 184 },
  { id: "l_priya", name: "Priya Nair", company: "Kitebox", role: "Founder", stage: "hot", score: 72, source: "event", tags: ["pricing x2"], consent: true, owner: "u_2", strategyId: "c_saasboomi", nextStep: "Call today", phone: "+919000000003", email: "priya@kitebox.example", starred: false, messageCount: 3, callCount: 0, avgCallSeconds: null },
  { id: "l_rohan", name: "Rohan Desai", company: "Tiffin Labs", role: "Growth Audience", stage: "engaged", score: 58, source: "linkedin", tags: ["deck"], consent: true, owner: "u_1", strategyId: "c_net_new", nextStep: "Send deck", phone: "+919000000004", email: "rohan@tiffinlabs.example", starred: false, messageCount: 5, callCount: 0, avgCallSeconds: null },
  { id: "l_kenji", name: "Kenji Tanaka", company: "Northwind KK", role: "Sales Director", stage: "meeting", score: 86, source: "crm", tags: ["booked"], consent: true, owner: "u_2", strategyId: "c_inbound", nextStep: "Prep call notes", phone: "+815000000005", email: "kenji@northwind.example", starred: true, messageCount: 9, callCount: 3, avgCallSeconds: 341 },
  { id: "l_sara", name: "Sara Oyelaran", company: "Lagos Freight", role: "COO", stage: "engaged", score: 54, source: "csv", tags: ["opened 3x"], consent: true, owner: "u_3", strategyId: "c_relapse", nextStep: "Follow up Thursday", phone: null, email: "sara@lagosfreight.example", starred: false, messageCount: 2, callCount: 0, avgCallSeconds: null },
  { id: "l_tom", name: "Tom Blackwood", company: "Pennine Tools", role: "MD", stage: "reaching", score: 24, source: "csv", tags: [], consent: true, owner: "u_3", strategyId: "c_webinar", nextStep: "Awaiting first reply", phone: null, email: "tom@penninetools.example", starred: false, messageCount: 1, callCount: 0, avgCallSeconds: null },
  { id: "l_ana", name: "Ana Brito", company: "Serra Sistemas", role: "Head of RevOps", stage: "engaged", score: 61, source: "linkedin", tags: ["accepted", "profile view"], consent: true, owner: "u_1", strategyId: "c_net_new", nextStep: "Share case study", phone: null, email: "ana@serra.example", starred: false, messageCount: 4, callCount: 0, avgCallSeconds: null },
  { id: "l_david", name: "David Okonkwo", company: "Harbour Fin", role: "CFO", stage: "nurture", score: 32, source: "form", tags: ["not now"], consent: true, owner: "u_2", strategyId: "c_trial", nextStep: "Revisit in Q1", phone: null, email: "david@harbourfin.example", starred: false, messageCount: 3, callCount: 1, avgCallSeconds: 96 },
  { id: "l_lena", name: "Lena Fischer", company: "Alpenmetall", role: "Procurement", stage: "stopped", score: 0, source: "csv", tags: ["opt-out"], consent: false, owner: "u_3", strategyId: "c_relapse", nextStep: "Do not contact", phone: null, email: "lena@alpenmetall.example", starred: false, messageCount: 2, callCount: 0, avgCallSeconds: null },
  { id: "l_james", name: "James Whitfield", company: "Cobalt Health", role: "Director", stage: "new", score: 12, source: "event", tags: [], consent: true, owner: "u_1", strategyId: null, nextStep: "Add to sequence", phone: null, email: "james@cobalthealth.example", starred: false, messageCount: 0, callCount: 0, avgCallSeconds: null },
  { id: "l_fatima", name: "Fatima Al-Sayed", company: "Gulf Retail Group", role: "Head of Sales", stage: "meeting", score: 78, source: "linkedin", tags: ["booked", "champion"], consent: true, owner: "u_2", strategyId: "c_net_new", nextStep: "Demo Thursday 3pm", phone: "+971500000012", email: "fatima@gulfretail.example", starred: true, messageCount: 7, callCount: 2, avgCallSeconds: 268 },
  { id: "l_wei", name: "Wei Zhang", company: "Lintong Materials", role: "GM", stage: "paused", score: 28, source: "crm", tags: ["holiday"], consent: true, owner: "u_3", strategyId: "c_event", nextStep: "Resume after 20th", phone: null, email: "wei@lintong.example", starred: false, messageCount: 2, callCount: 0, avgCallSeconds: null },
  { id: "l_grace", name: "Grace Mwangi", company: "Savannah Agri", role: "Ops Manager", stage: "closed", score: 92, source: "form", tags: ["won"], consent: true, owner: "u_1", strategyId: "c_inbound", nextStep: "Handover to onboarding", phone: null, email: "grace@savannahagri.example", starred: false, messageCount: 12, callCount: 4, avgCallSeconds: 402 },
  { id: "l_marco", name: "Marco Rossi", company: "Veneto Logistica", role: "Owner", stage: "reaching", score: 18, source: "csv", tags: [], consent: true, owner: "u_3", strategyId: "c_webinar", nextStep: "Second touch queued", phone: null, email: "marco@venetolog.example", starred: false, messageCount: 1, callCount: 0, avgCallSeconds: null },
];

/* --------------------------------------------------------------- threads -- */

type SeedThread = {
  id: string;
  audienceId: string;
  channel: ChannelName;
  intent: "interested" | "question" | "objection" | "out-of-office" | "opt-out";
  preview: string;
  unread: boolean;
  needsReply: boolean;
  minutesAgo: number;
  signals: { label: string; points: number }[];
  messages: { from: "them" | "us"; body: string; minutesAgo: number }[];
};

const THREADS: SeedThread[] = [
  {
    id: "t_omar", audienceId: "l_omar", channel: "email", intent: "interested",
    preview: "What would 8 seats cost us annually?", unread: true, needsReply: true, minutesAgo: 35,
    signals: [{ label: "Replied", points: 30 }, { label: "Visited pricing twice", points: 20 }, { label: "Opened email 3×", points: 18 }],
    messages: [
      { from: "us", body: "Hi Omar — saw Brightline is scaling the ops team. Worth a quick look at how we sequence outreach across LinkedIn and email?", minutesAgo: 2880 },
      { from: "them", body: "Possibly. We're a team of 8 — what would 8 seats cost us annually?", minutesAgo: 35 },
    ],
  },
  {
    id: "t_rohan", audienceId: "l_rohan", channel: "whatsapp", intent: "question",
    preview: "Can you send a deck I can share internally?", unread: true, needsReply: true, minutesAgo: 20,
    signals: [{ label: "Replied", points: 30 }, { label: "Read WhatsApp", points: 8 }],
    messages: [
      { from: "us", body: "Hi Rohan, following up on the LinkedIn note — happy to show you the workflow builder.", minutesAgo: 1440 },
      { from: "them", body: "Can you send a deck I can share internally?", minutesAgo: 20 },
    ],
  },
  {
    id: "t_kenji", audienceId: "l_kenji", channel: "email", intent: "interested",
    preview: "Thursday 3pm JST works. Calendar invite sent.", unread: false, needsReply: false, minutesAgo: 300,
    signals: [{ label: "Replied", points: 30 }, { label: "Clicked a link", points: 20 }, { label: "Visited pricing", points: 12 }],
    messages: [
      { from: "us", body: "Kenji — would a 20-minute walkthrough be useful next week?", minutesAgo: 2000 },
      { from: "them", body: "Thursday 3pm JST works. Calendar invite sent.", minutesAgo: 300 },
    ],
  },
  {
    id: "t_david", audienceId: "l_david", channel: "email", intent: "objection",
    preview: "Budget is frozen until the new fiscal year.", unread: false, needsReply: true, minutesAgo: 1200,
    signals: [{ label: "Replied “not now”", points: 10 }],
    messages: [
      { from: "us", body: "David, your trial wraps up Friday — want me to extend it?", minutesAgo: 2600 },
      { from: "them", body: "Budget is frozen until the new fiscal year. Circle back in January.", minutesAgo: 1200 },
    ],
  },
  {
    id: "t_lena", audienceId: "l_lena", channel: "email", intent: "opt-out",
    preview: "Please remove me from your list.", unread: false, needsReply: false, minutesAgo: 4000,
    signals: [{ label: "Asked to be removed", points: -100 }],
    messages: [
      { from: "us", body: "Hello Lena — reaching out about procurement workflows at Alpenmetall.", minutesAgo: 5000 },
      { from: "them", body: "Please remove me from your list.", minutesAgo: 4000 },
    ],
  },
  {
    id: "t_fatima", audienceId: "l_fatima", channel: "linkedin", intent: "interested",
    preview: "Sending this to our RevOps audience now.", unread: true, needsReply: true, minutesAgo: 90,
    signals: [{ label: "Replied", points: 30 }, { label: "Accepted connection", points: 10 }, { label: "Viewed your profile", points: 4 }],
    messages: [
      { from: "us", body: "Thanks for connecting, Fatima. Most retail teams we speak to are stitching three tools together — is that your setup?", minutesAgo: 900 },
      { from: "them", body: "Pretty much. Sending this to our RevOps audience now.", minutesAgo: 90 },
    ],
  },
  {
    id: "t_wei", audienceId: "l_wei", channel: "email", intent: "out-of-office",
    preview: "Out of office until the 20th.", unread: false, needsReply: false, minutesAgo: 2400,
    signals: [{ label: "Out of office", points: 0 }],
    messages: [
      { from: "us", body: "Wei — following up after the event.", minutesAgo: 2500 },
      { from: "them", body: "Out of office until the 20th.", minutesAgo: 2400 },
    ],
  },
];

/* ----------------------------------------------------------------- tasks -- */

const TASKS = [
  { id: "tk_omar", kind: "reply" as const, audienceId: "l_omar", summary: "Asked about pricing for 8 seats", when: "35m", channel: "email" as ChannelName },
  { id: "tk_rohan", kind: "reply" as const, audienceId: "l_rohan", summary: "Asked for a deck", when: "20m", channel: "whatsapp" as ChannelName },
  { id: "tk_fatima", kind: "reply" as const, audienceId: "l_fatima", summary: "Forwarding to RevOps audience", when: "1h", channel: "linkedin" as ChannelName },
  { id: "tk_maya", kind: "call" as const, audienceId: "l_maya", summary: "Open to a chat · clicked pricing", when: "Today", channel: "call" as ChannelName },
  { id: "tk_priya", kind: "call" as const, audienceId: "l_priya", summary: "Visited pricing twice", when: "Today", channel: "call" as ChannelName },
  { id: "tk_kenji", kind: "review" as const, audienceId: "l_kenji", summary: "Prep notes before Thursday demo", when: "Waiting", channel: "email" as ChannelName },
];

/* --------------------------------------------------------------- rollups -- */

const QUOTAS: { channel: ChannelName; used: number; cap: number }[] = [
  { channel: "linkedin", used: 52, cap: 105 },
  { channel: "email", used: 142, cap: 200 },
  { channel: "whatsapp", used: 36, cap: 120 },
  { channel: "sms", used: 12, cap: 100 },
  { channel: "call", used: 8, cap: 40 },
];

/** Per-channel daily volume and the conversion between funnel stages. */
const CHANNEL_MODEL: Record<ChannelName, { base: number; e: number; r: number; p: number; m: number }> = {
  linkedin: { base: 24, e: 0.48, r: 0.092, p: 0.55, m: 0.42 },
  email: { base: 46, e: 0.56, r: 0.038, p: 0.5, m: 0.4 },
  whatsapp: { base: 14, e: 0.84, r: 0.17, p: 0.52, m: 0.36 },
  call: { base: 6, e: 0.44, r: 0.36, p: 0.45, m: 0.52 },
  sms: { base: 9, e: 0.9, r: 0.055, p: 0.4, m: 0.3 },
};

/**
 * Deterministic PRNG (mulberry32), so a reseed produces identical analytics and a screenshot
 * taken today still matches one taken last week. `Math.random()` here would make the dashboard
 * change on every seed and make a regression impossible to spot.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROLLUP_DAYS = 180;

function buildRollups() {
  const random = mulberry32(20261012);
  const rows: {
    workspaceId: string;
    day: string;
    channel: ChannelName;
    reached: number;
    engaged: number;
    replied: number;
    positive: number;
    meetings: number;
  }[] = [];

  for (let back = ROLLUP_DAYS - 1; back >= 0; back -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - back);
    const day = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    // Outreach happens on working days; a flat weekend would look obviously synthetic.
    const weekendFactor = weekday === 0 || weekday === 6 ? 0.18 : 1;
    // A gentle ramp, so the period-over-period deltas are not all zero.
    const ramp = 0.75 + (0.5 * (ROLLUP_DAYS - back)) / ROLLUP_DAYS;

    for (const channel of Object.keys(CHANNEL_MODEL) as ChannelName[]) {
      const model = CHANNEL_MODEL[channel];
      const jitter = 0.7 + random() * 0.6;
      const reached = Math.round(model.base * ramp * weekendFactor * jitter);
      const engaged = Math.round(reached * model.e * (0.85 + random() * 0.3));
      const replied = Math.round(reached * model.r * (0.8 + random() * 0.4));
      const positive = Math.round(replied * model.p * (0.85 + random() * 0.3));
      const meetings = Math.round(positive * model.m * (0.8 + random() * 0.4));
      rows.push({ workspaceId: WORKSPACE_ID, day, channel, reached, engaged, replied, positive, meetings });
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ main -- */

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const daysAgoDate = (days: number) => new Date(Date.now() - days * 86_400_000);

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true },
  });
  const db = drizzle(pool);

  try {
    // Scoped to the demo workspace only. Everything else cascades from this one row, so a real
    // tenant in the same database is untouched.
    await db.delete(workspaces).where(eq(workspaces.id, WORKSPACE_ID));

    await db.insert(workspaces).values({
      id: WORKSPACE_ID,
      name: "Acme Growth",
      plan: "Scale (trial)",
      seats: 5,
      liveChannels: ["linkedin", "email"],
      plannedChannels: ["whatsapp", "call", "sms"],
    });

    const hash = await hashPassword(OWNER_PASSWORD);
    for (const member of TEAM) {
      // Users are global, not per-workspace, so an existing account keeps its password; only the
      // owner's is (re)set, from the seed env vars.
      await db
        .insert(users)
        .values({
          id: member.id,
          email: member.email,
          name: member.name,
          timeZone: member.tz,
          passwordHash: member.role === "owner" ? hash : null,
        })
        .onConflictDoUpdate({
          target: users.email,
          set: { name: member.name, ...(member.role === "owner" ? { passwordHash: hash } : {}) },
        });
      await db
        .insert(memberships)
        .values({ workspaceId: WORKSPACE_ID, userId: member.id, role: member.role })
        .onConflictDoNothing();
    }

    await db.insert(channelQuotas).values(QUOTAS.map((q) => ({ ...q, workspaceId: WORKSPACE_ID })));

    await db.insert(strategies).values(
      CAMPAIGNS.map((c) => ({
        id: c.id,
        workspaceId: WORKSPACE_ID,
        name: c.name,
        status: c.status,
        type: c.type,
        channels: c.channels,
        version: c.version,
        startedAt: daysAgoDate(c.daysAgo),
        audiences: c.audiences,
        sent: c.sent,
        delivered: c.delivered,
        // numeric columns take strings, so the exact decimal is preserved.
        openRate: c.openRate === null ? null : String(c.openRate),
        replyRate: c.replyRate === null ? null : String(c.replyRate),
        clicks: c.clicks,
      })),
    );

    await db.insert(audiences).values(
      LEADS.map((l) => ({
        id: l.id,
        workspaceId: WORKSPACE_ID,
        name: l.name,
        company: l.company,
        title: l.role,
        phone: l.phone,
        email: l.email,
        stage: l.stage,
        score: l.score,
        source: l.source,
        tags: l.tags,
        consent: l.consent,
        avgCallSeconds: l.avgCallSeconds,
        messageCount: l.messageCount,
        callCount: l.callCount,
        nextStep: l.nextStep,
        ownerId: l.owner,
        strategyId: l.strategyId,
        starred: l.starred,
        updatedAt: minutesAgo(Math.round(Math.abs(Math.sin(l.id.length * 7)) * 4000)),
      })),
    );

    await db.insert(threads).values(
      THREADS.map((t) => {
        const audience = LEADS.find((l) => l.id === t.audienceId);
        return {
          id: t.id,
          workspaceId: WORKSPACE_ID,
          audienceId: t.audienceId,
          channel: t.channel,
          intent: t.intent,
          role: audience?.role ?? "",
          preview: t.preview,
          unread: t.unread,
          needsReply: t.needsReply,
          lastAt: minutesAgo(t.minutesAgo),
          strategyId: audience?.strategyId ?? null,
          ownerId: audience?.owner ?? null,
          signals: t.signals,
        };
      }),
    );

    const messageRows = THREADS.flatMap((t) =>
      t.messages.map((m, index) => ({
        id: `m_${t.id}_${index + 1}`,
        workspaceId: WORKSPACE_ID,
        threadId: t.id,
        from: m.from,
        channel: t.channel,
        body: m.body,
        sentAt: minutesAgo(m.minutesAgo),
        read: m.from === "us" || !t.unread,
      })),
    );
    await db.insert(messages).values(messageRows);

    await db.insert(tasks).values(
      TASKS.map((t) => ({
        id: t.id,
        workspaceId: WORKSPACE_ID,
        kind: t.kind,
        audienceId: t.audienceId,
        summary: t.summary,
        channel: t.channel,
        whenLabel: t.when,
        done: false,
      })),
    );

    const rollups = buildRollups();
    // Chunked: a single INSERT with 900 rows × 8 columns exceeds Postgres' parameter limit.
    for (let i = 0; i < rollups.length; i += 200) {
      await db.insert(dailyRollups).values(rollups.slice(i, i + 200));
    }

    console.log(
      [
        "Seeded workspace " + WORKSPACE_ID,
        `  users         ${TEAM.length}`,
        `  strategies     ${CAMPAIGNS.length}`,
        `  audiences         ${LEADS.length}`,
        `  threads       ${THREADS.length} (${messageRows.length} messages)`,
        `  tasks         ${TASKS.length}`,
        `  daily rollups ${rollups.length} (${ROLLUP_DAYS} days × 5 channels)`,
        "",
        `Sign in as ${OWNER_EMAIL}`,
      ].join("\n"),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
