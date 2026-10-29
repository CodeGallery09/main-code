/**
 * The pure half of the Unipile client: request bodies in, account shapes out.
 *
 * Split from `unipile.ts` so the request contract and the response reading are testable without a
 * network or an API key (`tests/unipile.test.mjs`). Import-free and erasable, so `node --test`
 * loads it directly.
 *
 * API shape, confirmed against Unipile's own documentation (v1):
 *   base      `https://{DSN}/api/v1`
 *   auth      `X-API-KEY: <key>`
 *   connect   `POST /hosted/accounts/link`  → `{ url }`
 *   account   `GET|DELETE /accounts/{id}`
 *   webhooks  `GET|POST /webhooks`
 *   profile   `GET /users/{identifier}?account_id=…`
 *   invite    `POST /users/invite`   `{ account_id, provider_id, message? }`, note ≤ 300 chars
 *   message   `POST /chats`          multipart/form-data, `attendees_ids[]` + `text`
 *   inbox     `GET /chats?account_id=…`, `GET /chats/{id}/messages`
 * The docs' own examples disagree between v1 and v2 on some field names, so the readers below
 * accept either spelling and the bodies send the v1 spelling, which is what `/api/v1` documents.
 */

import type {
  HostedAuthRequest,
  ProviderAccount,
  ProviderChat,
  ProviderMessage,
  ProviderProfile,
  ProviderRole,
  ProviderSchooling,
  ProviderWebhook,
} from "./adapter";
import type { ProviderAccountStatus } from "./events";

/** Unipile's provider key for LinkedIn. */
export const LINKEDIN_PROVIDER = "LINKEDIN";

/** `https://{dsn}/api/v1`, whether the DSN was given bare, with a scheme or with a trailing slash. */
export function unipileBaseUrl(dsn: string): string {
  const trimmed = dsn.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("UNIPILE_DSN is empty");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  // A DSN pasted straight from the dashboard sometimes already carries the API path.
  return withScheme.replace(/\/api\/v\d+$/i, "") + "/api/v1";
}

/**
 * The hosted-auth body. `api_url` is the base the wizard itself calls back on — Unipile requires
 * it — and `name` is the field it echoes to `notify_url`, which is how a connection finds its way
 * back to the workspace that asked for it.
 */
export function hostedAuthBody(request: HostedAuthRequest, apiUrl: string) {
  const body: Record<string, unknown> = {
    type: request.kind,
    api_url: apiUrl,
    expiresOn: request.expiresAt.toISOString(),
    success_redirect_url: request.successUrl,
    failure_redirect_url: request.failureUrl,
    notify_url: request.notifyUrl,
    name: request.reference,
  };
  if (request.kind === "reconnect") {
    if (!request.providerAccountId) throw new Error("reconnect needs a providerAccountId");
    body.reconnect_account = request.providerAccountId;
  } else {
    body.providers = [LINKEDIN_PROVIDER];
  }
  return body;
}

/* ---------- reading responses --------------------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function first(sources: unknown[], keys: string[]): string {
  for (const source of sources) {
    if (!isRecord(source)) continue;
    for (const key of keys) {
      const found = str(source[key]);
      if (found) return found;
    }
  }
  return "";
}

/** The hosted-auth URL, or "" when the answer did not contain one. */
export function readHostedAuthUrl(body: unknown): string {
  const nested = isRecord(body) ? [body, body.object, body.data] : [body];
  return first(nested, ["url", "hosted_auth_url", "link"]);
}

/**
 * One account. Unipile reports the connection state under `sources[].status` (per-provider) and,
 * on some responses, a flat `status`; both are read, and a source that is not OK wins, because an
 * account whose only source is broken is not usable.
 */
