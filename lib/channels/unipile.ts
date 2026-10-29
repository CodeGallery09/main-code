/**
 * Unipile, behind `LinkedInChannelAdapter`.
 *
 * Server-only: the API key is a full-access credential for every account the workspace has
 * connected, so it never reaches the browser. The request contract and the response readers live
 * in `unipileRequests.ts` (pure, tested); this file is the fetch, the auth header and the errors.
 */

import {
  ProviderError,
  type HostedAuthLink,
  type HostedAuthRequest,
  type LinkedInChannelAdapter,
  type ProviderAccount,
  type ProviderChat,
  type ProviderMessage,
  type ProviderProfile,
  type ProviderWebhook,
} from "./adapter";
import { readAccountStatus } from "./events";
import { WEBHOOK_HEADER } from "./webhookConfig";
import {
  hostedAuthBody,
  inviteBody,
  readAccount,
  readChats,
  readHostedAuthUrl,
  readMessages,
  readProfile,
  readWebhooks,
  unipileBaseUrl,
} from "./unipileRequests";

export type UnipileConfig = {
  dsn: string;
  apiKey: string;
};

/** Unipile has no documented per-request timeout; a hung call must not hold a serverless invocation. */
const TIMEOUT_MS = 15_000;

/** A profile read goes out to LinkedIn itself and is slower than our own API calls. */
const PROFILE_TIMEOUT_MS = 30_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export class UnipileAdapter implements LinkedInChannelAdapter {
  readonly provider = "unipile";
  private readonly base: string;

  constructor(private readonly config: UnipileConfig) {
    this.base = unipileBaseUrl(config.dsn);
  }

  private async call(path: string, init: { method: string; body?: unknown } = { method: "GET" }): Promise<unknown> {
    const response = await fetch(this.base + path, {
      method: init.method,
      headers: {
        "X-API-KEY": this.config.apiKey,
        accept: "application/json",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    }).catch((caught: unknown) => {
      // A network failure or timeout is the provider being unreachable, not a bug in the caller.
      throw new ProviderError(502, caught instanceof Error ? caught.message : "Could not reach the provider.");
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string"
          ? payload.detail
          : response.statusText;
      throw new ProviderError(response.status, detail || `Provider answered ${response.status}.`);
    }
    return payload;
  }

  async createHostedAuth(request: HostedAuthRequest): Promise<HostedAuthLink> {
    const payload = await this.call("/hosted/accounts/link", {
      method: "POST",
      body: hostedAuthBody(request, this.base),
    });
    const url = readHostedAuthUrl(payload);
    if (!url) throw new ProviderError(502, "The provider did not return a sign-in link.");
    return { url, expiresAt: request.expiresAt.toISOString() };
  }

  async getAccount(providerAccountId: string): Promise<ProviderAccount | null> {
    try {
      const payload = await this.call(`/accounts/${encodeURIComponent(providerAccountId)}`);
      return readAccount(payload, readAccountStatus);
    } catch (caught) {
      if (caught instanceof ProviderError && caught.status === 404) return null;
      throw caught;
    }
  }

  async deleteAccount(providerAccountId: string): Promise<void> {
    try {
      await this.call(`/accounts/${encodeURIComponent(providerAccountId)}`, { method: "DELETE" });
    } catch (caught) {
      // Already gone is the outcome the caller wanted.
      if (caught instanceof ProviderError && caught.status === 404) return;
      throw caught;
    }
  }

  /** `POST /chats` is the one Unipile route that takes multipart rather than JSON. */
  private async postForm(path: string, fields: Record<string, string | string[]>): Promise<unknown> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      // Unipile reads a repeated key as the array, which is how `attendees_ids` is sent.
      if (Array.isArray(value)) for (const one of value) form.append(key, one);
      else form.append(key, value);
    }
    const response = await fetch(this.base + path, {
      method: "POST",
      // No content-type header: fetch sets it with the multipart boundary.
      headers: { "X-API-KEY": this.config.apiKey, accept: "application/json" },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    }).catch((caught: unknown) => {
      throw new ProviderError(502, caught instanceof Error ? caught.message : "Could not reach the provider.");
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ProviderError(response.status, readError(payload) || `Provider answered ${response.status}.`);
    }
    return payload;
  }

  async getProfile(input: { accountId: string; identifier: string }): Promise<ProviderProfile | null> {
    const query = new URLSearchParams({ account_id: input.accountId, linkedin_sections: "*" });
    try {
      const response = await fetch(
        `${this.base}/users/${encodeURIComponent(input.identifier)}?${query.toString()}`,
        {
          headers: { "X-API-KEY": this.config.apiKey, accept: "application/json" },
          signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
          cache: "no-store",
        },
      ).catch((caught: unknown) => {
        throw new ProviderError(502, caught instanceof Error ? caught.message : "Could not reach the provider.");
      });
      const payload = await response.json().catch(() => null);
      // A profile the member cannot see is an answer, not a failure: the caller shows "not found".
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) throw new ProviderError(response.status, readError(payload) || `Provider answered ${response.status}.`);
      return readProfile(payload);
    } catch (caught) {
      if (caught instanceof ProviderError && (caught.status === 404 || caught.status === 403)) return null;
      throw caught;
    }
  }

  async sendInvite(input: { accountId: string; providerId: string; message?: string }): Promise<{ invitationId: string }> {
    const payload = await this.call("/users/invite", { method: "POST", body: inviteBody(input) });
    const root = isRecord(payload) ? payload : {};
    return { invitationId: text(root.invitation_id) || text(root.id) || "" };
  }

  async sendMessage(input: { accountId: string; providerId: string; text: string }): Promise<{ chatId: string; messageId: string }> {
    const payload = await this.postForm("/chats", {
      account_id: input.accountId,
      attendees_ids: [input.providerId],
      text: input.text,
    });
    const root = isRecord(payload) ? payload : {};
    return { chatId: text(root.chat_id), messageId: text(root.message_id) };
  }

  async listChats(input: { accountId: string; limit?: number }): Promise<ProviderChat[]> {
    const query = new URLSearchParams({ account_id: input.accountId, limit: String(input.limit ?? 30) });
    return readChats(await this.call(`/chats?${query.toString()}`));
  }

  async listMessages(input: { accountId: string; chatId: string; limit?: number }): Promise<ProviderMessage[]> {
    const query = new URLSearchParams({ account_id: input.accountId, limit: String(input.limit ?? 20) });
    return readMessages(
      await this.call(`/chats/${encodeURIComponent(input.chatId)}/messages?${query.toString()}`),
      input.chatId,
    );
  }

  async listWebhooks(): Promise<ProviderWebhook[]> {
    return readWebhooks(await this.call("/webhooks"));
  }

  async createWebhook(input: { source: string; requestUrl: string; secret: string }): Promise<ProviderWebhook> {
    // Unipile does not sign deliveries, so the only way to know a call is theirs is a secret header
    // we ask them to send back to us. `lib/channels/webhookAuth.ts` is the other half.
    const payload = await this.call("/webhooks", {
      method: "POST",
      body: {
        source: input.source,
        request_url: input.requestUrl,
        headers: [{ key: WEBHOOK_HEADER, value: input.secret }],
      },
    });
    const [created] = readWebhooks(Array.isArray(payload) ? payload : [payload]);
    return created ?? { id: "", source: input.source, requestUrl: input.requestUrl };
  }
}

/** Unipile puts the reason under `detail` on some routes and `message`/`title` on others. */
function readError(payload: unknown): string {
  if (!isRecord(payload)) return "";
  for (const key of ["detail", "message", "title", "error"]) {
    const found = payload[key];
    if (typeof found === "string" && found.trim()) return found.trim();
  }
  return "";
}

export { WEBHOOK_HEADER, WEBHOOK_QUERY_PARAM, WEBHOOK_SOURCES } from "./webhookConfig";
