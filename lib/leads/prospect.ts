/**
 * Builds a prospect's profile from the rows the repository read for them.
 *
 * Both stores (Postgres and the in-memory demo) read their own tables and hand the raw facts to
 * `buildProspect`, so the profile is assembled identically everywhere. Everything it returns is a
 * stored fact or a count of stored facts: messages, recorded events, to-dos, the upload that
 * brought the person in. Where nothing is recorded it returns empty lists and nulls, never a
 * placeholder figure — the UI says "nothing recorded yet" instead.
 *
 * Only type imports, so it loads directly under `node --test`.
 */

import type { Channel, Lead, ProspectProfile, ProspectTouch, TaskKind, Thread } from "../data/types";

export type ProspectFacts = {
  lead: Lead;
  createdAt: string | null;
  /** From `splitFileFields` in ./profile.ts. */
  companyFields: { label: string; value: string }[];
  otherFields: { label: string; value: string }[];
  campaign: ProspectProfile["journey"]["campaign"];
  run: ProspectProfile["journey"]["run"];
  audiences: ProspectProfile["audiences"];
  threads: {
    id: string;
    channel: Channel;
    intent: Thread["intent"];
    needsReply: boolean;
    lastAt: string;
    signals: { label: string; points: number }[];
  }[];
  messages: { id: string; threadId: string; from: "them" | "us"; channel: Channel; body: string; sentAt: string }[];
  events: { id: string; kind: string; channel: Channel | null; occurredAt: string }[];
  tasks: {
    id: string;
    kind: TaskKind;
    summary: string;
    channel: Channel;
    done: boolean;
    when: string;
    /** Null where the store does not keep it; such a to-do is listed but not placed on the timeline. */
    createdAt: string | null;
  }[];
  colleagues: { id: string; name: string; title: string }[];
  colleagueCount: number;
};

/** Personal mailboxes say nothing about where someone works. */
const PERSONAL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|pm|gmx|mail|yandex|zoho|fastmail|hey|tutanota|qq|163|126|rediffmail)\./;

/** `maya@northwind.example` -> "northwind.example"; a personal mailbox -> null. */
export function emailDomain(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const domain = email.split("@").pop()!.trim().toLowerCase();
  if (!domain || !domain.includes(".") || PERSONAL.test(domain)) return null;
  return domain;
}

const EVENT_LABEL: Record<string, string> = {
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked a link",
  replied: "Replied",
  bounced: "Bounced",
  unsubscribed: "Unsubscribed",
  meeting_booked: "Meeting booked",
  connection_accepted: "Accepted a connection request",
  profile_viewed: "Profile viewed",
};

/** "meeting_booked" -> "Meeting booked"; unknown kinds are shown as written, made readable. */
export function eventLabel(kind: string): string {
  if (EVENT_LABEL[kind]) return EVENT_LABEL[kind];
  const text = kind.replace(/[_-]+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "Event";
}

const SOURCE: Record<Lead["source"], string> = {
  form: "Added by hand",
  csv: "Added from an uploaded file",
  linkedin: "Added from LinkedIn",
  crm: "Added from a CRM",
  event: "Added from an event",
};

const clip = (text: string, max = 160) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
};

const latest = (values: (string | null | undefined)[]): string | null =>
  values.reduce<string | null>((best, v) => (v && (!best || v > best) ? v : best), null);

/** Within five minutes: an upload's prospects are created in the same transaction as the segment. */
const sameMoment = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) < 5 * 60_000;

export function buildProspect(f: ProspectFacts): ProspectProfile {
  const sent = f.messages.filter((m) => m.from === "us");
  const received = f.messages.filter((m) => m.from === "them");

  const channels = new Map<Channel, { sent: number; received: number }>();
  for (const m of f.messages) {
    const c = channels.get(m.channel) ?? { sent: 0, received: 0 };
    if (m.from === "us") c.sent++;
    else c.received++;
    channels.set(m.channel, c);
  }

  const eventCounts = new Map<string, number>();
  for (const e of f.events) eventCounts.set(e.kind, (eventCounts.get(e.kind) ?? 0) + 1);

  // A signal can be stored on several conversations; show it once, at its highest weight.
  const signals = new Map<string, number>();
  for (const t of f.threads) {
    for (const s of t.signals ?? []) signals.set(s.label, Math.max(signals.get(s.label) ?? -Infinity, s.points));
  }

  const timeline: ProspectTouch[] = [];
  const importedTogether = f.createdAt && f.audiences.some((a) => sameMoment(a.importedAt, f.createdAt!));
  if (f.createdAt && !importedTogether) {
    timeline.push({ id: "created", at: f.createdAt, kind: "created", channel: null, label: SOURCE[f.lead.source], detail: "" });
  }
  for (const a of f.audiences) {
    timeline.push({
      id: `aud_${a.id}`,
      at: a.importedAt,
      kind: "imported",
      channel: null,
      label: `Imported into “${a.name}”`,
      detail: a.fileName,
    });
  }
  for (const m of f.messages) {
    timeline.push({
      id: `msg_${m.id}`,
      at: m.sentAt,
      kind: m.from === "us" ? "message_out" : "message_in",
      channel: m.channel,
      label: m.from === "us" ? "Message sent" : "Reply received",
      detail: clip(m.body),
    });
  }
  for (const e of f.events) {
    timeline.push({ id: `ev_${e.id}`, at: e.occurredAt, kind: "event", channel: e.channel, label: eventLabel(e.kind), detail: "" });
  }
  for (const t of f.tasks) {
    if (!t.createdAt) continue;
    timeline.push({
      id: `task_${t.id}`,
      at: t.createdAt,
      kind: "task",
      channel: t.channel,
      label: t.done ? "To-do completed" : "To-do created",
      detail: clip(t.summary),
    });
  }
  timeline.sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? 1 : -1));

  return {
    lead: f.lead,
    createdAt: f.createdAt,
    company: {
      name: f.lead.company,
      domain: emailDomain(f.lead.email),
      facts: f.companyFields,
      colleagues: f.colleagues,
      colleagueCount: f.colleagueCount,
    },
    fileFields: f.otherFields,
    journey: { campaign: f.campaign, run: f.run },
    audiences: [...f.audiences].sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1)),
    engagement: {
      sent: sent.length,
      received: received.length,
      lastReplyAt: latest(received.map((m) => m.sentAt)),
      lastTouchAt: latest([...f.messages.map((m) => m.sentAt), ...f.events.map((e) => e.occurredAt)]),
      byChannel: [...channels].map(([channel, c]) => ({ channel, ...c })),
      events: [...eventCounts].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
      conversations: f.threads
        .map(({ id, channel, intent, needsReply, lastAt }) => ({ id, channel, intent, needsReply, lastAt }))
        .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)),
      signals: [...signals].map(([label, points]) => ({ label, points })).sort((a, b) => b.points - a.points),
    },
    timeline,
    tasks: f.tasks.map(({ id, kind, summary, channel, done, when }) => ({ id, kind, summary, channel, done, when })),
  };
}
