/**
 * Repository factory — the one place that decides where app data comes from.
 *
 * Today it is the in-memory demo store. To move to a database, implement `Repository` against
 * your client (Prisma, Drizzle, a REST backend) and return it here behind an env var, e.g.:
 *
 *   const repo = process.env.DATABASE_URL ? new PrismaRepository() : new MemoryRepository();
 *
 * Nothing else in the codebase imports a concrete implementation.
 */

import { MemoryRepository } from "@/lib/data/memory";
import type { Repository } from "@/lib/data/repository";

let instance: Repository | null = null;

export function getRepository(): Repository {
  if (!instance) instance = new MemoryRepository();
  return instance;
}

export type { Repository } from "@/lib/data/repository";
