/**
 * The storage seam.
 *
 * Every page and route handler talks to this interface and nothing else. Adding a real database
 * means writing one more class that implements `Repository` and returning it from
 * `getRepository()` in lib/data/index.ts — no other file changes.
 *
 * Every method is async and takes plain, serialisable arguments, so an implementation is free to
 * await the network. Methods return `null` rather than throwing when a row is missing; route
 * handlers turn that into a 404.
 *
 * **Every method takes `Ctx` first.** This is the single most important rule in the file. A
 * multi-tenant store that takes the workspace from ambient state will eventually serve one
 * tenant's rows to another — the bug is invisible in testing, because test data has one tenant.
 * Threading the workspace through the signature makes a cross-tenant read a type error instead.
 * Implementations must treat `ctx.workspaceId` as a mandatory filter on every read AND every
 * write, including by-id lookups: `WHERE id = $1 AND workspace_id = $2`. An id alone is a
 * guessable key, so a missing workspace predicate is an access-control hole, not an optimisation.
 */

import type { LeadProfile } from "@/lib/leads/merge";
import type { MappingReport, Segment, UploadPreview } from "@/lib/leads/segments";
import type { Mapping, ParsedLead } from "@/lib/leads/validation";
import type { Table } from "@/lib/leads/table";

import type {
  Analytics,
  Campaign,
  CampaignStatus,
  CampaignType,
  Channel,
  Lead,
  LeadQuery,
  Message,
  Overview,
  Paged,
  RangeKey,
  Task,
  TaskKind,
  Thread,
  User,
  WorkflowRecord,
  Workspace,
} from "@/lib/data/types";
import type { CampaignPatch, LeadPatch } from "@/lib/data/validate";
import type { WorkflowGraph } from "@/lib/app/workflow";

/**
 * Who is asking, and on whose behalf. Resolved from the session by lib/http.ts, never from a
 * request body or query parameter — a client-supplied workspace id is a tenancy bypass.
 */
export type Ctx = {
  workspaceId: string;
  userId: string;
};

export type CampaignQuery = {
  q?: string;
  status?: CampaignStatus | "all";
  type?: CampaignType | "all";
  channel?: Channel | "all";
  range?: RangeKey;
};

export type ThreadQuery = {
  /** "to-reply" is the inbox default: unresolved conversations waiting on us. */
  filter?: "to-reply" | "all";
  q?: string;
};

export type TaskQuery = {
  kind?: TaskKind | "all";
};

export type SendMessageInput = {
  threadId: string;
  channel: Channel;
  body: string;
};

export interface Repository {
  /* --------------------------------------------------------------- reads -- */

  getUser(ctx: Ctx): Promise<User | null>;
  getWorkspace(ctx: Ctx): Promise<Workspace | null>;

  /** Everything the dashboard home screen needs, in one round trip. */
  getOverview(ctx: Ctx, range: RangeKey): Promise<Overview | null>;

  listTasks(ctx: Ctx, query: TaskQuery): Promise<Task[]>;
  completeTask(ctx: Ctx, id: string): Promise<Task | null>;

  listCampaigns(ctx: Ctx, query: CampaignQuery): Promise<{ items: Campaign[]; totals: CampaignTotals }>;
  getCampaign(ctx: Ctx, id: string): Promise<Campaign | null>;

  listLeads(ctx: Ctx, query: LeadQuery): Promise<Paged<Lead>>;
  getLead(ctx: Ctx, id: string): Promise<Lead | null>;

  listThreads(ctx: Ctx, query: ThreadQuery): Promise<Thread[]>;
  getThread(ctx: Ctx, id: string): Promise<{ thread: Thread; messages: Message[] } | null>;

  getAnalytics(ctx: Ctx, range: RangeKey, channels: Channel[] | null): Promise<Analytics>;

  /* -------------------------------------------------------------- writes -- */

