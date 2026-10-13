import type { Config } from "drizzle-kit";

/**
 * drizzle-kit reads this for `db:generate` and `db:migrate`.
 *
 * Migrations are files in drizzle/, committed to the repo — never `db:push` against a deployed
 * database. Generated SQL is reviewable in a diff; a push is an unreviewable schema mutation.
 */
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
} satisfies Config;
