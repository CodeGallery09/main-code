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
 * The docs' own examples disagree between v1 and v2 on some field names, so the readers below
 * accept either spelling and the bodies send the v1 spelling, which is what `/api/v1` documents.
 */

import type { HostedAuthRequest, ProviderAccount, ProviderWebhook } from "./adapter";
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

  const connection = isRecord(root.connection_params) ? root.connection_params : null;
  const im = connection && isRecord(connection.im) ? connection.im : null;
  const publicId = first([im, root], ["public_identifier", "username", "email"]);

  return {
    id,
    status,
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
