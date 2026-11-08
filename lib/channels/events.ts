/**
 * Normalising Unipile's webhook payloads.
 *
 * Unipile's v1 and v2 documentation describe the same two events with different envelopes: v1
 * wraps the account status in an `AccountStatus` object (`account_id`, `account_type`, `message`),
 * while v2 pages show `{ event, data }` / `{ event, payload }` and name the message event
 * `message.created`, `message.new` or `message_received` depending on the page. Rather than pick
 * one and break on the other, every handler goes through the readers below, which look for each
 * field in all the documented places and refuse the payload when the parts they need are absent.
 *
 * Import-free and erasable, so `node --test` can load it directly (see CLAUDE.md).
 */

/** What a connected account's state means for us, independent of the provider's vocabulary. */
export type ProviderAccountStatus =
  /** Connected and syncing: usable. */
  | "ok"
  /** The member must sign in again (expired cookie, password change, 2FA). */
  | "credentials"
  /** Signed in, but the provider is still syncing it. Neither usable yet nor the member's fault. */
  | "connecting"
  /** The provider restricted or suspended the account — a first-class product state. */
  | "restricted"
  /** Provider-side error or a stopped sync: not usable, not the member's fault. */
  | "error"
  /** The account was removed at the provider. */
  | "deleted";

export type AccountStatusEvent = {
  /** Unipile's own account id. */
  accountId: string;
  status: ProviderAccountStatus;
  /** The provider key Unipile reports, upper case (`LINKEDIN`, `GOOGLE`…), or "". */
  accountType: string;
  /** Whatever detail the payload carried, for the status line in the UI. Never invented. */
  detail: string;
};

export type MessageEvent = {
  accountId: string;
  /** Unipile's message id, used to make delivery idempotent. */
  messageId: string;
  chatId: string;
  /** Provider id of whoever sent it, when the payload names one. */
  senderId: string;
  /** Display name of the sender, when the payload names one. */
  senderName: string;
  text: string;
  /** ISO timestamp from the payload, or "" when it carried none. */
  sentAt: string;
  /** True when the payload says we sent it (so it is an echo of our own send, not a reply). */
  fromMe: boolean;
};

/* ---------- reading loosely-shaped JSON ----------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** The first non-empty string at any of `keys`, searched over every candidate object. */
function pick(sources: unknown[], keys: string[]): string {
  for (const source of sources) {
    if (!isRecord(source)) continue;
    for (const key of keys) {
      const found = str(source[key]);
      if (found) return found;
    }
  }
  return "";
}

/**
 * The objects a value might be hiding in: the body itself and the handful of envelope keys the
 * docs use (`AccountStatus`, `data`, `payload`, `event` when it is an object, `message`).
 */
function layers(body: unknown): unknown[] {
  const out: unknown[] = [body];
  if (!isRecord(body)) return out;
  for (const key of ["AccountStatus", "account_status", "data", "payload", "event", "message", "object"]) {
    const nested = body[key];
    if (isRecord(nested)) {
      out.push(nested);
      // One more level: v2 shows `{ event, data: { message: {...} } }`.
      for (const inner of ["message", "account", "data", "payload"]) {
        if (isRecord(nested[inner])) out.push(nested[inner]);
      }
    }
  }
  return out;
}

/* ---------- account status ------------------------------------------------ */

/**
 * Unipile's documented status words, mapped onto our five states. Anything unrecognised becomes
 * `error`: an account in a state we do not understand must not be treated as usable.
 */
export function readAccountStatus(raw: string): ProviderAccountStatus {
  const word = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!word) return "error";
  if (word === "OK" || word === "CONNECTED" || word === "RECONNECTED" || word === "SYNC_SUCCESS" || word === "CREATION_SUCCESS") return "ok";
  if (word === "CONNECTING" || word === "SYNCING" || word === "SYNC_IN_PROGRESS" || word === "PENDING") {
    return "connecting";
  }
  if (word === "CREDENTIALS" || word === "CREDENTIALS_ERROR" || word === "DISCONNECTED") return "credentials";
  if (word === "DELETED" || word === "DELETED_ACCOUNT") return "deleted";
  // LinkedIn restrictions arrive under several names across the docs and the dashboard.
  if (word.includes("RESTRICT") || word.includes("BLOCK") || word.includes("SUSPEND") || word === "CHECKPOINT") {
    return "restricted";
  }
  return "error";
}

/** `null` when the body does not carry an account id, which is the one field we cannot do without. */
export function parseAccountStatusEvent(body: unknown): AccountStatusEvent | null {
  const found = layers(body);
  const accountId = pick(found, ["account_id", "accountId", "id"]);
  if (!accountId) return null;

  // Explicit status fields first, across every layer, and only then `message` — which is where the
  // v1 `AccountStatus` envelope puts the status word. A generic key like `event` is deliberately
  // not consulted: `event: "account.status"` is the event's name, not the account's state, and
  // reading it as one would turn every v2 delivery into an unrecognised status.
  const raw = pick(found, ["status", "account_status", "state"]) || pick(found, ["message"]);
  const detail = pick(found, ["message", "detail", "description", "error"]);

  return {
    accountId,
    status: readAccountStatus(raw),
    accountType: pick(found, ["account_type", "accountType", "provider", "provider_name"]).toUpperCase(),
    // When `message` *was* the status word there is no human detail to show, only our own word
    // for it — and the UI already has that.
    detail: detail === raw ? "" : detail,
  };
}

