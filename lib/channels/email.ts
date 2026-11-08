/**
 * What a connected mailbox reports, written into the workspace.
 *
 * Three provider feeds land here, each through one writer, from a webhook or from a pull:
 *
 * - **`email`** (`mail_received`, `mail_sent`) → `applyEmailEvent`. A reply from a lead goes on
 *   their Inbox thread and counts as a reply (which is what "If they replied" waits for); an
 *   out-of-office goes on the thread but does not count; a delivery failure becomes a bounce on the
 *   lead it was about, and the plan stops emailing that address. Our own sent mail is only used to
 *   learn the provider's id for it, which is what a follow-up is threaded on.
 * - **`email_tracking`** (`mail_opened`, `mail_link_clicked`) → `applyEmailTracking`. Matched to
 *   the exact send by the label we sent with it (our own event id), falling back to the provider's
 *   tracking id.
 * - **The pull** (`pullRecentEmails`) reads each mailbox's inbox on the scheduler's beat and hands
 *   every email to `applyEmailEvent`, so a workspace whose webhook is not registered still sees
 *   replies. Idempotent on the provider's email id, like the webhook.
 *
 * **Nobody is invented from an email.** Mail from an address that is not a lead is recorded as an
 * event and kept out of the Inbox, the same rule LinkedIn messages follow. The workspace comes from
 * the mailbox's provider account id, never from the body (see `inbound.ts`).
 *
 * Server-only.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  audiences as audiencesTable,
  channelAccounts,
  events as eventsTable,
  messages as messagesTable,
  threads as threadsTable,
} from "@/lib/db/schema";
import { ACCOUNT_EVENT, LEAD_EVENT } from "@/lib/data/accountEvents";
import { SENT_EVENT_KIND } from "@/lib/engine/steps";
import type { LinkedInChannelAdapter } from "./adapter";
import { addressesIn, isAutoReply, isBounce, type EmailEvent, type TrackingEvent } from "./events";
import { stripQuoted } from "./emailFormat";
import { resolveProviderAccount } from "./inbound";

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** A timestamp we can trust, or now: a malformed date must not become 1970 in the inbox. */
function at(raw: string): Date {
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

export type EmailResult =
  | { stored: true; kind: "reply" | "auto_reply" | "bounce" | "sent" | "unmatched" }
  | { stored: false; reason: "unknown_account" | "duplicate" | "own_mail" | "ignored" };

/* ---------- an email arrived, or one of ours was sent --------------------- */

export async function applyEmailEvent(provider: string, email: EmailEvent): Promise<EmailResult> {
  const found = await resolveProviderAccount(provider, email.accountId);
  if (!found || found.channel !== "email") return { stored: false, reason: "unknown_account" };
  const db = getDb();
  const mailbox = found.handle.toLowerCase();

  // One of ours, going out. Learn the provider's id for it so a follow-up can thread on it.
  const ours = email.event === "mail_sent" || email.role === "sent" || (mailbox && email.from.email === mailbox);
  if (ours) {
    if (!email.trackingId) return { stored: false, reason: "own_mail" };
    await db.execute(sql`
      update events set payload = payload || ${JSON.stringify({ emailId: email.emailId, messageId: email.messageId })}::jsonb
      where workspace_id = ${found.workspaceId} and kind = ${SENT_EVENT_KIND}
        and payload ->> 'trackingId' = ${email.trackingId}`);
    return { stored: true, kind: "sent" };
  }

  // A folder move is not news about a lead.
  if (email.event === "mail_moved") return { stored: false, reason: "ignored" };

  // Idempotent on the provider's id: the webhook retries, and the pull re-reads the same inbox.
  const [seen] = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.workspaceId, found.workspaceId),
        inArray(eventsTable.kind, [ACCOUNT_EVENT.message, LEAD_EVENT.bounced]),
        sql`${eventsTable.payload} ->> 'emailId' = ${email.emailId}`,
      ),
    )
    .limit(1);
  if (seen) return { stored: false, reason: "duplicate" };

  const when = at(email.date);

  if (isBounce(email)) {
    await recordBounce(found.workspaceId, found.accountId, email, when);
    return { stored: true, kind: "bounce" };
  }

  const [lead] = email.from.email
    ? await db
        .select({ id: audiencesTable.id, title: audiencesTable.title, strategyId: audiencesTable.strategyId })
        .from(audiencesTable)
        .where(
          and(
            eq(audiencesTable.workspaceId, found.workspaceId),
            sql`lower(${audiencesTable.email}) = ${email.from.email}`,
          ),
        )
        .limit(1)
    : [];

  const auto = isAutoReply(email);
  const body = stripQuoted(email.text) || email.text;
  const preview = (email.subject ? `${email.subject} — ${body}` : body).replace(/\s+/g, " ").slice(0, 160);

  await db.transaction(async (tx) => {
    if (lead) {
      const [open] = await tx
        .select({ id: threadsTable.id })
        .from(threadsTable)
        .where(
          and(
            eq(threadsTable.workspaceId, found.workspaceId),
            eq(threadsTable.audienceId, lead.id),
            eq(threadsTable.channel, "email"),
          ),
        )
        .limit(1);
      let threadId = open?.id ?? null;
      if (threadId) {
        await tx
          .update(threadsTable)
          .set({ preview, unread: true, needsReply: !auto, lastAt: when })
          .where(and(eq(threadsTable.id, threadId), eq(threadsTable.workspaceId, found.workspaceId)));
      } else {
        threadId = newId("th");
        await tx.insert(threadsTable).values({
          id: threadId,
          workspaceId: found.workspaceId,
          audienceId: lead.id,
          channel: "email",
          role: lead.title ?? "",
          preview,
          unread: true,
          needsReply: !auto,
          lastAt: when,
          strategyId: lead.strategyId,
        });
      }
      await tx.insert(messagesTable).values({
        id: newId("msg"),
        workspaceId: found.workspaceId,
        threadId,
        from: "them",
        channel: "email",
        body: email.subject ? `${email.subject}\n\n${body}` : body,
        sentAt: when,
        read: false,
      });
    }

    await tx.insert(eventsTable).values({
      id: newId("ev"),
      workspaceId: found.workspaceId,
      kind: ACCOUNT_EVENT.message,
      channel: "email",
      audienceId: lead?.id ?? null,
      strategyId: lead?.strategyId ?? null,
      payload: {
        accountId: found.accountId,
        emailId: email.emailId,
        // `messageId` is what the account-activity counts and the LinkedIn writer key on.
        messageId: email.emailId,
        subject: email.subject,
        from: email.from.email,
        autoReply: auto,
        matchedAudience: Boolean(lead),
      },
      occurredAt: when,
    });

    // A person writing back is the engagement that counts; a machine answering is not.
    if (lead && !auto) {
      const day = when.toISOString().slice(0, 10);
      await tx.execute(sql`
        insert into daily_rollups (workspace_id, day, channel, reached, engaged, replied, positive, meetings, is_sample)
        values (${found.workspaceId}, ${day}, 'email'::channel, 0, 1, 1, 0, 0, false)
        on conflict (workspace_id, day, channel, is_sample)
        do update set engaged = daily_rollups.engaged + 1, replied = daily_rollups.replied + 1`);
    }

    await tx
      .update(channelAccounts)
      .set({ lastEventAt: new Date() })
      .where(and(eq(channelAccounts.id, found.accountId), eq(channelAccounts.workspaceId, found.workspaceId)));
  });

  return { stored: true, kind: !lead ? "unmatched" : auto ? "auto_reply" : "reply" };
}

