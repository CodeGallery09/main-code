/**
 * The one Postgres pool.
 *
 * Next.js reloads modules in dev and runs route handlers in short-lived invocations in
 * production, so a pool created at module scope would be recreated constantly and leak
 * connections. It is cached on `globalThis` instead — the standard fix.
 *
 * **Use a pooled connection string.** Neon's pooled endpoint (and Supabase's pgBouncer port)
 * exist because serverless invocations open far more connections than Postgres allows; the direct
 * endpoint will exhaust `max_connections` under any real traffic. `max: 5` here is per-instance,
 * deliberately small for the same reason.
 *
 * `pg` is used rather than a provider-specific driver so the same code runs against Neon, local
 * Postgres in a container, or anything else that speaks the protocol. That portability is the
 * reason for choosing Neon in the first place — don't trade it away for a marginal cold start.
 */

import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __fpPool?: Pool; __fpDb?: Db };

export function databaseUrl(): string | null {
  return process.env.DATABASE_URL?.trim() || null;
}

/** True when a database is configured. `getRepository()` uses this to pick an implementation. */
export const hasDatabase = () => databaseUrl() !== null;

export function getDb(): Db {
  if (globalForDb.__fpDb) return globalForDb.__fpDb;

  const url = databaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example — the app falls back to the demo store.");
  }

  const pool =
    globalForDb.__fpPool ??
    new Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      // Hosted Postgres requires TLS; local containers usually have no certificate.
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true },
    });

  // A pool-level error listener is mandatory: without one, an idle client dropped by the
  // server raises an unhandled 'error' event and takes the whole process down.
  pool.on("error", (error) => console.error("[db] idle client error", error));

  const db = drizzle(pool, { schema });
  globalForDb.__fpPool = pool;
  globalForDb.__fpDb = db;
  return db;
}
