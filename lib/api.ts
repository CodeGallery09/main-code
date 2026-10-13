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
import type { CampaignPatch, LeadPatch } from "@/lib/data/validate";
import type { MappingReport, Segment, UploadPreview } from "@/lib/leads/segments";
import type { Mapping } from "@/lib/leads/validation";

/** Field errors a 422 carries, keyed by field name — what the forms render inline. */
export type FieldErrors = Record<string, string>;

/** Pulls the per-field errors off an ApiError, or null when it was not a validation failure. */
export const fieldErrorsOf = (error: unknown): FieldErrors | null =>
  error instanceof ApiError && error.fields ? error.fields : null;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Present on a 422: per-field messages the form shows next to each input. */
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    // FormData sets its own content type (with the multipart boundary), so only JSON bodies get one.
    headers:
      typeof init?.body === "string" ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (
      payload as {
        error?: { code?: string; message?: string; fields?: Record<string, string> };
      } | null
    )?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "unknown",
      error?.message ?? "That request failed.",
      error?.fields,
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

  createCampaign: (input: CampaignPatch) =>
    request<{ campaign: Campaign }>("/api/campaigns", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateCampaign: (id: string, patch: CampaignPatch) =>
    request<{ campaign: Campaign }>(`/api/campaigns/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteCampaign: (id: string) =>
    request<{ deleted: string }>(`/api/campaigns/${encodeURIComponent(id)}`, { method: "DELETE" }),

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

  createLead: (input: LeadPatch) =>
    request<{ lead: Lead }>("/api/leads", { method: "POST", body: JSON.stringify(input) }),

  updateLead: (id: string, patch: LeadPatch) =>
    request<{ lead: Lead }>(`/api/leads/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteLead: (id: string) =>
    request<{ deleted: string }>(`/api/leads/${encodeURIComponent(id)}`, { method: "DELETE" }),

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

  /** Sends the file itself; the server parses it and returns the preview. */
  uploadLeadFile: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<UploadPreview>("/api/leads/uploads", { method: "POST", body: form });
  },

  validateUpload: (uploadId: string, mapping: Mapping) =>
    request<MappingReport>(`/api/leads/uploads/${encodeURIComponent(uploadId)}/validate`, {
      method: "POST",
      body: JSON.stringify({ mapping }),
    }),

  segments: () => request<{ segments: Segment[] }>("/api/leads/segments"),

  createSegment: (input: { uploadId: string; name: string; description: string; mapping: Mapping }) =>
    request<{ segment: Segment; profilesCreated: number; profilesMerged: number }>("/api/leads/segments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
