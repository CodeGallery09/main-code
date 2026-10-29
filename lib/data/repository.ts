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

import type { InJourneyRow } from "@/lib/audiences/merge";
import type { MappingReport, Segment, UploadPreview } from "@/lib/audiences/segments";
import type { Mapping, ParsedAudience } from "@/lib/audiences/validation";
import type { Table } from "@/lib/audiences/table";

import type {
  AccountActivity,
  AccountsSnapshot,
  Analytics,
  Badges,
  Strategy,
  StrategyStatus,
  StrategyType,
  Channel,
  ChannelAccount,
  ConnectSession,
  Audience,
  AudienceQuery,
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
  LaunchResult,
  RunSummary,
  Journeys,
} from "@/lib/data/types";
import type { LinkedInExtra } from "@/lib/audiences/summary";
import type { ProviderProfile } from "@/lib/channels/adapter";
import type {
  AccountSettingsPatch,
  StrategyPatch,
  CompliancePatch,
  AudiencePatch,
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

export type StrategyQuery = {
  q?: string;
  status?: StrategyStatus | "all";
  type?: StrategyType | "all";
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

  listStrategies(ctx: Ctx, query: StrategyQuery): Promise<{ items: Strategy[]; totals: StrategyTotals }>;
  getStrategy(ctx: Ctx, id: string): Promise<Strategy | null>;

  listAudiences(ctx: Ctx, query: AudienceQuery): Promise<Paged<Audience>>;
  getAudience(ctx: Ctx, id: string): Promise<Audience | null>;

  /**
   * One prospect with everything recorded about them: company, journey (strategy and workflow
   * run), audiences, conversations, events, to-dos, and the timeline built from those rows by
   * `buildProspect` (lib/audiences/prospect.ts). `null` when the audience is not in this workspace.
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
   * A create whose `strategyId` names a strategy in another workspace must fail, not silently
   * null the field, so the caller learns the reference was rejected.
   */
  createAudience(ctx: Ctx, input: AudiencePatch): Promise<Audience | WriteError>;
  updateAudience(ctx: Ctx, id: string, patch: AudiencePatch): Promise<Audience | WriteError | null>;
  deleteAudience(ctx: Ctx, id: string): Promise<boolean>;

  createStrategy(ctx: Ctx, input: StrategyPatch): Promise<Strategy | WriteError>;
  updateStrategy(ctx: Ctx, id: string, patch: StrategyPatch): Promise<Strategy | WriteError | null>;
  deleteStrategy(ctx: Ctx, id: string): Promise<boolean>;
  /** Sugar over `updateStrategy`; kept because pausing is a one-click action in the UI. */
  setStrategyStatus(ctx: Ctx, id: string, status: StrategyStatus): Promise<Strategy | null>;

  sendMessage(ctx: Ctx, input: SendMessageInput): Promise<Message | null>;

  /* ----------------------------------------------------------- workflows -- */

  /** The strategy's workflow, or null when it has none yet (or the strategy is not yours). */
  getWorkflow(ctx: Ctx, strategyId: string): Promise<WorkflowRecord | null>;
  /** Every workflow in the workspace, for the library. */
  listWorkflows(ctx: Ctx): Promise<WorkflowRecord[]>;
  /**
   * Creates or replaces a strategy's workflow (one per strategy). `null` means the strategy does
   * not exist in this workspace; a `WriteError` means it exists but cannot have one — only a
   * multichannel strategy has a workflow. The graph must already have passed
   * `validateWorkflowGraph`.
   */
  saveWorkflow(
    ctx: Ctx,
    strategyId: string,
    input: { name: string; graph: WorkflowGraph },
  ): Promise<WorkflowRecord | WriteError | null>;

  /* ------------------------------------------------------------------ engine -- */

  /**
   * Starts a strategy, or resumes a paused one: puts the audiences its first step points at into
   * the plan (skipping anyone already in another strategy, or without consent), queues their first
   * step and marks the strategy live. **It really sends**, within consent, the daily caps and the
   * plan's window. `null` when the
   * strategy is not yours; a `WriteError` when it cannot start (the demo strategy, no plan, no
   * steps, nobody to enrol).
   */
  launchStrategy(ctx: Ctx, id: string): Promise<LaunchResult | WriteError | null>;
  /**
   * Runs every step that is due in this workspace, for strategies that are live: logs what a step
   * would send, adds a to-do for a call step, queues the next step. Returns how many it ran.
   */
  runDueSteps(ctx: Ctx, limit?: number): Promise<{ processed: number }>;
  /** Where the strategy's audiences are in its plan, or null when the strategy is not yours. */
  runSummary(ctx: Ctx, id: string): Promise<RunSummary | null>;

  /* ----------------------------------------------------------- lead profile -- */

  /**
   * The lead's LinkedIn handle and whatever has already been read from their profile. `null` when
   * the lead is not yours. The provider call itself is the route's job, not the store's.
   */
  audienceLinkedIn(ctx: Ctx, id: string): Promise<{ handle: string; name: string; stored: LinkedInExtra } | null>;

  /** Stores a profile read: the briefing, the provider id, and company/title where they were blank. */
  saveAudienceLinkedIn(ctx: Ctx, id: string, profile: ProviderProfile): Promise<LinkedInExtra | null>;

  /**
   * Leads with a LinkedIn URL whose profile has never been read, oldest first, and how many are
   * waiting in all. An upload can bring in hundreds at once, so the briefings are filled in
   * afterwards, a few at a time, rather than holding up the save or waiting for a person to click.
   */
  pendingBriefings(ctx: Ctx, limit: number): Promise<{ ids: string[]; pending: number }>;
  /**
   * Every launched strategy's journey (per-step reach, who is where) and the touchpoints made in
   * the range. Read from the run records and their log, so it moves as the plan runs.
   */
  getJourneys(ctx: Ctx, range: RangeKey): Promise<Journeys>;

  /**
   * Makes sure the workspace has the demo strategy: one multichannel strategy with its audiences,
   * conversations, to-dos and funnel, all flagged sample. Every workspace has it and nothing
   * removes it, so this is a no-op once it exists. Safe to call on every request and under
   * concurrency: two first loads never seed it twice.
   */
  ensureDemo(ctx: Ctx): Promise<void>;

  /* ------------------------------------------------- org-level channel accounts -- */

  /** Every LinkedIn account and mailbox the workspace has, with the strategies that use each. */
  listAccounts(ctx: Ctx): Promise<AccountsSnapshot>;
  /**
   * Changes the dials of one account (daily caps, rotation). `null` when it is not yours; a
   * `WriteError` for a value the account cannot take.
   */
  updateAccount(ctx: Ctx, id: string, patch: AccountSettingsPatch): Promise<ChannelAccount | WriteError | null>;
  /**
   * Replaces the set of strategies that send from an account. Accounts belong to the workspace,
   * not to a strategy, so this is many to many for both channels. A strategy id from another
   * workspace is a `WriteError`, never silently dropped.
   */
  setAccountStrategies(ctx: Ctx, id: string, strategyIds: string[]): Promise<ChannelAccount | WriteError | null>;
  /**
   * Removes an account from the workspace. The caller disconnects it at the provider first, so
   * this is the local half only. `null` when the account is not yours.
   */
  deleteAccount(ctx: Ctx, id: string): Promise<{ deleted: string } | null>;
  /**
   * What has happened on each of the workspace's connected accounts, counted from the event log
   * over `windowDays`. Real counts only — an account that has done nothing reads zero.
   */
  accountActivity(ctx: Ctx, windowDays: number): Promise<AccountActivity[]>;

  /* --------------------------------------------- connecting a channel account -- */

  /**
   * Opens a connect attempt and returns it. Its id is the reference handed to the provider; the
   * provider hands it back on its callback, and that is the only thing tying a provider account to
   * this workspace. `null` when `accountId` is given but is not this workspace's.
   */
  createConnectSession(
    ctx: Ctx,
    input: { channel: Channel; provider: string; kind: "create" | "reconnect"; accountId?: string; ttlMinutes: number },
  ): Promise<ConnectSession | null>;
  /** One connect attempt of this workspace's, for the screen that is waiting on it. */
  getConnectSession(ctx: Ctx, id: string): Promise<ConnectSession | null>;

  /** The numbers on the rail badges. One cheap read, called on every navigation. */
  getBadges(ctx: Ctx): Promise<Badges>;

  /* ------------------------------------------------ audience uploads and segments -- */

  /**
   * Parks a parsed file so the mapping and summary steps don't have to upload it again. Stored in
   * the database (not process memory) because serverless instances do not share memory; parked
   * files older than an hour are discarded.
   */
  createUpload(ctx: Ctx, input: { fileName: string; fileSize: number; table: Table }): Promise<UploadPreview>;
  getUpload(ctx: Ctx, id: string): Promise<{ fileName: string; fileSize: number; table: Table } | null>;

  /**
   * Which of these rows are people already in a journey in another strategy: a match on any of
   * email, mobile, WhatsApp or LinkedIn with an audience who has a strategy. `strategyNames` resolves
   * the ids for the warning.
   */
  findInJourney(
    ctx: Ctx,
    audiences: ParsedAudience[],
  ): Promise<{ hits: InJourneyRow[]; strategyNames: Record<string, string> }>;

  /**
   * Every audience's name and contact keys, so the upload preview can say which rows match a prospect
   * the workspace already has — the same comparison `createSegment` makes when it saves.
   */
  listAudienceKeys(ctx: Ctx): Promise<{ id: string; name: string; email: string | null; mobile: string | null; whatsapp: string | null; linkedin: string | null }[]>;

  /** Newest first, each with its live `audienceCount`. */
  listSegments(ctx: Ctx): Promise<Segment[]>;
  getSegment(ctx: Ctx, id: string): Promise<Segment | null>;

  /**
   * Saves a validated upload as a segment. Rows already in a journey elsewhere are left out
   * (recomputed here, not trusted from the browser); the rest are merged into the workspace's audiences
   * by email, mobile, WhatsApp or LinkedIn, and linked to the segment. `consent` applies to audiences
   * this upload *creates*; it never upgrades the consent of an audience that already existed.
   */
  createSegment(
    ctx: Ctx,
    input: {
      uploadId: string;
      name: string;
      description: string;
      mapping: Mapping;
      report: MappingReport;
      audiences: ParsedAudience[];
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

/**
 * Workspace-wide sums over **every** strategy, the sample one included.
 *
 * No screen reads this. The Strategies tiles used to, and a workspace with one real strategy that
 * had sent nothing therefore displayed the demo's invented delivery and reply figures directly
 * above a row of "—". The tiles now sum the rows they are showing, so a filter narrows them and an
 * unproduced figure reads "—". Kept because it is part of the `/api/strategies` response shape; if
 * a screen ever wants it, exclude `isSample` rows first and keep zero distinguishable from unknown.
 */
export type StrategyTotals = {
  audiences: number;
  delivered: number;
  openRate: number | null;
  replyRate: number | null;
};