/* ---------- new message --------------------------------------------------- */

const truthy = (value: unknown): boolean => value === true || value === "true" || value === 1;

/** `null` unless the body carries both an account id and a message id. */
export function parseMessageEvent(body: unknown): MessageEvent | null {
  const found = layers(body);
  const accountId = pick(found, ["account_id", "accountId"]);
  const messageId = pick(found, ["message_id", "messageId", "id"]);
  if (!accountId || !messageId) return null;

  // `from_me` / `is_sender` tell our own echo apart from an inbound reply. Unipile uses `is_sender`
  // as 1 for messages sent by the connected account.
  let fromMe = false;
  for (const source of found) {
    if (!isRecord(source)) continue;
    if (truthy(source.from_me) || truthy(source.fromMe) || truthy(source.is_sender)) fromMe = true;
  }

  return {
    accountId,
    messageId,
    chatId: pick(found, ["chat_id", "chatId", "thread_id", "conversation_id"]),
    senderId: pick(found, ["sender_id", "senderId", "attendee_provider_id", "from", "sender_attendee_id"]),
    senderName: pick(found, ["sender_name", "senderName", "attendee_name", "from_name"]),
    text: pick(found, ["text", "message", "body", "content", "snippet"]),
    sentAt: pick(found, ["timestamp", "sent_at", "date", "created_at", "occurred_at"]),
    fromMe,
  };
}

/* ---------- a LinkedIn invitation was accepted ---------------------------- */

/**
 * Unipile's `users` webhook, event `new_relation`: someone is now a first-degree connection of a
 * connected account — which, for a lead we invited, means they accepted.
 *
 * Unipile finds new relations by polling LinkedIn on its own schedule, so this can arrive hours
 * after the click. `lib/channels/relations.ts` also reads the relation list directly, through the
 * same writer, so a lost or unregistered webhook does not leave a plan blind.
 */
export type RelationEvent = {
  accountId: string;
  /** LinkedIn's internal member id (`ACoAA…`) — what an invite was addressed to. */
  providerId: string;
  /** The slug in `linkedin.com/in/<slug>`. */
  publicIdentifier: string;
  profileUrl: string;
  name: string;
};

/** `null` unless the body names the account and at least one way to identify the person. */
export function parseRelationEvent(body: unknown): RelationEvent | null {
  const found = layers(body);
  const accountId = pick(found, ["account_id", "accountId"]);
  const providerId = pick(found, ["user_provider_id", "provider_id", "member_id", "user_id"]);
  const publicIdentifier = pick(found, ["user_public_identifier", "public_identifier"]);
  const profileUrl = pick(found, ["user_profile_url", "public_profile_url", "profile_url"]);
  if (!accountId || (!providerId && !publicIdentifier && !profileUrl)) return null;
  const event = pick(found, ["event", "type"]);
  // The users webhook carries more than one kind of event; only a new relation means an acceptance.
  if (event && !/relation/i.test(event)) return null;
  return {
    accountId,
    providerId,
    publicIdentifier: publicIdentifier || slugOf(profileUrl),
    profileUrl,
    name: pick(found, ["user_full_name", "full_name", "name"]),
  };
}

