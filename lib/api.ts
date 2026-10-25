/**
 * Typed browser client for the app's own REST API.
 *
 * Client components call these instead of `fetch` directly, so the URL shapes live in one place.
 * Server components can read the repository directly; both end up on the same data.
 */

import type {
  AccountActivity,
  AccountsSnapshot,
  Analytics,
  Badges,
  ChannelAccount,
  Campaign,
  ConnectSession,
  CampaignStatus,
  Lead,
  Message,
  Overview,
  Paged,
  ProspectProfile,
  Task,
  Thread,
  User,
  Workspace,
  WorkflowRecord,
  WorkspaceSettings,
} from "@/lib/data/types";
import type { CampaignTotals, SettingsPatch } from "@/lib/data/repository";
import type { WorkflowGraph } from "@/lib/app/workflow";
import type { AccountSettingsPatch, CampaignPatch, LeadPatch } from "@/lib/data/validate";
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
  /** Deletes the server-side session, then the caller navigates away. */
  logout: () => request<{ ok: true }>("/api/logout", { method: "POST" }),

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

  workflow: (campaignId: string) =>
    request<{ workflow: WorkflowRecord }>(`/api/campaigns/${encodeURIComponent(campaignId)}/workflow`),

  /** Replaces the workflow. The server validates the graph and answers 422 with the reason. */
  saveWorkflow: (campaignId: string, input: { name: string; graph: WorkflowGraph }) =>
    request<{ workflow: WorkflowRecord }>(`/api/campaigns/${encodeURIComponent(campaignId)}/workflow`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  workflows: () => request<{ items: WorkflowRecord[] }>("/api/workflows"),

  /** Deletes the sample campaign, workflow and leads the workspace started with. */
  removeSampleData: () =>
    request<{ removed: { campaigns: number; leads: number } }>("/api/workspace/sample", {
      method: "DELETE",
    }),

  accounts: () => request<AccountsSnapshot>("/api/accounts"),

  updateAccount: (id: string, patch: AccountSettingsPatch) =>
    request<{ account: ChannelAccount }>(`/api/accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  setAccountCampaigns: (id: string, campaignIds: string[]) =>
    request<{ account: ChannelAccount }>(`/api/accounts/${encodeURIComponent(id)}/campaigns`, {
      method: "PUT",
      body: JSON.stringify({ campaignIds }),
    }),

  deleteAccount: (id: string) =>
    request<{ deleted: string }>(`/api/accounts/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** What has actually happened on each connected account, counted from the event log. */
  accountActivity: (days = 30) => request<{ activity: AccountActivity[] }>(`/api/accounts/activity${qs({ days })}`),

  /**
   * Opens a hosted LinkedIn sign-in and returns its URL. With an account id it repairs that
   * connection instead of making a new one. 503 `not_configured` when the deployment has no
   * provider key — the caller shows that, rather than a generic failure.
   */
  connectLinkedIn: (accountId?: string) =>
    request<{ url: string; sessionId: string; expiresAt: string }>("/api/integrations/linkedin/connect", {
      method: "POST",
      body: JSON.stringify(accountId ? { accountId } : {}),
    }),

  /** How a connect attempt is going. The provider's callback lands on the server, so this polls. */
  connectSession: (id: string) =>
    request<{ session: ConnectSession }>(`/api/integrations/linkedin/connect/${encodeURIComponent(id)}`),

  badges: () => request<Badges>("/api/badges"),

  /** The Configuration screen's Variables, Sending rules and Compliance tabs. */
  getSettings: () => request<{ settings: WorkspaceSettings }>("/api/settings"),

  /** Only the sections present in `patch` are changed; the rest of the stored row is left alone. */
  updateSettings: (patch: SettingsPatch) =>
    request<{ settings: WorkspaceSettings }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  leads: (
    params: {
      q?: string;
      stage?: string;
      ownerId?: string;
      campaignId?: string;
      segmentId?: string;
      sort?: string;
      dir?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) => request<Paged<Lead>>(`/api/leads${qs(params)}`),

  lead: (id: string) => request<{ lead: Lead }>(`/api/leads/${encodeURIComponent(id)}`),

  prospect: (id: string) =>
    request<{ profile: ProspectProfile }>(`/api/leads/${encodeURIComponent(id)}/profile`),

  createLead: (input: LeadPatch) =>
    request<{ lead: Lead }>("/api/leads", { method: "POST", body: JSON.stringify(input) }),

  updateLead: (id: string, patch: LeadPatch) =>
    request<{ lead: Lead }>(`/api/leads/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteLead: (id: string) =>
    request<{ deleted: string }>(`/api/leads/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /**
   * Built by hand, not through `qs()`: that helper drops the value "all" as a default, but for
   * threads "all" is the opt-in and "to-reply" is what the server assumes when it is missing.
   */
  threads: (params: { filter?: "to-reply" | "all"; q?: string } = {}) => {
    const search = new URLSearchParams({ filter: params.filter ?? "to-reply" });
    if (params.q) search.set("q", params.q);
    return request<{ threads: Thread[] }>(`/api/threads?${search}`);
  },

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

  createSegment: (input: {
    uploadId: string;
    name: string;
    description: string;
    mapping: Mapping;
    /** The user's attestation that the people in the file may be contacted. */
    consent: boolean;
  }) =>
    request<{ segment: Segment; profilesCreated: number; profilesMerged: number; excluded: number }>("/api/leads/segments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