/**
 * A delivery failure names the address it could not reach somewhere in its text. Every lead we
 * have emailed whose address appears there is marked bounced — once per strategy — and the plan
 * stops emailing them. The notice itself is kept as an event so nothing is silently dropped.
 */
async function recordBounce(workspaceId: string, accountId: string, email: EmailEvent, when: Date): Promise<void> {
  const db = getDb();
  const named = addressesIn(`${email.subject}\n${email.text}`).filter((a) => !/mailer-daemon|postmaster/i.test(a));
  const leads = named.length
    ? await db
        .select({ id: audiencesTable.id, name: audiencesTable.name, email: audiencesTable.email, strategyId: audiencesTable.strategyId })
        .from(audiencesTable)
        .where(and(eq(audiencesTable.workspaceId, workspaceId), inArray(sql`lower(${audiencesTable.email})`, named)))
    : [];

  if (!leads.length) {
    await db.insert(eventsTable).values({
      id: newId("ev"),
      workspaceId,
      kind: LEAD_EVENT.bounced,
      channel: "email",
      payload: { accountId, emailId: email.emailId, subject: email.subject, matchedAudience: false },
      occurredAt: when,
    });
    return;
  }
  for (const lead of leads) {
    await db.insert(eventsTable).values({
      id: newId("ev"),
      workspaceId,
      kind: LEAD_EVENT.bounced,
      channel: "email",
      audienceId: lead.id,
      strategyId: lead.strategyId,
      payload: {
        accountId,
        emailId: email.emailId,
        address: lead.email,
        text: `An email to ${lead.name} bounced (${lead.email}). No more email goes to this address.`,
        matchedAudience: true,
      },
      occurredAt: when,
    });
  }
}

/* ---------- an email we sent was opened, or a link in it clicked ---------- */

