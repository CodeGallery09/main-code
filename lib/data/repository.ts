/**
 * The storage seam.
 *
 * Every page and route handler talks to this interface and nothing else. Adding a real database
 * later means writing one more class that implements `Repository` (e.g. a Prisma or Drizzle
 * version) and returning it from `getRepository()` in lib/data/index.ts — no other file changes.
 *
 * Every method is async and takes plain, serialisable arguments, so an implementation is free to
 * await the network. Methods return `null` rather than throwing when a row is missing; route
 * handlers turn that into a 404.
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
  Workspace,
} from "@/lib/data/types";

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
  /** The signed-in user. `email` comes from the session, so a real store can scope by tenant. */
  getUser(email: string): Promise<User>;
  getWorkspace(): Promise<Workspace>;

  /** Everything the dashboard home screen needs, in one round trip. */
  getOverview(email: string, range: RangeKey): Promise<Overview>;

  listTasks(query: TaskQuery): Promise<Task[]>;
  completeTask(id: string): Promise<Task | null>;

  listCampaigns(query: CampaignQuery): Promise<{ items: Campaign[]; totals: CampaignTotals }>;
  getCampaign(id: string): Promise<Campaign | null>;
  setCampaignStatus(id: string, status: CampaignStatus): Promise<Campaign | null>;

  listLeads(query: LeadQuery): Promise<Paged<Lead>>;
  getLead(id: string): Promise<Lead | null>;

  listThreads(query: ThreadQuery): Promise<Thread[]>;
  getThread(id: string): Promise<{ thread: Thread; messages: Message[] } | null>;
  sendMessage(input: SendMessageInput): Promise<Message | null>;

  getAnalytics(range: RangeKey, channels: Channel[] | null): Promise<Analytics>;

  /* ---- lead uploads and segments ---------------------------------------- */

  /**
   * Parks a parsed file so the mapping and summary steps don't have to upload it
   * again. Uploads are scratch space: this one is in memory and goes when the
   * server restarts, which the modal says out loud.
   */
  createUpload(input: { fileName: string; fileSize: number; table: Table }): Promise<UploadPreview>;
  getUpload(id: string): Promise<{ fileName: string; fileSize: number; table: Table } | null>;

  listSegments(): Promise<Segment[]>;
  getSegment(id: string): Promise<Segment | null>;

  /** Saves a validated upload as a segment, merging its rows into lead profiles. */
  createSegment(input: {
    uploadId: string;
    name: string;
    description: string;
    mapping: Mapping;
    report: MappingReport;
    leads: ParsedLead[];
    createdBy: string;
  }): Promise<{ segment: Segment; profilesCreated: number; profilesMerged: number } | null>;

  /** Profiles the uploads have built up, newest first; `segmentId` narrows to one segment. */
  listProfiles(segmentId?: string): Promise<LeadProfile[]>;
}

export type CampaignTotals = {
  leads: number;
  delivered: number;
  openRate: number | null;
  replyRate: number | null;
};
