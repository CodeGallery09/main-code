/**
 * Typed browser client for the app's own REST API.
 *
 * Client components call these instead of `fetch` directly, so the URL shapes live in one place.
 * Server components can read the repository directly; both end up on the same data.
 */

import type {
  Analytics,
  Campaign,
  CampaignStatus,
  Lead,
  Message,
  Overview,
  Paged,
  Task,
  Thread,
  User,
  Workspace,
} from "@/lib/data/types";
import type { CampaignTotals } from "@/lib/data/repository";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "unknown",
      error?.message ?? "That request failed.",
    );
  }
  return payload as T;
}

/** Drops empty values so the query string only carries what was actually set. */
function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "" && value !== "all") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const api = {
  me: () => request<{ user: User; workspace: Workspace }>("/api/me"),

  workspace: () => request<{ workspace: Workspace }>("/api/workspace"),

  overview: (range = "30d") => request<Overview>(`/api/overview${qs({ range })}`),

  tasks: (kind = "all") => request<{ tasks: Task[] }>(`/api/tasks${qs({ kind })}`),

  completeTask: (id: string) =>
    request<{ task: Task }>(`/api/tasks/${encodeURIComponent(id)}/complete`, { method: "POST" }),

  campaigns: (params: { q?: string; status?: string; type?: string; channel?: string } = {}) =>
    request<{ items: Campaign[]; totals: CampaignTotals }>(`/api/campaigns${qs(params)}`),

  setCampaignStatus: (id: string, status: CampaignStatus) =>
    request<{ campaign: Campaign }>(`/api/campaigns/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  leads: (
    params: {
      q?: string;
      stage?: string;
      ownerId?: string;
      campaignId?: string;
      sort?: string;
      dir?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) => request<Paged<Lead>>(`/api/leads${qs(params)}`),

  lead: (id: string) => request<{ lead: Lead }>(`/api/leads/${encodeURIComponent(id)}`),

  threads: (params: { filter?: string; q?: string } = {}) =>
    request<{ threads: Thread[] }>(`/api/threads${qs(params)}`),

  thread: (id: string) =>
    request<{ thread: Thread; messages: Message[] }>(`/api/threads/${encodeURIComponent(id)}`),

  sendMessage: (id: string, channel: string, body: string) =>
    request<{ message: Message }>(`/api/threads/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ channel, body }),
    }),

  analytics: (params: { range?: string; channels?: string } = {}) =>
    request<Analytics>(`/api/analytics${qs(params)}`),
};