export async function applyEmailTracking(
  provider: string,
  event: TrackingEvent,
): Promise<{ stored: boolean; reason?: "unknown_send" | "duplicate" | "wrong_workspace" }> {
  const db = getDb();
  // Our label is the sent event's own id: an exact lookup. The tracking id is the fallback.
  const [send] = event.label
    ? await db
        .select()
        .from(eventsTable)
        .where(and(eq(eventsTable.id, event.label), eq(eventsTable.kind, SENT_EVENT_KIND)))
        .limit(1)
    : [];
  const [byTracking] =
    send || !event.trackingId
      ? []
      : await db
          .select()
          .from(eventsTable)
          .where(and(eq(eventsTable.kind, SENT_EVENT_KIND), sql`${eventsTable.payload} ->> 'trackingId' = ${event.trackingId}`))
          .limit(1);
  const sent = send ?? byTracking;
  if (!sent) return { stored: false, reason: "unknown_send" };

  // Where the delivery names its mailbox, it must be a mailbox of the workspace the send belongs to.
  if (event.accountId) {
    const owner = await resolveProviderAccount(provider, event.accountId);
    if (owner && owner.workspaceId !== sent.workspaceId) return { stored: false, reason: "wrong_workspace" };
  }

  const kind = event.kind === "clicked" ? LEAD_EVENT.clicked : LEAD_EVENT.opened;
  const prior = await db
    .select({ kind: eventsTable.kind, payload: eventsTable.payload })
    .from(eventsTable)
    .where(
      and(
        eq(eventsTable.workspaceId, sent.workspaceId),
        inArray(eventsTable.kind, [LEAD_EVENT.opened, LEAD_EVENT.clicked]),
        sql`${eventsTable.payload} ->> 'sentEventId' = ${sent.id}`,
      ),
    );
  if (event.eventId && prior.some((p) => (p.payload as { eventId?: string }).eventId === event.eventId)) {
    return { stored: false, reason: "duplicate" };
  }
  // Mail clients and security scanners load the pixel more than once; one open per send is the
  // fact worth keeping. Every distinct click is kept, because which link was clicked matters.
  if (kind === LEAD_EVENT.opened && prior.some((p) => p.kind === LEAD_EVENT.opened)) {
    return { stored: false, reason: "duplicate" };
  }

  const [lead] = sent.audienceId
    ? await db
        .select({ name: audiencesTable.name })
        .from(audiencesTable)
        .where(and(eq(audiencesTable.id, sent.audienceId), eq(audiencesTable.workspaceId, sent.workspaceId)))
        .limit(1)
    : [];
  const who = lead?.name ?? "A lead";
  const subject = String((sent.payload as { subject?: unknown }).subject ?? "");
  const text =
    kind === LEAD_EVENT.clicked
      ? `${who} clicked ${event.url || "a link"} in “${subject}”.`
      : `${who} opened “${subject}”.`;

  await db.insert(eventsTable).values({
    id: newId("ev"),
    workspaceId: sent.workspaceId,
    kind,
    channel: "email",
    audienceId: sent.audienceId,
    strategyId: sent.strategyId,
    payload: { sentEventId: sent.id, trackingId: event.trackingId, eventId: event.eventId, url: event.url, text },
    occurredAt: at(event.date),
  });

  // The first sign of life on a send is one engaged person on the funnel; later ones are not more.
  if (!prior.length) {
    const day = at(event.date).toISOString().slice(0, 10);
    await db.execute(sql`
      insert into daily_rollups (workspace_id, day, channel, reached, engaged, replied, positive, meetings, is_sample)
      values (${sent.workspaceId}, ${day}, 'email'::channel, 0, 1, 0, 0, 0, false)
      on conflict (workspace_id, day, channel, is_sample)
      do update set engaged = daily_rollups.engaged + 1`);
  }
  return { stored: true };
}

/* ---------- the pull ------------------------------------------------------ */

/** A mailbox listing is cheap, but there is no reason to read one more often than this. */
const PULL_EVERY_MS = 2 * 60_000;
const lastPull = new Map<string, number>();

export type EmailPull = { checked: number; stored: number; mailboxes: number };

export async function pullRecentEmails(
  adapter: LinkedInChannelAdapter,
  workspaceId: string,
  options: { force?: boolean } = {},
): Promise<EmailPull> {
  const mailboxes = await getDb()
    .select({
      providerAccountId: channelAccounts.providerAccountId,
      connectedAt: channelAccounts.connectedAt,
    })
    .from(channelAccounts)
    .where(
      and(
        eq(channelAccounts.workspaceId, workspaceId),
        eq(channelAccounts.channel, "email"),
        eq(channelAccounts.provider, adapter.provider),
        eq(channelAccounts.state, "healthy"),
      ),
    );
  const result: EmailPull = { checked: 0, stored: 0, mailboxes: mailboxes.length };
  const now = Date.now();
  if (!mailboxes.length) return result;
  if (!options.force && now - (lastPull.get(workspaceId) ?? 0) < PULL_EVERY_MS) return result;
  lastPull.set(workspaceId, now);

  for (const box of mailboxes) {
    if (!box.providerAccountId) continue;
    let emails: EmailEvent[];
    try {
      emails = await adapter.listEmails({ accountId: box.providerAccountId, limit: 25 });
    } catch (caught) {
      console.error("[email] pull", workspaceId, caught);
      continue;
    }
    // Mail from before the mailbox was connected is history, not a reply to anything we sent.
    const since = box.connectedAt?.getTime() ?? 0;
    for (const email of emails) {
      if (email.date && at(email.date).getTime() < since) continue;
      result.checked += 1;
      const outcome = await applyEmailEvent(adapter.provider, { ...email, event: email.event || "mail_received" });
      if (outcome.stored && outcome.kind !== "sent") result.stored += 1;
    }
  }
  return result;
}