  /**
   * Inputs are the validated patches from lib/data/validate.ts — already shape-checked, so an
   * implementation only has to enforce what needs the database: references and uniqueness.
   * A create whose `campaignId` names a campaign in another workspace must fail, not silently
   * null the field, so the caller learns the reference was rejected.
   */
  createLead(ctx: Ctx, input: LeadPatch): Promise<Lead | WriteError>;
  updateLead(ctx: Ctx, id: string, patch: LeadPatch): Promise<Lead | WriteError | null>;
  deleteLead(ctx: Ctx, id: string): Promise<boolean>;

  createCampaign(ctx: Ctx, input: CampaignPatch): Promise<Campaign | WriteError>;
  updateCampaign(ctx: Ctx, id: string, patch: CampaignPatch): Promise<Campaign | WriteError | null>;
  deleteCampaign(ctx: Ctx, id: string): Promise<boolean>;
  /** Sugar over `updateCampaign`; kept because pausing is a one-click action in the UI. */
  setCampaignStatus(ctx: Ctx, id: string, status: CampaignStatus): Promise<Campaign | null>;

  sendMessage(ctx: Ctx, input: SendMessageInput): Promise<Message | null>;

  /* ----------------------------------------------------------- workflows -- */

  /** The campaign's workflow, or null when it has none yet (or the campaign is not yours). */
  getWorkflow(ctx: Ctx, campaignId: string): Promise<WorkflowRecord | null>;
  /** Every workflow in the workspace, for the library. */
  listWorkflows(ctx: Ctx): Promise<WorkflowRecord[]>;
  /**
   * Creates or replaces a campaign's workflow (one per campaign). `null` means the campaign does
   * not exist in this workspace; a `WriteError` means it exists but cannot have one — only a
   * multichannel campaign has a workflow. The graph must already have passed
   * `validateWorkflowGraph`.
   */
  saveWorkflow(
    ctx: Ctx,
    campaignId: string,
    input: { name: string; graph: WorkflowGraph },
  ): Promise<WorkflowRecord | WriteError | null>;

  /**
   * Deletes the sample campaign(s) and leads seeded at signup. Workflows go with their campaign.
   * Returns how many of each were removed; never touches anything the user created.
   */
  removeSampleData(ctx: Ctx): Promise<{ campaigns: number; leads: number }>;

  /* ------------------------------------------------ lead uploads and segments -- */

  /**
   * Parks a parsed file so the mapping and summary steps don't have to upload it
   * again. Uploads are scratch space: the memory store keeps them until the
   * server restarts, which the modal says out loud.
   */
  createUpload(ctx: Ctx, input: { fileName: string; fileSize: number; table: Table }): Promise<UploadPreview>;
  getUpload(ctx: Ctx, id: string): Promise<{ fileName: string; fileSize: number; table: Table } | null>;

  listSegments(ctx: Ctx): Promise<Segment[]>;
  getSegment(ctx: Ctx, id: string): Promise<Segment | null>;

  /** Saves a validated upload as a segment, merging its rows into lead profiles. */
  createSegment(
    ctx: Ctx,
    input: {
      uploadId: string;
      name: string;
      description: string;
      mapping: Mapping;
      report: MappingReport;
      leads: ParsedLead[];
    },
  ): Promise<{ segment: Segment; profilesCreated: number; profilesMerged: number } | null>;

  /** Profiles the uploads have built up, newest first; `segmentId` narrows to one segment. */
  listProfiles(ctx: Ctx, segmentId?: string): Promise<LeadProfile[]>;
}

/**
 * A write the store refused for a reason the caller should see — a dangling reference, a
 * duplicate. Distinct from `null` (row not found) and from a thrown error (a bug or an outage),
 * because those three map to different HTTP statuses: 422, 404 and 500.
 */
export type WriteError = { error: { field: string; message: string } };

export const isWriteError = (value: unknown): value is WriteError =>
  typeof value === "object" && value !== null && "error" in value;

export type CampaignTotals = {
  leads: number;
  delivered: number;
  openRate: number | null;
  replyRate: number | null;
};