/** The `<slug>` of `linkedin.com/in/<slug>`, lower-cased; "" for anything else. */
export function slugOf(url: string): string {
  const match = /linkedin\.com\/in\/([^/?#]+)/i.exec(url ?? "");
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
}

/* ---------- email: sent, received, moved ---------------------------------- */

export type EmailAddress = { email: string; name: string };

/**
 * One email, from the `email` webhook (`mail_sent`, `mail_received`, `mail_moved`) or read back
 * from `GET /emails`. Both describe an email the same way, so both go through this reader.
 */
export type EmailEvent = {
  /** `mail_sent` | `mail_received` | `mail_moved`, or "" when read from a listing. */
  event: string;
  accountId: string;
  /** Unipile's id for the email. Idempotency key, and what a reply is threaded on. */
  emailId: string;
  /** The `Message-ID` header. */
  messageId: string;
  /** Set on an email we sent with tracking; it is how a send is matched back to its lead. */
  trackingId: string;
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  /** Plain text: `body_plain` when the provider gives it, else the HTML with the tags stripped. */
  text: string;
  /** ISO, or "" when the payload carried none. */
  date: string;
  /** Folder role: `inbox`, `sent`, `spam`, … */
  role: string;
  folders: string[];
  /** Unipile id of the email this one answers, when it answers one. */
  inReplyTo: string;
};

function address(value: unknown): EmailAddress | null {
  if (typeof value === "string") {
    const match = /<([^>]+)>/.exec(value);
    const email = (match ? match[1] : value).trim().toLowerCase();
    return email.includes("@") ? { email, name: match ? value.slice(0, match.index).trim().replace(/^"|"$/g, "") : "" } : null;
  }
  if (!isRecord(value)) return null;
  const email = pick([value], ["identifier", "email", "address", "mail"]).toLowerCase();
  if (!email.includes("@")) return null;
  return { email, name: pick([value], ["display_name", "name"]) };
}

function addresses(value: unknown): EmailAddress[] {
  if (!Array.isArray(value)) {
    const one = address(value);
    return one ? [one] : [];
  }
  return value.map(address).filter((a): a is EmailAddress => a !== null);
}

/** HTML to readable text: block ends become line breaks, tags go, entities are decoded. */
export function htmlToText(html: string): string {
  return (html ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** `null` unless the body names the account and the email. */
export function parseEmailEvent(body: unknown): EmailEvent | null {
  const found = layers(body);
  const root = found.find((layer) => isRecord(layer) && ("email_id" in layer || "from_attendee" in layer)) ?? found[0];
  const accountId = pick(found, ["account_id", "accountId"]);
  const emailId = pick(found, ["email_id", "emailId", "id"]);
  if (!accountId || !emailId || !isRecord(root)) return null;

  const plain = pick([root], ["body_plain", "text"]);
  const html = typeof root.body === "string" ? root.body : "";
  const replyTo = isRecord(root.in_reply_to) ? root.in_reply_to : null;
  return {
    event: pick(found, ["event"]),
    accountId,
    emailId,
    messageId: pick([root], ["message_id", "messageId"]),
    trackingId: pick([root], ["tracking_id", "trackingId"]),
    from: address(root.from_attendee ?? root.from) ?? { email: "", name: "" },
    to: addresses(root.to_attendees ?? root.to),
    subject: pick([root], ["subject"]),
    text: plain || htmlToText(html),
    date: pick([root], ["date", "timestamp", "created_at"]),
    role: pick([root], ["role"]).toLowerCase(),
    folders: Array.isArray(root.folders) ? root.folders.filter((f): f is string => typeof f === "string") : [],
    inReplyTo: replyTo ? pick([replyTo], ["id", "email_id"]) : typeof root.in_reply_to === "string" ? root.in_reply_to : "",
  };
}

/**
 * A delivery-failure notice rather than a person writing back. Read from the sender and the
 * subject, which is where every mail server says it; the body is too free-form to trust.
 */
export function isBounce(email: { from: EmailAddress; subject: string }): boolean {
  const local = email.from.email.split("@")[0] ?? "";
  if (/^(mailer-daemon|postmaster|mail-daemon|bounce[s]?)$/i.test(local)) return true;
  return /(undeliver|delivery status notification|delivery has failed|mail delivery (failed|subsystem)|failure notice|returned mail|could not be delivered|address not found)/i.test(
    email.subject,
  );
}

/**
 * An out-of-office or other machine answer. It belongs on the thread, but it is not the person
 * replying, so it must not count as one — a condition waiting for a reply would take Yes on it.
 */
export function isAutoReply(email: { subject: string; text: string }): boolean {
  return /(out of (the )?office|automatic reply|auto[- ]?reply|autoreply|away from (the )?office|on (annual )?leave|vacation reply|abwesenheit)/i.test(
    email.subject,
  );
}

/** Every address mentioned in a text, lower-cased — used to find who a bounce was about. */
export function addressesIn(text: string): string[] {
  const found = (text ?? "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(found.map((a) => a.toLowerCase()))];
}

/* ---------- email tracking: opened, clicked ------------------------------- */

export type TrackingEvent = {
  kind: "opened" | "clicked";
  /** Unipile's tracking id, returned when the email was sent. */
  trackingId: string;
  /** The label we sent with the email: our own id for the send. */
  label: string;
  /** Unipile's id for this tracking event, for idempotency; "" when it gave none. */
  eventId: string;
  accountId: string;
  /** The link that was clicked. "" for an open. */
  url: string;
  date: string;
};

/** `null` unless it is an open or a click that names the send (tracking id or our label). */
export function parseTrackingEvent(body: unknown): TrackingEvent | null {
  const found = layers(body);
  const event = pick(found, ["event", "type"]).toLowerCase();
  const kind = /click/.test(event) ? "clicked" : /open/.test(event) ? "opened" : null;
  if (!kind) return null;
  const trackingId = pick(found, ["tracking_id", "trackingId"]);
  const label = pick(found, ["label"]);
  if (!trackingId && !label) return null;
  return {
    kind,
    trackingId,
    label,
    eventId: pick(found, ["event_id", "eventId", "id"]),
    accountId: pick(found, ["account_id", "accountId"]),
    url: kind === "clicked" ? pick(found, ["url", "link", "target_url"]) : "",
    date: pick(found, ["date", "timestamp", "created_at"]),
  };
}
