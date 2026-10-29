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
  LaunchResult,
  RunSummary,
  Journeys,
  Strategy,
  ConnectSession,
  StrategyStatus,
  Audience,
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
import type { StrategyTotals, SettingsPatch } from "@/lib/data/repository";
import type { WorkflowGraph } from "@/lib/app/workflow";
import type { AccountSettingsPatch, StrategyPatch, AudiencePatch } from "@/lib/data/validate";
import type { MappingReport, Segment, UploadPreview } from "@/lib/audiences/segments";
import type { Mapping } from "@/lib/audiences/validation";

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

  strategies: (params: { q?: string; status?: string; type?: string; channel?: string } = {}) =>
    request<{ items: Strategy[]; totals: StrategyTotals }>(`/api/strategies${qs(params)}`),

  setStrategyStatus: (id: string, status: StrategyStatus) =>
    request<{ strategy: Strategy }>(`/api/strategies/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  createStrategy: (input: StrategyPatch) =>
    request<{ strategy: Strategy }>("/api/strategies", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateStrategy: (id: string, patch: StrategyPatch) =>
    request<{ strategy: Strategy }>(`/api/strategies/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  /** Starts or resumes a strategy — a dry run, nothing is sent. 422 with the reason when it cannot start. */
  launchStrategy: (id: string) =>
    request<{ launch: LaunchResult; processed: number }>(`/api/strategies/${encodeURIComponent(id)}/launch`, {
      method: "POST",
    }),

  strategyRuns: (id: string) =>
    request<{ summary: RunSummary }>(`/api/strategies/${encodeURIComponent(id)}/runs`),

  /** Runs the steps that have come due; the screens call it while they are open. */
  runEngine: () => request<{ processed: number }>("/api/engine/run", { method: "POST" }),

  deleteStrategy: (id: string) =>
    request<{ deleted: string }>(`/api/strategies/${encodeURIComponent(id)}`, { method: "DELETE" }),

  workflow: (strategyId: string) =>
    request<{ workflow: WorkflowRecord }>(`/api/strategies/${encodeURIComponent(strategyId)}/workflow`),

  /** Replaces the workflow. The server validates the graph and answers 422 with the reason. */
  saveWorkflow: (strategyId: string, input: { name: string; graph: WorkflowGraph }) =>
    request<{ workflow: WorkflowRecord }>(`/api/strategies/${encodeURIComponent(strategyId)}/workflow`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  workflows: () => request<{ items: WorkflowRecord[] }>("/api/workflows"),

  accounts: () => request<AccountsSnapshot>("/api/accounts"),

  updateAccount: (id: string, patch: AccountSettingsPatch) =>
    request<{ account: ChannelAccount }>(`/api/accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  setAccountStrategies: (id: string, strategyIds: string[]) =>
    request<{ account: ChannelAccount }>(`/api/accounts/${encodeURIComponent(id)}/strategies`, {
      method: "PUT",
      body: JSON.stringify({ strategyIds }),
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

  audiences: (
    params: {
      q?: string;
      stage?: string;
      ownerId?: string;
      strategyId?: string;
      segmentId?: string;
      sort?: string;
      dir?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) => request<Paged<Audience>>(`/api/audiences${qs(params)}`),

  audience: (id: string) => request<{ audience: Audience }>(`/api/audiences/${encodeURIComponent(id)}`),

  prospect: (id: string) =>
    request<{ profile: ProspectProfile }>(`/api/audiences/${encodeURIComponent(id)}/profile`),

  createAudience: (input: AudiencePatch) =>
    request<{ audience: Audience }>("/api/audiences", { method: "POST", body: JSON.stringify(input) }),

  updateAudience: (id: string, patch: AudiencePatch) =>
    request<{ audience: Audience }>(`/api/audiences/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteAudience: (id: string) =>
    request<{ deleted: string }>(`/api/audiences/${encodeURIComponent(id)}`, { method: "DELETE" }),

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

  /** Launched strategies' journeys and the touchpoints in the range (dry-run figures while nothing sends). */
  journeys: (params: { range?: string } = {}) => request<{ journeys: Journeys }>(`/api/journeys${qs(params)}`),

  analytics: (params: { range?: string; channels?: string } = {}) =>
    request<Analytics>(`/api/analytics${qs(params)}`),

  /** Sends the file itself; the server parses it and returns the preview. */
  uploadAudienceFile: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<UploadPreview>("/api/audiences/uploads", { method: "POST", body: form });
  },

  validateUpload: (uploadId: string, mapping: Mapping) =>
    request<MappingReport>(`/api/audiences/uploads/${encodeURIComponent(uploadId)}/validate`, {
      method: "POST",
      body: JSON.stringify({ mapping }),
    }),

  segments: () => request<{ segments: Segment[] }>("/api/audiences/segments"),

  createSegment: (input: {
    uploadId: string;
    name: string;
    description: string;
    mapping: Mapping;
    /** The user's attestation that the people in the file may be contacted. */
    consent: boolean;
  }) =>
    request<{ segment: Segment; profilesCreated: number; profilesMerged: number; excluded: number }>("/api/audiences/segments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
