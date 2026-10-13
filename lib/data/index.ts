/**
 * Repository factory — the one place that decides where app data comes from.
 *
 * `DATABASE_URL` set   → `PgRepository`, real persistence.
 * `DATABASE_URL` unset → `MemoryRepository` over the demo seed, so a bare clone and the
 *                        marketing pages still run with no services to configure.
 *
 * Nothing else in the codebase imports a concrete implementation. To move to another store,
 * implement `Repository` and return it here.
 */

import { MemoryRepository } from "@/lib/data/memory";
import { PgRepository } from "@/lib/data/pg";
import { hasDatabase } from "@/lib/db/client";
import type { Repository } from "@/lib/data/repository";

let instance: Repository | null = null;

export function getRepository(): Repository {
  if (!instance) instance = hasDatabase() ? new PgRepository() : new MemoryRepository();
  return instance;
}

/** True when reads and writes actually persist. The UI uses this to label demo data honestly. */
export const isPersistent = () => hasDatabase();

export type { Ctx, Repository } from "@/lib/data/repository";
