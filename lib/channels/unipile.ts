/**
 * Unipile, behind `LinkedInChannelAdapter`.
 *
 * Server-only: the API key is a full-access credential for every account the workspace has
 * connected, so it never reaches the browser. The request contract and the response readers live
 * in `unipileRequests.ts` (pure, tested); this file is the fetch, the auth header and the errors.
 */

import { ProviderError, type HostedAuthLink, type HostedAuthRequest, type LinkedInChannelAdapter, type ProviderAccount, type ProviderWebhook } from "./adapter";
import { readAccountStatus } from "./events";
import { WEBHOOK_HEADER } from "./webhookConfig";
import {
  hostedAuthBody,
  readAccount,
  readHostedAuthUrl,
  readWebhooks,
  unipileBaseUrl,
} from "./unipileRequests";

export type UnipileConfig = {
  dsn: string;
  apiKey: string;
};

/** Unipile has no documented per-request timeout; a hung call must not hold a serverless invocation. */
const TIMEOUT_MS = 15_000;

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

export { WEBHOOK_HEADER, WEBHOOK_SOURCES } from "./webhookConfig";
