/**
 * Password hashing, kept separate from lib/auth.ts on purpose.
 *
 * Hashing has nothing to do with where users are stored, and this file imports nothing but
 * `node:crypto` — no `@/` aliases, only erasable syntax — so the seed script and `node --test`
 * can load it directly (see CLAUDE.md on the test runner's constraints). lib/auth.ts, which does
 * reach for the database, imports from here.
 *
 * scrypt rather than a bare SHA: it is deliberately slow and memory-hard, so a leaked `users`
 * table cannot be brute-forced at GPU speed. Node ships it, so this needs no dependency.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);

const KEYLEN = 64;
const SALT_BYTES = 16;

/** Stored as `salt:key`, both hex, with a fresh salt per password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = (await scrypt(password, salt, KEYLEN)) as Buffer;
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

/**
 * Constant-time comparison, so the time taken cannot reveal how much of the hash matched.
 * Returns false for a missing or malformed stored value rather than throwing, so a user row with
 * no password (an invited account that never set one) simply cannot sign in.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== KEYLEN) return false;

  const actual = (await scrypt(password, Buffer.from(saltHex, "hex"), KEYLEN)) as Buffer;
  return timingSafeEqual(actual, expected);
}