export function readAccount(body: unknown, readStatus: (raw: string) => ProviderAccountStatus): ProviderAccount | null {
  const root = isRecord(body) ? (isRecord(body.object) ? body.object : body) : null;
  if (!root) return null;
  const id = first([root], ["id", "account_id"]);
  if (!id) return null;

  const sources = Array.isArray(root.sources) ? root.sources : [];
  const rawStatuses = [
    ...sources.map((source) => (isRecord(source) ? str(source.status) : "")),
    first([root], ["status", "state"]),
  ].filter(Boolean);
  const statuses = rawStatuses.map(readStatus);
  // "ok" only when nothing reported anything else. No signal at all is an error, not health.
  const status: ProviderAccountStatus = statuses.find((s) => s !== "ok") ?? (statuses.length ? "ok" : "error");

  const rawStatus = rawStatuses.find((_, i) => statuses[i] !== "ok") ?? "";

  const connection = isRecord(root.connection_params) ? root.connection_params : null;
  const im = connection && isRecord(connection.im) ? connection.im : null;
  const publicId = first([im, root], ["public_identifier", "username", "email"]);

  return {
    id,
    status,
    rawStatus,
    name: first([root, im], ["name", "display_name", "account_name"]),
    handle: publicId ? (publicId.includes("/") ? publicId : `linkedin.com/in/${publicId}`) : "",
    createdAt: first([root], ["created_at", "createdAt"]),
  };
}

/** The webhook list, tolerating both `{ items: [] }` and a bare array. */
export function readWebhooks(body: unknown): ProviderWebhook[] {
  const rows = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.items) ? body.items : [];
  const out: ProviderWebhook[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = first([row], ["id", "webhook_id"]);
    if (!id) continue;
    out.push({
      id,
      source: first([row], ["source", "type", "event"]),
      requestUrl: first([row], ["request_url", "requestUrl", "url"]),
    });
  }
  return out;
}

/* ---------- sending and reading people ------------------------------------ */

/**
 * The bit of a LinkedIn URL the provider can look a person up by.
 *
 * A stored handle is whatever the operator typed or a file carried: a full URL, a bare slug, or
 * already a provider id. All three go to `GET /users/{identifier}`, so this only has to strip the
 * URL down to its last path segment and leave the other two alone.
 */
