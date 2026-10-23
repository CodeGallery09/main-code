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

import type { InJourneyRow } from "@/lib/leads/merge";
import type { MappingReport, Segment, UploadPreview } from "@/lib/leads/segments";
import type { Mapping, ParsedLead } from "@/lib/leads/validation";
import type { Table } from "@/lib/leads/table";

import type {
  AccountsSnapshot,
  Analytics,
  Badges,
  Campaign,
  CampaignStatus,
  CampaignType,
  Channel,
  ChannelAccount,
  Lead,
  LeadQuery,
  Message,
  Overview,
  Paged,
  ProspectProfile,
  RangeKey,
  Task,
  TaskKind,
  Thread,
  User,
  WorkflowRecord,
  Workspace,
  WorkspaceSettings,
} from "@/lib/data/types";
import type {
  AccountSettingsPatch,
  CampaignPatch,
  CompliancePatch,
  LeadPatch,
  SendingRulesPatch,
  VariableFallbacksPatch,
} from "@/lib/data/validate";
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

/** A PATCH body for `/api/settings`: only the sections actually present are applied. */
export type SettingsPatch = {
  variableFallbacks?: VariableFallbacksPatch;
  sendingRules?: SendingRulesPatch;
  compliance?: CompliancePatch;
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

  /**
   * One prospect with everything recorded about them: company, journey (campaign and workflow
   * run), audiences, conversations, events, to-dos, and the timeline built from those rows by
   * `buildProspect` (lib/leads/prospect.ts). `null` when the lead is not in this workspace.
   */
  getProspect(ctx: Ctx, id: string): Promise<ProspectProfile | null>;

  listThreads(ctx: Ctx, query: ThreadQuery): Promise<Thread[]>;
  getThread(ctx: Ctx, id: string): Promise<{ thread: Thread; messages: Message[] } | null>;

  getAnalytics(ctx: Ctx, range: RangeKey, channels: Channel[] | null): Promise<Analytics>;

  /**
   * The three cross-channel Configuration tabs (Variables, Sending rules, Compliance). Always
   * returns a full row — a workspace that has never saved gets
   * `lib/app/configuration.ts#defaultWorkspaceSettings()`.
   */
  getSettings(ctx: Ctx): Promise<WorkspaceSettings>;
  /** Merges the given sections into the stored settings; a section left out is untouched. */
  updateSettings(ctx: Ctx, patch: SettingsPatch): Promise<WorkspaceSettings>;

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
   * Deletes everything seeded at signup as an example: the sample campaign (its workflow goes with
   * it), the sample leads (their threads, messages and to-dos go with them), the sample LinkedIn
   * account, mailbox and sending domain, and the sample figures. Returns how many campaigns and
   * leads were removed; never touches anything the user created.
   */
  removeSampleData(ctx: Ctx): Promise<{ campaigns: number; leads: number }>;

  /* ------------------------------------------------- org-level channel accounts -- */

  /** Every LinkedIn account and mailbox the workspace has, with the campaigns that use each. */
  listAccounts(ctx: Ctx): Promise<AccountsSnapshot>;
  /**
   * Changes the dials of one account (daily caps, rotation). `null` when it is not yours; a
   * `WriteError` for a value the account cannot take.
   */
  updateAccount(ctx: Ctx, id: string, patch: AccountSettingsPatch): Promise<ChannelAccount | WriteError | null>;
  /**
   * Replaces the set of campaigns that send from an account. Accounts belong to the workspace,
   * not to a campaign, so this is many to many for both channels. A campaign id from another
   * workspace is a `WriteError`, never silently dropped.
   */
  setAccountCampaigns(ctx: Ctx, id: string, campaignIds: string[]): Promise<ChannelAccount | WriteError | null>;

  /** The numbers on the rail badges. One cheap read, called on every navigation. */
  getBadges(ctx: Ctx): Promise<Badges>;

  /* ------------------------------------------------ lead uploads and segments -- */

  /**
   * Parks a parsed file so the mapping and summary steps don't have to upload it again. Stored in
   * the database (not process memory) because serverless instances do not share memory; parked
   * files older than an hour are discarded.
   */
  createUpload(ctx: Ctx, input: { fileName: string; fileSize: number; table: Table }): Promise<UploadPreview>;
  getUpload(ctx: Ctx, id: string): Promise<{ fileName: string; fileSize: number; table: Table } | null>;

  /**
   * Which of these rows are people already in a journey in another campaign: a match on any of
   * email, mobile, WhatsApp or LinkedIn with a lead who has a campaign. `campaignNames` resolves
   * the ids for the warning.
   */
  findInJourney(
    ctx: Ctx,
    leads: ParsedLead[],
  ): Promise<{ hits: InJourneyRow[]; campaignNames: Record<string, string> }>;

  /**
   * Every lead's name and contact keys, so the upload preview can say which rows match a prospect
   * the workspace already has — the same comparison `createSegment` makes when it saves.
   */
  listLeadKeys(ctx: Ctx): Promise<{ id: string; name: string; email: string | null; mobile: string | null; whatsapp: string | null; linkedin: string | null }[]>;

  /** Newest first, each with its live `leadCount`. */
  listSegments(ctx: Ctx): Promise<Segment[]>;
  getSegment(ctx: Ctx, id: string): Promise<Segment | null>;

  /**
   * Saves a validated upload as a segment. Rows already in a journey elsewhere are left out
   * (recomputed here, not trusted from the browser); the rest are merged into the workspace's leads
   * by email, mobile, WhatsApp or LinkedIn, and linked to the segment. `consent` applies to leads
   * this upload *creates*; it never upgrades the consent of a lead that already existed.
   */
  createSegment(
    ctx: Ctx,
    input: {
      uploadId: string;
      name: string;
      description: string;
      mapping: Mapping;
      report: MappingReport;
      leads: ParsedLead[];
      consent: boolean;
    },
  ): Promise<{ segment: Segment; profilesCreated: number; profilesMerged: number; excluded: number } | null>;
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
