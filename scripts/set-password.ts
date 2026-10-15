/**
 * Resets one user's password: the recovery path while there is no email to send a reset link.
 *
 *   read -rs NEW_PASSWORD && export NEW_PASSWORD     # silent prompt; nothing lands in history
 *   npm run db:set-password -- tester@example.com
 *
 * The password comes from the environment, never argv: arguments show up in `ps` output and
 * shell history, and a password typed after `read -s` shows up in neither.
 *
 * It only ever *updates* an existing account — it will not create one, so a typo in the address
 * cannot mint a stray user — and it deletes that user's sessions, so a reset also signs out
 * anyone holding an old cookie. That second part is the point if the reason for the reset is
 * "someone else might have their password".
 *
 * Imports are relative with explicit `.ts` extensions because this runs under
 * `node --experimental-strip-types`, where the `@/` alias does not resolve (see CLAUDE.md).
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { sessions, users } from "../lib/db/schema.ts";
import { hashPassword } from "../lib/password.ts";
import { PASSWORD_MAX, PASSWORD_MIN } from "../lib/signup.ts";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const password = process.env.NEW_PASSWORD ?? "";

  if (!email) {
    console.error("Usage: NEW_PASSWORD=... npm run db:set-password -- someone@example.com");
    process.exit(1);
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    console.error(`NEW_PASSWORD must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: true },
  });
  const db = drizzle(pool);

  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      console.error(`No account for ${email}. Nothing was changed.`);
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
    });

    console.log(`Password updated for ${email}. Their existing sessions were signed out.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