export function linkedInIdentifier(stored: string): string {
  const value = (stored ?? "").trim();
  if (!value) return "";
  // Already a provider id: LinkedIn's internal ids start ACo/ACw/AE and carry no slash.
  if (/^(ACo|ACw|AE)[A-Za-z0-9_-]+$/.test(value)) return value;
  const withoutQuery = value.split(/[?#]/)[0].replace(/\/+$/, "");
  const match = withoutQuery.match(/linkedin\.com\/(?:in|pub|profile\/view\?id=)\/?([^/]+)/i);
  if (match) return decodeURIComponent(match[1]);
  // A bare slug, or something we cannot read as a URL: hand it over as it is.
  return withoutQuery.includes("/") ? withoutQuery.split("/").filter(Boolean).pop() ?? "" : withoutQuery;
}

/** LinkedIn refuses an invitation note longer than this, so it is cut before it is sent. */
export const INVITE_NOTE_LIMIT = 300;

export function inviteBody(input: { accountId: string; providerId: string; message?: string }) {
  const note = (input.message ?? "").trim();
  return {
    account_id: input.accountId,
    provider_id: input.providerId,
    ...(note ? { message: note.slice(0, INVITE_NOTE_LIMIT) } : {}),
  };
}

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
      ? Number(value)
      : null;

const bool = (value: unknown): boolean => value === true || value === "true" || value === 1;

const list = (source: unknown, key: string): Record<string, unknown>[] => {
  const raw = isRecord(source) ? source[key] : null;
  const rows = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.items) ? raw.items : [];
  return rows.filter(isRecord);
};

/** "2021" + "Present" → "2021 - Present". Either side may be missing. */
function period(row: Record<string, unknown>): string {
  const from = first([row], ["start", "start_date", "starts_at", "date_start", "from"]);
  const to = first([row], ["end", "end_date", "ends_at", "date_end", "to"]);
  if (from && to) return `${from} - ${to}`;
  if (from) return `${from} - Present`;
  return to;
}

/**
 * One person's profile.
 *
 * Unipile's own field names differ between versions and between the preview and full forms of a
 * section, so every field is read from each documented spelling — the same rule `events.ts`
 * follows. A profile missing a `provider_id` is useless (nothing can be sent to it), so it reads
 * as `null` rather than as a half-filled person.
 */
export function readProfile(body: unknown): ProviderProfile | null {
  const root = isRecord(body) ? (isRecord(body.object) ? body.object : body) : null;
  if (!root) return null;
  const providerId = first([root], ["provider_id", "providerId", "id", "member_id"]);
  if (!providerId) return null;

  const firstName = first([root], ["first_name", "firstName"]);
  const lastName = first([root], ["last_name", "lastName"]);
  const name = [firstName, lastName].filter(Boolean).join(" ") || first([root], ["name", "display_name", "full_name"]);
  const publicIdentifier = first([root], ["public_identifier", "publicIdentifier", "username"]);

  const experience: ProviderRole[] = list(root, "work_experience")
    .concat(list(root, "experience"))
    .map((row) => ({
      title: first([row], ["position", "title", "role"]),
      company: first([row], ["company", "company_name", "organisation", "organization"]),
      period: period(row),
      location: first([row], ["location"]),
      description: first([row], ["description", "summary"]),
    }))
    .filter((row) => row.title || row.company);

  const education: ProviderSchooling[] = list(root, "education").map((row) => ({
    school: first([row], ["school", "school_name", "institution"]),
    degree: first([row], ["degree", "degree_name"]),
    field: first([row], ["field_of_study", "field", "fieldOfStudy"]),
    period: period(row),
  }));

  const skills = list(root, "skills")
    .map((row) => first([row], ["name", "skill", "title"]))
    .filter(Boolean);

  // A role with no end date is the current one; otherwise the newest listed role is the best guess.
  const current = experience.find((role) => /present|current/i.test(role.period)) ?? experience[0];
  const location = first([root], ["location", "city", "geo"]) || first([isRecord(root.primary_locale) ? root.primary_locale : null], ["country"]);

  return {
    providerId,
    publicIdentifier,
    name,
    headline: first([root], ["headline", "occupation"]),
    summary: first([root], ["summary", "about", "description"]),
    location,
    company: first([root], ["company", "current_company"]) || current?.company || "",
    title: first([root], ["job_title", "current_position"]) || current?.title || "",
    profileUrl:
      first([root], ["public_profile_url", "profile_url", "url"]) ||
      (publicIdentifier ? `https://www.linkedin.com/in/${publicIdentifier}` : ""),
    degree: num(isRecord(root) ? root.network_distance : null) ?? degreeWord(first([root], ["network_distance", "networkDistance"])),
    followers: num(isRecord(root) ? (root.follower_count ?? root.followers_count) : null),
    isPremium: bool(root.is_premium),
    isOpenToWork: bool(root.is_open_to_work),
    isHiring: bool(root.is_hiring),
    experience,
    education,
    skills,
  };
}

/** Unipile reports the connection degree as a number on some responses and "DISTANCE_1" on others. */
function degreeWord(raw: string): number {
  const match = raw.match(/(\d)/);
  return match ? Number(match[1]) : 0;
}

/** The chat list. `attendee_provider_id` is what ties a chat to a person we already know. */
export function readChats(body: unknown): ProviderChat[] {
  const rows = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.items) ? body.items : [];
  const out: ProviderChat[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = first([row], ["id", "chat_id"]);
    if (!id) continue;
    out.push({
      id,
      attendeeId: first([row], ["attendee_provider_id", "attendeeProviderId", "provider_id"]),
      name: first([row], ["name", "subject"]),
      unread: num(row.unread_count) ?? 0,
      lastAt: first([row], ["timestamp", "last_message_at", "updated_at"]),
    });
  }
  return out;
}

/**
 * The messages of one chat. `fromMe` decides whether a row is a reply or an echo of our own send,
 * so it is read from every spelling Unipile uses and defaults to "not ours" — counting a reply as
 * our own would hide it from the inbox, which is worse than showing one of ours.
 */
export function readMessages(body: unknown, chatId: string): ProviderMessage[] {
  const rows = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.items) ? body.items : [];
  const out: ProviderMessage[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = first([row], ["id", "message_id"]);
    if (!id) continue;
    const mine = row.is_sender ?? row.isSender ?? row.from_me ?? row.fromMe;
    out.push({
      id,
      chatId: first([row], ["chat_id", "chatId"]) || chatId,
      senderId: first([row], ["sender_id", "senderId", "author_id", "from"]),
      senderName: first([row], ["sender_name", "senderName", "author_name"]),
      text: first([row], ["text", "body", "message"]),
      sentAt: first([row], ["timestamp", "date", "sent_at", "created_at"]),
      fromMe: mine === true || mine === 1 || mine === "1" || mine === "true",
    });
  }
  return out;
}
