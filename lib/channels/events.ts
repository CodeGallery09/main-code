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
