/**
 * Registers (or re-points) the two Unipile webhooks this app serves.
 *
 *   UNIPILE_DSN=... UNIPILE_API_KEY=... UNIPILE_WEBHOOK_SECRET=... APP_URL=https://… \
 *     npm run unipile:webhooks
 *
 * Unipile does not sign webhook bodies, so the secret is registered two ways and
 * `lib/channels/webhookAuth.ts` accepts either: as a header this script asks the API to send back
 * (the clean path, used when the request succeeds), and as a `?token=` query param baked into the
 * callback URL itself (works regardless of whether Unipile's API honours the `headers` field for a
 * given webhook type — their dashboard UI, as of this writing, exposes no header field at all for
 * an "Account" webhook, so a webhook made by hand there has nowhere else to carry it). That makes
 * the secret the only thing standing between the endpoints and anyone who finds the URL — so it
 * goes in the environment, never argv (arguments show up in `ps` and shell history) and never a
 * committed file.
 *
 * Safe to re-run: a webhook already pointing at the same URL for the same source is left alone.
 * It never deletes one it did not recognise.
 *
 * Imports are relative with explicit `.ts` extensions, like the other scripts: this runs under
 * `node --experimental-strip-types`, where the `@/` alias does not resolve (see CLAUDE.md).
 */

import { unipileBaseUrl } from "../lib/channels/unipileRequests.ts";
import { WEBHOOK_HEADER, WEBHOOK_QUERY_PARAM, WEBHOOK_SOURCES } from "../lib/channels/webhookConfig.ts";

type Row = { id?: string; source?: string; request_url?: string; url?: string };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is not set. See .env.example.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const dsn = required("UNIPILE_DSN");
  const apiKey = required("UNIPILE_API_KEY");
  const secret = required("UNIPILE_WEBHOOK_SECRET");
  const origin = required("APP_URL").replace(/\/+$/, "");
  if (!origin.startsWith("https://")) {
    console.error("APP_URL must be an https URL the provider can reach — not localhost.");
    process.exit(1);
  }

  const base = unipileBaseUrl(dsn);
  const headers = { "X-API-KEY": apiKey, accept: "application/json" };

  const listed = await fetch(`${base}/webhooks`, { headers });
  if (!listed.ok) {
    console.error(`Could not list webhooks: ${listed.status} ${listed.statusText}`);
    process.exit(1);
  }
  const payload: unknown = await listed.json();
  const rows: Row[] = Array.isArray(payload)
    ? (payload as Row[])
    : payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)
      ? ((payload as { items: Row[] }).items)
      : [];

  for (const { source, path } of Object.values(WEBHOOK_SOURCES)) {
    // The query-param secret rides in the URL itself, so it is registered regardless of whether
    // Unipile's API (or its dashboard, for a webhook someone edits by hand later) honours the
    // `headers` field below for this source.
    const target = `${origin}${path}?${WEBHOOK_QUERY_PARAM}=${encodeURIComponent(secret)}`;
    const shown = `${origin}${path}?${WEBHOOK_QUERY_PARAM}=••••`;
    const already = rows.find((row) => row.source === source && (row.request_url ?? row.url) === target);
    if (already) {
      console.log(`✓ ${source} already points at ${shown}`);
      continue;
    }
    const created = await fetch(`${base}/webhooks`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        source,
        request_url: target,
        headers: [{ key: WEBHOOK_HEADER, value: secret }],
      }),
    });
    if (!created.ok) {
      console.error(`✗ ${source}: ${created.status} ${created.statusText} — ${await created.text()}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`+ ${source} → ${shown}`);
  }

  console.log("\nThe hosted-auth callback needs no registration: it is passed per sign-in as notify_url.");
  console.log(
    `\nIf Unipile's dashboard ever needs this done by hand (no header field in the UI for a\n` +
      `webhook type), paste the callback URL with the secret in its query string, e.g.:\n` +
      `  ${origin}/api/webhooks/unipile/accounts?${WEBHOOK_QUERY_PARAM}=<your UNIPILE_WEBHOOK_SECRET>`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
