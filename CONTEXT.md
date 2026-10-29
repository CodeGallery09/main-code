# CONTEXT.md — codebase map

Orientation file for agents. Read this first; it replaces grepping the tree.
**Keep it current:** any change that adds a file, a route, a table or an architectural
rule must update this file in the same commit. See "Maintaining this file" at the end.

Last updated: 2026-10-25 · ~31k lines of source across 165 files.

---

## 1. What this is

**Flightpath** — GTM workflow-orchestration SaaS for SMB sales teams. Two products in one repo:

| Surface | Routes | Stylesheet | Data |
|---|---|---|---|
| Marketing site | `/`, `/book-demo`, `/login`, `/signup` | `app/globals.css` | none (static) + demo-request webhook |
| Signed-in workspace | `/dashboard/**` | `app/workspace.css` | `lib/data/` (repository) + `lib/ws/` + `lib/app/` (presentation) |

Stack: Next.js 15 App Router · React 19 · TS 5 (keep on 5.x) · Tailwind v4 (no config file,
theme lives in CSS) · ESLint 9 flat · Drizzle + Postgres · runtime deps are only
`lucide-react`, `drizzle-orm`, `pg`.

```bash
npm run dev            # localhost:3000 (check printed port — silently moves to 3001)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .
npm test               # node --test tests/*.test.mjs
npm run db:generate    # drizzle-kit generate  → drizzle/*.sql
npm run db:migrate     # apply migrations
npm run db:seed        # load demo rows
npm run unipile:webhooks   # register the two Unipile webhooks (needs UNIPILE_* + APP_URL)
```

---

## 2. The splits you must know

These are the only genuinely confusing things in the codebase. Everything else is ordinary.

### 2a. Two stylesheets, deliberately separate
`globals.css` (marketing) and `workspace.css` (workspace) are **not** shared. A redesign that put
the landing page on the workspace stylesheet was rolled back. `app/workspace.css` is imported by
`app/dashboard/layout.tsx` only.

The marketing site still implements an iOS "liquid glass" look (`globals.css` + `SiteGlass.tsx`).
**The workspace is the opposite**: flat white cards on a warm paper ground, hairline borders, one
near-black accent, **no shadows, gradients or glass** (the one exception is a 1px lift on the
active `Segmented` option). The old `app/app.css` — a vendored, multi-pass stylesheet with a
flattening block bolted on the end — is **deleted**; `app/workspace.css` (163L) replaced it and is
the whole token layer. See §5, "Workspace design system."

Its tokens are declared on **`.ws-root`, never `:root`** (the shell's outermost element), because
`globals.css` is loaded app-wide: declaring them globally would repaint the marketing pages.

### 2b. Two vocabularies, bridged by an adapter
| | `lib/data/` (canonical, DB-backed) | what some screens render (`lib/app/`) |
|---|---|---|
| Audience id | `"l_omar"` (string) | numeric in the old demo |
| Channel | `linkedin` `email` `whatsapp` `call` `sms` | `li` `mail` `wa` `call` `sms` |
| Strategy type | `standalone` `multichannel` | `single` `multi` |
| Audience stage | lowercase, 9 values | Capitalised, 9 values |

`lib/data/` is the real one. `lib/app/adapt.ts` maps between the two vocabularies for the screens
that still render the short channel keys and capitalised stages (Audiences, Strategies). **`lib/app/` no
longer holds any workspace data** — it is presentation helpers (`channels.ts`, `audiences.ts` stage
colours/score band/avatar tints, `strategies.ts` status tags), the workflow model, the integrations
catalogue and the Configuration rule defaults.

### 2c. Every workspace screen reads its own workspace
Home, Inbox, Audiences, Strategies (+ builder), Analytics and Setup all read through the repository /
REST API, so a workspace only ever sees its own rows.
**There is no demo content in the app except the demo strategy** (`lib/data/sample.ts` + `sampleSeed.ts`, §3):
one paused multichannel strategy and everything inside it (8 audiences, their conversations and
to-dos, its funnel by day), rows flagged `is_sample` and labelled "Sample" in the UI. **Every
workspace has it and nothing removes it**: signup seeds it, and `Repository.ensureDemo(ctx)`
(called by `app/dashboard/layout.tsx`) seeds it for any workspace that lacks one — an advisory
lock inside the transaction keeps concurrent first loads from seeding twice. It holds **no
accounts, mailboxes or domains**: those are the workspace's own. In the no-database demo mode (the
`dev` deployment) `MemoryRepository` is built from the same sample world (`lib/data/seed.ts`
derives from `sample.ts`), so dev shows what production shows. Home and Analytics carry a "Demo
figures" line (`shell/demo-note.tsx`) while it exists.

**The rule for new work:** a screen that needs data gets it from a repository method + an API
route. Never put figures, names, accounts or strategies in a component or in `lib/app/`.

### 2d. Six destinations, and one record is never two sections
`DASHBOARD_NAV` in `lib/nav.ts` carries **Home, Inbox, Audiences, Strategies, Analytics, Setup**, and the rail
and the phone sheet render the same six. There used to be nine, which did not fit a phone tab bar, so
below `lg` — where the rail is replaced by a top bar and a sheet — Configuration, Integrations
and Settings were unreachable on a phone. Two merges fixed that:

- **A multichannel strategy *is* its workflow** (same id, one stored graph), so there is no
  Workflows section. Strategies is the list; `/dashboard/workflows/[id]` is still the builder, and
  `/dashboard/workflows` redirects to Strategies.
- **Setup is Configuration + Integrations + Settings.** All three answered "what is connected and
  how does sending behave"; Settings held no controls at all, only read-only copies of the other
  two, and Integrations drew a tab strip across the three. `/dashboard/settings` and
  `/dashboard/integrations` redirect to `/dashboard/configuration`.

Analytics was a report Home linked to while the nav was a five-slot tab bar. The phone nav is a
sheet now, so it has its own place as the sixth destination.

**The rule for new work:** before adding a rail item, check the record it lists is not already
listed somewhere else under another name.

---

## 3. File map

### Storage seam — `lib/data/` (start here for anything data-related)
| File | L | Purpose |
|---|---|---|
| `types.ts` | 418 | Domain types, incl. `ProspectProfile`. Import-free + erasable (loadable by `node --test`). |
| `repository.ts` | 269 | **The interface every page and route talks to.** `Ctx` is the first arg of every method — tenancy cannot be forgotten. `WriteError` ≠ `null` ≠ throw → 422/404/500. |
| `index.ts` | 22 | `getRepository()` factory. Returns Postgres when `DATABASE_URL` is set, memory otherwise. |
| `memory.ts` | 1136 | In-memory impl over the seed. No-config fallback; writes last until restart. **All its mutable state lives on `globalThis` via `shared()`** (see §5). Workflows: a `Map` by strategy id, falling back to the demo `WORKFLOWS` matched on strategy name, so the seed's four multichannel strategies open a real graph. |
| `pg.ts` | 2654 | Postgres impl via Drizzle. Filters `workspace_id` on every read *and* write (the `ws()` helper). Audiences page in SQL; strategies aggregate in JS. Uploads, segments, accounts, workflows and the sample world are all real tables. **It is also the sender**: `sendingContext`, `claimDue`, `performSend`, `providerIdFor`, `storeProfile`, `recordOutbound`, `countReached` — see "Execution engine". |
| `seed.ts` | 213 | The `dev` (no-database) workspace, **derived from `sample.ts`**: one demo strategy, its audiences, threads, messages, tasks and per-channel rollup rows (`ROLLUPS`), and no accounts or domains. Exports the same shapes the repository returns, so `memory.ts` reads it like rows. |
| `sample.ts` | 195 | The demo strategy every workspace has: one paused multichannel strategy + 8 audiences, their conversations, to-dos and funnel. No accounts. Import-free; `tests/sample.test.mjs` pins that every email is on the reserved `.example` domain and every phone in the fictional 555-01xx range, so a sample audience can never be a real person. |
| `sampleSeed.ts` | 174 | Server-only. Inserts the demo strategy, from the `signUp` transaction **and** from `PgRepository.ensureDemo`: strategy + workflow, 8 audiences, 4 conversations and 3 to-dos, the funnel by day. All `is_sample`. No accounts, mailboxes or domains. |
| `setup.ts` | 151 | `setupChecks(accounts, domains)`: what is and is not set up, **computed from the workspace's own accounts**. Drives the Configuration overview, the tab badges and the rail badge. Import-free, tested. |
| `query.ts` | 68 | Pure filter/sort/paginate helpers shared by both impls. Import-free, tested. |
| `validate.ts` | 651 | Write-path validation, `{ok,data}|{ok,errors}`. Import-free, erasable, tested. An audience's `linkedin` goes through `normaliseUrl` (same rule as the upload's `checkUrl`: any web URL, `https://` added); a create with no stage starts at `new`. |

### Execution engine — `lib/engine/` (LinkedIn really sends, on a schedule)
| File | L | Purpose |
|---|---|---|
| `steps.ts` | 262 | `runStep(node, edges, audience, now, dayMs?)` → `{ effects, next, finish }`: what happens when one lead reaches one step, **as data with no side effects**. Effects are a `send` (a channel step: the body, the subject, and the line to log if it cannot go out), a `log` line, or a `task` (only a call step makes one). `REAL_DAY_MS` is a day; `DRY_RUN_DAY_MS` (60 s) compresses one for a workspace that cannot send. Import-free + erasable; `tests/engineSteps.test.mjs`. |
| `window.ts` | 115 | `insideWindow` / `nextOpening` / `nextDayOpening` / `minutesLeftInWindow`: whether a touch may go out now, when the window next opens, and when it opens **after today** (so a spent Friday rolls to Monday). Read in the account's zone, or the workspace owner's. An unusable window reads as always open and a bad zone falls back to UTC — a mistyped setting must not stop a plan. Import-free; `tests/sendWindow.test.mjs`, `tests/pacing.test.mjs`. |
| `pacing.ts` | 118 | How fast an account may act, as pure arithmetic: `warmupCap` (day one is a fifth of the ceiling, full at `WARMUP_DAYS` = 14), `paceGapMs` (spread what is left across the hours left, floor `MIN_GAP_MS` = 90 s), `jittered` (±40%, so the rhythm is not a metronome), `nextTouchAt`, `readHours`, `DEFAULT_HOURS`. Decides *when*, never *whether*. Import-free; `tests/pacing.test.mjs`. |
| `scheduler.ts` | 85 | `runScheduledTick()`: every workspace with a live strategy, up to 40 a tick, each given a `Ctx` built from the owner's membership — **never from a request**, like `lib/channels/inbound.ts`. Runs its due steps, then pulls replies. One tenant's failure is recorded and the rest carry on; an unreachable provider is not a failed tick. Server-only. |

| `journey.ts` | 103 | `journeyOrder()` walks a plan from its Audience step (yes before no) and `journeyRows()` turns it into one row per reachable step with its reach and who is waiting there. Shared by both stores' `getJourneys`; import-free, `tests/journey.test.mjs`. |

The stores apply the result: `launchStrategy`, `runDueSteps`, `runSummary` and `getJourneys` on the `Repository`
(both impls).
- **A LinkedIn step really sends.** `PgRepository.performSend` takes a `send` effect and calls
  `adapter.sendInvite` / `adapter.sendMessage`. Email, WhatsApp and SMS steps are written down with
  the reason they could not go out; a call step becomes a real to-do; a condition cannot see a reply
  yet, so it takes its No branch after waiting out its window.
- **Four real brakes**: the lead's recorded `consent` (a refusal, logged); the account's working
  hours; its daily cap (`channel_accounts.settings.connections` / `.messages`, counted against
  today's `events` of kind `sent`, after the warm-up ramp); and pacing. See "A touch is deferred"
  below for what each one does instead of sending.
- **At most once, on purpose.** `claimDue` selects `FOR UPDATE SKIP LOCKED` and marks the job `done`
  inside the same short transaction; the send happens afterwards, outside any transaction. An invite
  that goes out twice is worse than a step that is missed, because the person on the other end sees it.
  While sending, a tick takes at most 12 jobs in batches of 4, so one screen poll cannot burst.
- **Those refusals are readable by the operator**: `runSummary` is shown both in the builder's
  strategy panel and, since the Launch button lives there, behind the disclosure on each Strategies
  row. A plan that is quiet because it is waiting for Monday morning is otherwise indistinguishable
  from a plan that is broken.
- **Every refusal is written down** (`events` kind `dry_run_step` for "not sent: …", `sent` for a
  real one, `send_failed` for a provider refusal). A step that silently did nothing is the worst
  state an outreach tool can be in.
- `providerIdFor` resolves the provider id an invite is addressed to, caching it — with the briefing
  built from the same read — on `audiences.extra.linkedin`. LinkedIn throttles profile reads, so it
  is never repeated for a person already resolved.
- **Launch lives in the Strategies table only** (a labelled Launch / Resume / Pause button on each row; the builder has just "Launch on Strategies", a link, and saves as it goes without touching status). A successful launch switches the table to the Live tab. **Launch** (`POST /api/strategies/[id]/launch`) enrols the audiences the first step points at,
  skipping anyone already in another strategy (`audiences.strategy_id`) or without `consent`, queues
  their first step (`workflow_runs` unique per workflow+audience, `step_jobs` pending/done with
  `run_at`) and sets the strategy live. Refused with a reason for the demo strategy, an empty plan,
  or nobody to enrol. `PATCH /api/strategies/[id]` with `status: live|scheduled` and a POST with
  those statuses are **422** — only Launch goes live; Pause is a plain `PATCH status: paused`.
- **Plans run on a schedule.** `POST|GET /api/jobs/tick` → `runScheduledTick()`. It is the
  **only route with no session**, because it acts for every workspace, so it is authorised by
  `CRON_SECRET` carried as `Authorization: Bearer …` (what Vercel Cron and the workflow send) or
  `?token=` (what a scheduler with no header field can send). **Unset refuses every call**: an
  open endpoint that advances everybody's outreach is not something to leave lying around, and the
  Home setup card then says the deployment has no scheduler.
- **The beat is GitHub Actions, not Vercel.** A Hobby plan allows **one cron a day**, and a `*/10`
  schedule in `vercel.json` fails the build with "Hobby accounts are limited to daily cron jobs" —
  it is a deploy-time refusal, not a runtime one, so it cannot be left in hopefully.
  `.github/workflows/tick.yml` runs every 10 minutes and curls the endpoint with the secret in the
  header (never the URL, so it stays out of the run log); `vercel.json` keeps `0 3 * * *` as a
  backstop. The endpoint is idempotent, so the two overlapping costs nothing. Two GitHub habits to
  know: a scheduled workflow only runs from the **default branch**, and GitHub **disables the
  schedule after 60 days** with no commits. Secrets: `FLIGHTPATH_URL`, `FLIGHTPATH_CRON_SECRET`.
- **Nothing here is billable.** Actions minutes are unlimited on a public repository, which this one
  is; a free account's spending limit is $0, so Actions stops rather than charges if it is ever made
  private (2,000 free minutes a month against roughly 4,300 needed — go hourly, or point
  cron-job.org / UptimeRobot at the same URL with `?token=`). Vercel's daily cron is inside Hobby.
- **Traffic is the second beat.** `POST /api/engine/run` — polled by every open screen for its own
  workspace — also calls `runTrafficTick()`, which runs the **global** tick at most once a minute
  per instance under `pg_try_advisory_lock`, so ordinary use advances every workspace even if the
  external schedule has quietly stopped. It is free because the request was happening anyway, and
  with nothing live the extra work is one indexed query returning no rows. A failure there is
  logged and swallowed: housekeeping must never break the request that carried it.
  `POST /api/engine/run` still exists and is called by the builder (every 8 s) and the Strategies,
  Home and Analytics screens (every 10 s) while open — the same work, done sooner.
- **A touch is deferred, never dropped.** `whenCanSend` decides in order: outside the account's
  working hours → `nextOpening`; today's cap spent → `nextDayOpening` (Friday afternoon rolls to
  Monday morning); too soon after the last send → `nextTouchAt`. Each one re-queues the step with
  `queueStep`, so a plan that runs out of allowance resumes with nobody skipped. The first two are
  logged once per tick; pacing is silent, being the normal rhythm rather than an event.
- **Hours and warm-up live on the account** (`channel_accounts.settings.hours` / `.warmup` — no
  migration; the jsonb already existed), because the account is what gets restricted: one seat has
  one working day however many strategies send from it. `GET /api/accounts` returns each LinkedIn
  account's `pace` (today's counts against today's ceilings, warming or not, open or not, when it
  next may send) and the Setup row shows it.
- **Journeys and touchpoints are read, not stored.** `getJourneys` counts `workflow_runs` and the run log in `events` (a touchpoint is a logged step with a channel). They appear on Analytics → **Journeys** tab (opens by default once something is launched), on Home's strategy rows, and as the Touchpoints column and journey line in the Strategies table. **The rollups are written by real outcomes only**: a successful send upserts `daily_rollups.reached` and an inbound reply upserts `engaged`/`replied`, so Analytics → Results is the real funnel while the Journeys tab is the plan's shape.
- A strategy's `audiences` figure is counted live from `audiences.strategy_id` (`audienceCounts` / `withMembers`), except for the sample, which keeps its stored number; the stored column was never maintained.
- `GET /api/strategies/[id]/runs` is the builder's run card: in plan / waiting / finished counts and
  the activity log (read from `events`) — which is where a "not sent: …" reason shows up.

### Database — `lib/db/`
| File | L | Purpose |
|---|---|---|
| `schema.ts` | 592 | 22 tables. `strategies.is_sample` / `audiences.is_sample` mark invented rows (migration `0002_sample_flag`). Drizzle definitions + Postgres enums. |
| `client.ts` | 60 | The one `pg` Pool, cached on `globalThis`. **Needs a pooled connection string.** |
| `../lib/password.ts` | 48 | scrypt hash/verify. Imports only `node:crypto`, so the seed and tests can load it. |
| `../drizzle/*.sql` | — | Generated migrations, committed. Never `db:push` at a deployed DB. |
| `../scripts/seed-db.ts` | 480 | `npm run db:seed`. Idempotent by workspace: deletes `w_demo` and rebuilds it, so a real tenant in the same database is untouched. |

Tables, grouped:
- **tenancy** `workspaces` `users` `memberships` `sessions`
- **org-level channel accounts** `channel_accounts` `strategy_accounts` (many to many) `sending_domains` `connect_sessions`
- **uploads** `uploads` (parked parsed files, swept after 1 h) `segments` `segment_audiences`
- **domain** `audiences` `strategies` `workflows` `threads` `messages` `tasks`
- **quota/metrics** `channel_quotas` `daily_rollups` `events`
- **engine** `workflow_runs` `step_jobs`
- **cross-channel settings** `workspace_settings` (one row per workspace, three jsonb blobs: Variables/Sending rules/Compliance — see Configuration below)

`workspace_id` is on every tenant-scoped table. `step_jobs.run_at` + `FOR UPDATE SKIP LOCKED`
is the job queue — no Redis or SQS needed.

### Connecting LinkedIn — `lib/channels/` + `app/api/integrations|webhooks/`

Driving LinkedIn means holding a member session and replaying actions against LinkedIn's own
internal endpoints. **We rent that, we do not build it** — and every call goes through one
interface so the vendor can be replaced without touching a route, a screen or a table.

| File | Purpose |
|---|---|
| `adapter.ts` | `LinkedInChannelAdapter`: `createHostedAuth`, `getAccount`, `deleteAccount`, `listWebhooks`, `createWebhook`, and the acting half — `getProfile`, `sendInvite`, `sendMessage`, `listChats`, `listMessages`. Plus `ProviderAccount`, `ProviderProfile`, `ProviderChat`, `ProviderMessage` and `ProviderError`. The seam, and nothing more: no caps, consent or window logic lives here. |
| `unipile.ts` | The one implementation. `https://{DSN}/api/v1`, `X-API-KEY`, 15 s timeout (30 s for a profile read). `postForm()` sends multipart **without** a content-type header, so fetch picks the boundary — `/chats` refuses JSON. Server-only: the key can read every connected account. |
| `unipileRequests.ts` | The **pure** half — `unipileBaseUrl`, `hostedAuthBody`, `readHostedAuthUrl`, `readAccount`, `readWebhooks`, plus `linkedInIdentifier` (full URL, bare slug or `ACo…` id), `inviteBody` (note clipped to `INVITE_NOTE_LIMIT` = 300), `readProfile`, `readChats`, `readMessages`. Import-free, so `tests/unipile.test.mjs` and `tests/leadBriefing.test.mjs` pin the request contract with no network and no key. |
| `events.ts` | Normalises the webhook payloads. Import-free, tested. |
| `webhookConfig.ts` | The webhook contract: `WEBHOOK_HEADER`, `WEBHOOK_QUERY_PARAM`, `WEBHOOK_SOURCES`, and the pure, tested `authorizeFromCarriers()` match. No value imports but `node:crypto`, so the registration **script** and `tests/webhookConfig.test.mjs` can both load it directly. |
| `webhookAuth.ts` | Untested glue: pulls the header and query-param candidates out of a `Request` and `UNIPILE_WEBHOOK_SECRET` out of the environment, then calls `authorizeFromCarriers()`. |
| `inbound.ts` | The one place that writes workspace rows **without a `Ctx`** — a webhook has no session. The workspace is derived from `channel_accounts.provider_account_id`. Also the only writer of an inbound message, so the webhook and the pull share it. Read its header before changing it. |
| `pull.ts` | `pullRecentMessages(adapter, workspaceId)`: 25 chats per healthy account, 10 messages each, anything outbound or empty skipped, each handed to `applyInboundMessage`. Read-only at the provider; it exists because a webhook needs `UNIPILE_WEBHOOK_SECRET` set and registered. |
| `connect.ts` | Opens a connect session, asks for a hosted link, returns the URL. Shared by connect and reconnect. |
| `index.ts` | `getLinkedInAdapter()` → `null` until `UNIPILE_DSN` + `UNIPILE_API_KEY` are set, and `appOrigin()`. |
| `components/ws/setup/setup-config-view.tsx` + `setup-overview-view.tsx` | starting a hosted sign-in (`api.connectLinkedIn()`, a full-page redirect) and `ConnectResult`, which reads the `?connected=`/`?failed=` reference the provider sends back and polls the session for the real outcome. |
| `scripts/register-unipile-webhooks.ts` | `npm run unipile:webhooks`. Idempotent; never deletes. |

Five things about this that are not obvious:

- **Hosted auth, not custom auth.** Custom auth would mean our servers handling the member's
  LinkedIn password and the 2FA/checkpoint dance. Hosted auth keeps all of it at the provider. The
  adapter exists so custom auth can be added later as one more method, not a rewrite.
- **`connect_sessions` is the tenancy link.** A webhook carries the provider's account id and
  nothing of ours, so something has to say which workspace asked. The session id is handed to the
  provider as `name`, echoed back on `notify_url`, and is random (`randomBytes`, not `Math.random`
  like `newId`) and short-lived. **It must never be the workspace id**: that would let anyone who
  guessed one attach an account to someone else's workspace.
- **`lib/channels/inbound.ts` is the one place that writes workspace rows without a `Ctx`.** A
  webhook has no session. The workspace is *derived* from `channel_accounts.provider_account_id`,
  which is unique across the whole table (`channel_accounts_provider_key`), so one provider account
  belongs to exactly one workspace and the lookup cannot be steered by the caller. It never accepts
  a workspace, audience or account id from a request body.
- **The notify callback cannot carry a secret** (`notify_url` takes no headers), so it proves
  nothing on its own: the reference must be an unexpired pending session, and the account's
  identity is read back from the provider with our own key rather than taken from the body.
  The other two webhooks *are* authenticated, by `UNIPILE_WEBHOOK_SECRET` sent back on every
  delivery — Unipile does not sign bodies. Two carriers, either sufficient: a header (registered
  via the API by `npm run unipile:webhooks`) or a `?token=` query param on the callback URL
  (needed because Unipile's dashboard UI has no header field when an "Account" webhook is created
  by hand). The comparison is the pure half in `webhookConfig.ts` (`authorizeFromCarriers`,
  tested); `webhookAuth.ts` pulls the candidates out of the `Request`. No `UNIPILE_WEBHOOK_SECRET`,
  no deliveries accepted on either carrier.
- **The hosted sign-in returns to the host the member is on, not the canonical domain.** The session cookie is bound to the exact host, so a member who signed in on a deployment URL and came back on `VERCEL_PROJECT_PRODUCTION_URL` landed on `/login` as if logged out. `startLinkedInConnect(ctx, accountId, returnOrigin)` takes the request's own origin for `successUrl`/`failureUrl`; only `notifyUrl` (server-to-server) uses `appOrigin()`. Unipile's notify body reports success as `CREATION_SUCCESS`, which `readAccountStatus` maps to `ok` (it used to fall through to `error`, failing every connect).
- **A freshly connected account is often still syncing.** `readAccountStatus` maps `CONNECTING`/`SYNCING`/`PENDING` to `connecting` (not an error), `attachConnectedAccount` stores the provider's own word in `status_detail`, and `GET /api/accounts` re-reads every `connecting`/`signed_out` LinkedIn account from the provider (`refreshAccountStates`) so a webhook that is unregistered or lost cannot leave a healthy account flagged "needs to log in again".
- **Unipile's v1 and v2 docs disagree on webhook field names** (`AccountStatus` wrapper vs
  `{event,data}`; `message_received` vs `message.created` vs `message.new`). `events.ts` reads
  every documented spelling and refuses a payload missing what it needs, rather than betting on
  one. An unrecognised status is `error`, never `ok`: an account in a state we do not understand
  must not read as usable. Note `event: "account.status"` is the *event's* name and is deliberately
  not read as a status.

Inbound messages land in the Inbox **only** when the sender is already an audience in that workspace,
matched on the provider id cached at `audiences.extra.linkedin.providerId` or, failing that, on their
handle. (A webhook carries `ACoAAA…`, which never matches a stored profile URL — that is why the id
is cached at the first profile read.) A message from a stranger is kept as an `events` row and nothing
else: inventing a person out of a webhook payload would put them in someone's audience list. A matched
reply also upserts `daily_rollups` `engaged`/`replied`.

**Replies arrive two ways.** The webhook is the right one, but a delivery needs
`UNIPILE_WEBHOOK_SECRET` set *and* registered, and a workspace missing either would never see a
reply. So `pull.ts` (69L) reads the recent chats on each healthy account — 25 chats, 10 messages
each, read-only at the provider — and hands anything new to `applyInboundMessage`, the same
idempotent writer the webhook uses. The Inbox calls it (`POST /api/inbox/sync`) on open and every
30 s. One code path for what a reply does.

**Sending is live.** `adapter` gained `getProfile`, `sendInvite`, `sendMessage`, `listChats` and
`listMessages`; `unipile.ts` implements them (`/users/invite` as JSON with a ≤300-char note,
`/chats` as **multipart/form-data**, `/users/{identifier}?linkedin_sections=*`). A launched plan
sends through them, and so does an Inbox reply on a LinkedIn thread.

### HTTP — `app/api/` + `lib/http.ts` + `lib/api.ts`
`lib/http.ts` (56L) holds `withUser`, `json`, `fail`, param parsers — so auth, caching and error
shapes are identical everywhere. `lib/api.ts` (304L) is the typed browser client; client
components call it, never `fetch("/api/...")` by hand. Server components read the repository
directly.

| Endpoint | Methods | Notes |
|---|---|---|
| `/api/me`, `/api/workspace`, `/api/overview` | GET | |
| `/api/tasks`, `/api/tasks/[id]/complete` | GET, POST | |
| `/api/audiences`, `/api/audiences/[id]` | GET POST PATCH DELETE | full CRUD. List takes `?segmentId=` (one audience) and searches name, company, title, email and tags |
| `/api/audiences/[id]/profile` | GET | the prospect profile (`getProspect`): company, journey, audiences, engagement, timeline, to-dos. Read-only; 404 across workspaces |
| `/api/strategies`, `/api/strategies/[id]` | GET POST PATCH DELETE | full CRUD. A multichannel strategy ( = "has a workflow") may have one channel. `status: live|scheduled` is refused here — use Launch. |
| `/api/strategies/[id]/workflow` | GET, PUT | the strategy's workflow. PUT takes `{ name, graph }` and **rebuilds the graph from a whitelist** (`validateWorkflowGraph`); 422 names the reason. 404 for another workspace's strategy. |
| `/api/strategies/[id]/launch` | POST | start or resume a strategy for real (see "Execution engine"). 404 foreign, 422 with the reason when it cannot start |
| `/api/strategies/[id]/runs` | GET | run counts + activity log for the builder's run card |
| `/api/journeys` | GET | `?range=` — every launched strategy's journey (per-step reach, who is waiting where) plus touchpoints by channel and day. Read live from `workflow_runs` and the run log; `dryRun` is true only when the deployment cannot send |
| `/api/engine/run` | POST | runs every due step in the caller's workspace, **sending for real**; polled by open screens. Returns `{ processed }` |
| `/api/jobs/tick` | GET, POST | **the scheduler's door, and the only route with no session.** Authorised by `CRON_SECRET` (Bearer header or `?token=`); 503 when unset, 401 when wrong. Returns `{ workspaces, processed, pulled, failed }` |
| `/api/inbox/sync` | POST | pulls recent LinkedIn chats into the Inbox through the idempotent webhook writer. Returns `{ checked, stored, accounts, configured }`; the Inbox polls it every 30 s |
| `/api/audiences/[id]/enrich` | GET, POST | GET the briefing stored on a lead (free; no provider call). POST reads their LinkedIn profile now through a healthy account and stores it; 503 when no provider is configured, 422 with the reason when there is no URL, no account or no profile |
| `/api/workflows` | GET | every workflow in the workspace, newest edit first |
| `/api/accounts` | GET | the workspace's LinkedIn accounts, mailboxes and sending domains, each with the strategies that use it |
| `/api/accounts/[id]` | PATCH DELETE | PATCH is the dials only (LinkedIn daily caps, working hours and the warm-up toggle; mailbox cap + rotate) — identity/state/health are never accepted. DELETE disconnects at the provider first, then removes the row |
| `/api/accounts/[id]/strategies` | PUT | `{ strategyIds }` replaces the strategies sending from an account; a foreign strategy id is a 422 |
| `/api/accounts/activity` | GET | `?days=` — real per-account counts from `events` (inbound messages, status changes). Zero means zero, never an estimate |
| `/api/integrations/linkedin/connect` | POST | opens a Unipile hosted sign-in; `{ accountId }` repairs one instead. 503 `not_configured` with no API key, 502 when the provider refuses. **GET is a 405** — a link prefetch must not open a sign-in |
| `/api/integrations/linkedin/connect/[id]` | GET | how one connect attempt of *this workspace's* is going; the screen polls it |
| `/api/webhooks/unipile/notify` | POST | hosted sign-in finished. See "Connecting LinkedIn" below for why this one has no secret and is still safe |
| `/api/webhooks/unipile/accounts` | POST | account status changed. Shared-secret header; writes `channel_accounts.state` |
| `/api/webhooks/unipile/messages` | POST | inbound message. Shared-secret header; idempotent on the provider's message id |
| `/api/badges` | GET | `{ tasks, inbox, config }`: the rail counts, fetched on every navigation |
| `/api/settings` | GET, PATCH | the (removed) rules screen: Variables/Sending rules/Compliance (`workspace_settings`); no screen calls it now. PATCH body carries only the section(s) changed (`{ variableFallbacks? \| sendingRules? \| compliance? }`); shape/range checked in `validate.ts`, merged into the stored row by the repository. Always real for the signed-in workspace, but nothing acts on it — the sender holds to the plan's window and the account's caps instead. See Configuration below |
| `/api/audiences/uploads`, `…/[id]/validate`, `/api/audiences/segments` | POST, GET | parked file → review (per-channel reach, **in-journey warning**, import plan) → saved segment. Segments carry a live `audienceCount`. Max 4 MB (Vercel's body cap) |
| `/api/threads`, `/api/threads/[id]`, `/api/threads/[id]/messages` | GET, POST | |
| `/api/analytics` | GET | `?range=`, `?channels=` |
| `/api/login`, `/api/logout`, `/api/signup` | POST | signup is invite-only; see Auth below |
| `/api/demo-request` | POST | marketing; branches on `kind` (demo vs founder_call) |

Error shape is always `{ error: { code, message } }`. 401 unauth · 404 missing · 422 invalid.

### Auth — `lib/auth.ts` (310L, server-only, never import from a client component)
Two modes. **DB mode** (`DATABASE_URL` set): users with scrypt hashes, sessions as rows with a
server-checked `expires_at`, cookie carries an opaque random id only. **Demo mode**: one
hardcoded account + HMAC cookie, so a bare clone works (sign-up says it is unavailable there).
The session carries the workspace — that is what makes tenancy resolvable from the session
instead of a forgeable request parameter.

**Sign-up is invite-only.** `signUp()` runs only for an address in `SIGNUP_ALLOWED_EMAILS` (exact,
case-insensitive, no wildcards; unset = nobody). It creates workspace + user + owner membership +
default quota rows + **the demo strategy** + session in **one transaction**, so a failure leaves
no half-account. The form collects **name, company, email, password**. The workspace id is a fresh
`org_<12 url-safe chars>` (`newOrgId()`, 72 random bits) — the tenant key stored as
`workspaces.id` and `workspace_id` everywhere — and the workspace is named after the company.
After signing up the user lands on `FIRST_RUN_HREF` (`/dashboard/strategies`), where the demo
strategy is. Each signup gets **its own workspace** — there is no way to join one (§7).

| File | Purpose |
|---|---|
| `lib/signup.ts` | Shared contract: `validateSignup()` (name, company, email, password), `parseAllowlist()`, `isInvited()`, `SignupResponse`. Import-free + erasable; used by the form, the route and tests. |
| `app/api/signup/route.ts` | 201 + cookie · 422 invalid · 403 `not_invited` · 409 `exists` · 503 `unavailable`. Requires `application/json`. |
| `components/auth/SignupForm.tsx` | Validates, then posts. Moves on **only** when the server answers `{ ok: true }`. |
| `scripts/set-password.ts` | `npm run db:set-password -- <email>`, password from `NEW_PASSWORD`. Updates an existing user only, and revokes their sessions. The only recovery path (no email sending). |
| `SignOutItem` + `SignOutButton` in `AppShell.tsx` | The labelled rail item and the top-bar icon (the rail is hidden on phones). Both use `useSignOut()`: `api.logout()` → `POST /api/logout` deletes the session row, and it navigates only after the server confirms. |

### Audiences, import review and prospect profiles — `lib/audiences/` + `components/ws/audiences/`
The UI calls an uploaded segment an **audience** and an audience a **prospect**; the code and tables keep
`segment`/`audience`.
`parseFile.ts` (csv/xlsx via exceljs) · `validation.ts` (`ATTRIBUTES`, column mapping, `validateUpload`,
`withoutRows`) · `merge.ts` (merge an uploaded row into an existing audience — its `matchedExisting` is the
distinct existing prospects matched, which is what an audience stores as `profilesMerged`; `merged` also
counts in-file repeats — `planImport`, the dry run
of that merge that labels each row new / existing / duplicate-in-file — **and** `findInJourney`:
which rows are people already in another strategy) · `profile.ts` (a name/company/title for a row,
from its columns or, failing that, its email/LinkedIn; `identityGaps` for "missing details";
`splitFileFields` sorts kept columns into company facts vs the rest; `identityFill` gives a *matched*
existing audience the file's company/title only where it has none — never its name, never an overwrite) · `prospect.ts` (`buildProspect`:
both stores hand it their raw rows and it assembles the `ProspectProfile` — engagement counts,
timeline; import-free, tested) · `analyse.ts` (server-only: the one pass the review step and the save
step share; it adds `report.plan`, an `ImportPreview`) · `summary.ts` (290L, import-free: `readSeat`
reads a seniority + function out of a title or headline, `buildBriefing(profile)` turns a real
LinkedIn profile into the `LeadBriefing` the drawer shows, and `readLinkedInExtra` reads what is
stored on `audiences.extra.linkedin`; `tests/leadBriefing.test.mjs`) · `phone.ts` `segments.ts`
`table.ts` `limits.ts` `ctx.ts`.
UI: `upload-audiences.tsx` (349L) is the three-step modal (File → Match columns → Review & save) ·
`import-review.tsx` (272L) is its last step (totals, filterable row review, invalid-vs-blank
validation log, consent attestation) · `lead-drawer.tsx` (216L) is the profile drawer opened from
an Audiences row (the repository/route names stay `Prospect*` — see CLAUDE.md on the holdover) ·
`lead-form.tsx` (297L) adds or edits one lead by hand, opened from the Audiences header and from
the drawer's Edit button · `lead-briefing.tsx` (155L) is the **From LinkedIn** panel at the top of
the drawer.

**The lead form asks name, company, job title, email, phone, LinkedIn, the audiences they are
listed in, the strategy they sit in, and the consent attestation** — and sends only those, so an
edit never touches imported extra columns and the server defaults the rest (stage `new`, source
`form`, owner = creator). Stage, source, score, tags and next step are not shown anywhere in this
UI — they still exist in the schema.

**The two group fields are different shapes, because the two records are.** *Audiences* are the
uploaded lists, and a lead can be in several at once, so they are checkboxes writing
`Audience.segmentIds` — sending that list **replaces** the whole membership (`[]` means "in none"),
and a patch that leaves the key out leaves membership alone. Both stores enforce that the ids
belong to this workspace (`checkRefs` / the memory equivalent), so a stale id is a 422 rather than
a cross-tenant write. *Strategy* is singular: `audiences.strategy_id` holds one strategy per lead,
so picking another moves them and "No strategy" makes them standalone; sample strategies are not
offered, because nothing may be enrolled into the demo. Saving reloads the segment cards too,
since their counts have just changed. Saving a *new* LinkedIn URL also
fires `POST /api/audiences/[id]/enrich` in the background, so the briefing is usually there by the
time the drawer is opened.

**The briefing is quoted, not inferred.** `buildBriefing` builds it from the profile's own
headline, roles, dates, skills and flags: background, signal chips (open to work, hiring, premium,
follower count), employment with periods, the topics on their profile, and openers lifted from it.
The one derived line is "How to pitch", labelled *a read of their seat, not a fact about them*. An
empty profile yields an empty briefing rather than invented content (`tests/leadBriefing.test.mjs`
pins that). It is stored in the existing `audiences.extra` jsonb — **no migration** — so a
deployment needs nothing applied to read profiles.

**The review is the save, dry-run.** `planImport` runs the same `mergeAudiences` `createSegment` runs, on
the same rows (in-journey people removed), so "N new · M existing updated" is what the save writes;
`tests/audiencesImportPlan.test.mjs` pins that the two agree. Importing never assigns a strategy or
starts anything.

**The profile shows stored facts only.** Contact fields, company (audience's company, work-email domain
unless it is a personal mailbox, company columns from the file, other prospects at the same company),
journey (`audiences.strategy_id`, latest `workflow_runs` row), audiences (`segment_audiences`), and engagement
+ timeline built from `messages`, `events`, `tasks`, the audience's creation and its imports. Nothing
writes `events` or `workflow_runs` yet (§7), so for a real workspace engagement is empty and the
drawer says so; the demo store has no events, runs or creation times for seed audiences.

**It is all in Postgres now.** A parsed file is parked in `uploads` (not process memory: serverless
instances do not share it); saving creates a `segments` row, inserts new people as ordinary `audiences`
(source `csv`, stage `new`), merges matches into existing audiences, and links everyone in
`segment_audiences`. A person can be in several segments.

**Cross-strategy dedupe.** An audience belongs to at most one strategy (`audiences.strategy_id`). Any
uploaded row matching an audience who has a strategy on **any** of email / mobile / WhatsApp / LinkedIn
is *excluded* from the new segment, the summary step says how many and from which strategies, and the
save step recomputes it server-side (never trusts the browser). Excluded rows are not enriched
either. `tests/audiencesJourney.test.mjs` pins the "any field matches" rule.
**Consent:** the modal asks the user to attest the people may be contacted; that sets `consent` on
audiences the upload *creates*. It never changes an existing audience's consent.

### Workspace screens — `components/ws/` (+ `lib/ws/`)
Every `page.tsx` under `app/dashboard/` is a **thin server component**: it resolves the session,
reads what only the server can read, and renders one `"use client"` view. Keep it that way.

| File | L | Reads from | Notes |
|---|---|---|---|
| `shell/AppShell.tsx` | 139 | — | the frame: `Sidebar` + children above `lg`, top bar + animated sheet below it. Detects the two **focus routes** (`/dashboard/strategies/new`, `/dashboard/workflows/[id]`) and renders them chromeless. At `lg`+ it is a fixed `h-dvh` frame and screens scroll inside their cards (see §5 "A fixed frame") |
| `shell/sidebar.tsx` | 162 | — | `Sidebar` (216px) and `SidebarRail` (60px, builder only), `NavList`, `AccountCard`, `SignOutItem` (inline failure message), `NavBadge` (grey = information, black = needs you). **Five destinations** (`DASHBOARD_NAV` via `shell/nav.ts`) — see §2d |
| `shell/page.tsx` | 101 | — | `TopBar`, `PageHeader`, `PageBody` (`px-6 pt-4 pb-6`, `gap-4`, takes the remaining height at `lg`), `SetupTabs` (animated underline, Overview · Integrations · Messages) |
| `shell/workspace-context.tsx` | 63 | `/api/badges` | user + workspace from the layout, badges refetched on every navigation, `refreshBadges()` for a screen that just changed one |
| `shell/use-sign-out.ts` | 34 | `/api/logout` | navigates only after the server confirms, with a **full page load** — see §5 |
| `home/home-view.tsx` | 388 | `/api/overview`, `/api/strategies`, `/api/tasks`, `/api/accounts` | four metric tiles (fixed 7-day window; ranges belong to Analytics, which it links to), To do with a Segmented filter and optimistic completion, Sending today from the accounts' quotas, Strategies, Setup health computed from `setupChecks`. The greeting is computed after mount (no date-dependent server markup) |
| `inbox/inbox-view.tsx` + `composer.tsx` + `messages.tsx` | 438 + 120 + 43 | `/api/threads`, `/api/threads/[id]`, `/api/inbox/sync` | four channel blocks that double as the filter, each stating its **capability before its action**. A **LinkedIn reply really goes out** through the connected account, and so does an email one once a mailbox can be connected; WhatsApp hands off and calls log an outcome. The reply bar's line is channel-aware and tells the truth about whether a send is possible (`linkedInReady`, from the sync poll). The composer is closed by default and closes on any switch |
| `audiences/audiences-view.tsx` | 468 | `/api/audiences`, `/api/audiences/segments` | drop zone, filters, segment cards that narrow the table, paged leads table, copy-email, Add a lead, delete with `Confirm`; a row opens `lead-drawer.tsx`, whose Edit opens `lead-form.tsx`. **No row checkboxes** — nothing consumed the selection and there is no bulk action |
| `strategies/strategies-view.tsx` | 564 | `/api/strategies`, `/api/strategies/[id]`, `/api/strategies/[id]/workflow`, `/api/strategies/[id]/runs`, `/api/journeys` | **the only strategy list** (§2d), and **the only place a plan is launched**. Status Segmented + search + channel select; Launch/Resume/Pause behind a `Confirm`, Duplicate (creates the strategy *and* copies its graph), Delete. **The actions column is second, not last** — see §5. Opening the confirmation reads the plan first and names any step with no copy written. Each row has a disclosure that opens `Activity`: counts, when the next step is due, and the run log's own lines, including every refusal and its reason |
| `strategies/new-strategy-view.tsx` | 245 | `/api/strategies`, `/api/strategies/[id]/workflow` | focus route. Shape (multichannel / single channel), then a play or a blank sequence (a single channel starts on `graphForChannel()`: touch, pause, follow-up, exit; the strategy is still `type: multichannel` = "has a workflow" with one channel, and the builder scopes its palette to it); creates the strategy + its workflow and opens the builder — **never on a GET** |
| `builder/builder-view.tsx` + `canvas.tsx` + `inspector.tsx` | 585 + 382 + 413 | `/api/accounts`, `/api/strategies/[id]/workflow` | the drag-and-drop builder, see below |
| `setup/setup-overview-view.tsx` + `account-settings.tsx` | 401 + 132 | `/api/accounts` | connected accounts, each account's dials behind its Settings, hosted-sign-in result banner, disconnect. No Pause: nothing is sending to pause |
| `setup/setup-integrations-view.tsx` | 250 | `/api/accounts` | the provider catalogue (`providerView()`) and the **one place an account is connected** (a labelled Connect button starts the hosted LinkedIn sign-in). The sending-rules cards and Workspace card that sat beside it as "Config" were removed at the user's request; `/api/settings`, `workspace_settings` and `lib/app/configuration.ts` are still there but no screen edits them |
| `setup/setup-messages-view.tsx` | 283 | `/api/workflows` | **all message copy in the workspace, in one place**, read out of every stored graph by `lib/ws/messages.ts` — the same fields the builder's inspector writes. What is missing is a shared template library, not editing |
| `analytics/analytics-view.tsx` + `charts.tsx` + `journeys-panel.tsx` | 198 + 89 + 153 | `/api/analytics`, `/api/journeys` | two tabs: Results (the recorded funnel, now fed by real sends and replies) and Journeys (launched strategies' per-step reach and touchpoints), which opens by default once something is launched. Hairline grid, single near-black accent |
| `ui/` | ~700 | — | `button` (cva: default/outline/ghost/dashed/danger/warning/inverse; sizes sm 30 · md 34 · lg 38 · icon 30 · icon-sm 28) · `card` · `status-pill` · `segmented` (shared-layout thumb) · `channel-tile` · `confirm` · `motion` (`Appear`, `Swap`, `Row`, `Expand`, and the one easing pair) · `misc` (`Initials, Meter, Switch, NativeSelect, SearchInput, Sparkline, MetricTile, EmptyState, Tag, ChannelChip, Skeleton, LoadError`) |
| `lib/ws/` | 462 | — | `utils.ts` (`cn`, `fmt`, `pct`, `initialsOf`) · `channels.ts` (the domain `Channel` union → display name, monogram, colour, order) · `format.ts` (metric values and footers; says "Nothing yet"/"No comparison" rather than inventing a 0%) · `use-async.ts` (the loading/ready/failed/retry contract every card shares) · `graphEdit.ts` (pure canvas edits, tested) · `messages.ts` (real copy out of stored graphs) |
| `components/glass.ts` | ~230 | — | refraction + specular runtime, **marketing-only** (`SiteGlass.tsx` imports it). Was `components/app/glass.ts` |

**Motion.** `framer-motion` only, and only `transform`/`opacity`: `Appear` (a 4px rise, staggered
by `index`), `Swap`/`Row` through `AnimatePresence`, `Expand` for a disclosure, and one
`layoutId` thumb shared by `Segmented` and `SetupTabs`. Every one of them reads
`useReducedMotion()`, and `workspace.css` zeroes durations under `prefers-reduced-motion` as a
backstop.

### Workflow builder — `components/ws/builder/` (a drag-and-drop canvas)
**It is a canvas again** (an ordered list replaced it for a while and the user asked for the
drag-and-drop one back). Three files plus one pure helper:
`builder-view.tsx` (585L: owns the one copy of the graph, undo/redo history, autosave, palette,
the strategy panel) · `canvas.tsx` (382L: cards, sockets, edges, drag/drop) · `inspector.tsx`
(387L: the selected step's fields, and "then go to" selects so a plan can be wired without a
mouse) · `lib/ws/graphEdit.ts` (import-free and tested by `tests/graphEdit.test.mjs`: `connect`,
`refuseConnect`, `wouldCycle`, `removeNode`, `freeSlot`, `keepInView`).

- **Adding a step:** drag a palette item onto the canvas (HTML5 drag, data type
  `application/x-step`), or click it — a click continues the plan from the selected step (or the
  last one added) through its first free socket. **Wiring:** pull from the dot under a step to
  another card, or use the inspector's "then go to". A step has **at most one parent** and a
  connection that would loop is refused (`graphEdit.ts`), matching `layout()` and
  `validateWorkflowGraph()`. Delete / Backspace removes the selection, Ctrl/⌘+Z undoes.
- **Graph coordinates vs zoom.** Positions are stored unscaled; `zoom` only scales how the surface
  is drawn, so the canvas divides pointer positions by it. `layout()` centres the tree on x = 0, so
  half of a tidied plan has negative x — `keepInView()` slides it right/down on load and after
  *Tidy up*, or the left half is unreachable in a scrolling canvas.
- **A step on a channel with no connected account is flagged** on its card and in the strategy
  panel (`issues()` with `channelOff`, wording rewritten to "isn't connected"). Only LinkedIn and
  Email need an account; a call step is a to-do for a person.
- **Figures on the cards are estimates** (`stepStats()`), and the canvas footer says so. They are a
  projection from the audience size, never a count of what was sent.
- **The page is fixed-height** like every other screen: the palette, canvas and settings panel
  each scroll on their own.
- `lib/ws/plan.ts` (the old list seam) is deleted.

**Model.** `lib/app/workflow.ts` (1024L) still owns `WorkflowGraph`, the templates,
`graphFromTemplate()`, `toGraph`/`fromGraph` and `validateWorkflowGraph()` /
`validateWorkflowName()` — a whitelist rebuild that rejects unknown step-data keys (incl.
`__proto__`), bad sockets, a second Audience, **cycles** and oversize graphs. It also answers
*is this plan ready to send*: `copyField(kind)` names the field a step keeps its words in
(`note` / `notes` / `body`, the one definition — `lib/ws/messages.ts` re-exports it) and
`blankCopySteps(graph)` lists the **reachable** sending steps with nothing written in them, which
is what the launch confirmation warns about. An empty note is reported, never refused: a bare
invite is a legitimate choice, deliberately made. Pinned by
`tests/workflow.test.mjs` + `tests/workflowPersist.test.mjs`. **@xyflow/react was never a
dependency** and the `.react-flow__*` class names are gone with `app.css`.

**Autosave.** 800 ms after the last change, serialised, flushed on `pagehide`/unmount with a
`keepalive` fetch. The save state is `idle | pending | saving | saved | failed` and starts at
`idle` when a stored graph loaded — it used to start at "Unsaved changes" on a page that had
changed nothing. Status (live/paused) belongs to the *strategy*, not the graph.

**Where copy is written.** The inspector *does* edit the words a step sends (the invite note,
the message body, the caller's notes); Setup → Messages reads the same fields back out of every
stored graph so all the copy in a workspace can be seen in one place. What is not built there is a
shared template library — a message lives on the step that sends it.

**What LinkedIn does with an invitation note is not ours to promise.** The inspector counts against
300 characters (the API's limit, mirrored from `INVITE_NOTE_LIMIT` in
`lib/channels/unipileRequests.ts`, which stays import-free for `node --test`) and says plainly that
a **free** LinkedIn account takes only a handful of personalised invites a month and caps the note
at 200 characters, sending the request bare past that and telling nobody. Nothing in the API
reports it, so the note going missing on a real send is usually this, not a bug: the code attaches
it as `message` on `POST /users/invite` and `tests/unipile.test.mjs` pins that.

**Audience lists** come from the page as `AudienceOption[]`: "Audiences in this strategy", "All
audiences" (both counted live) and the workspace's saved segments. The Audience step stores only
the key.

**Routes.** Exactly one builder route: `/dashboard/workflows/[id]`, `id` being a multichannel
strategy's id. The page loads strategy + workflow through the repository and 404s for an unknown
id, another workspace's id or a standalone strategy. `/dashboard/workflows/new`, numeric (old
demo) ids and `/dashboard/workflows` itself **redirect to Strategies**;
`/dashboard/strategies/[id]` is a `permanentRedirect` to the builder — never render a second
builder there.

**The builder offers only steps that can run.** `PALETTE` lists LinkedIn invite, LinkedIn message,
Email and Call task. `STEPS` still *describes* WhatsApp and SMS and `CHECKS` still holds `read`, so
a stored graph holding one keeps validating and rendering; `PALETTE`/`OFFERED_CHECKS` are what a
user may add. No template builds one either (`tests/workflow.test.mjs` pins all of this).

**Canvas figures are projections, and say so.** `stepStats()` multiplies the audience size by the
fixed rates in `PASS`/`RATE`. Rates render with a `~` and the screen carries a permanent
"estimates, not your results" line. Replace them with real counts in the commit that lands a
sender, not before.

**Launch sends, and the UI says so (`lib/capabilities.ts`).** `SENDING_ENABLED = true`, and
`LIVE_SEND_NOTE` is the one line every screen about to start outreach carries. **Launch lives in the
Strategies table only** — a labelled Launch / Resume / Pause on each row, behind a `Confirm` that
states what is about to happen; the builder just saves and links there. A refused launch shows the
reason inline (e.g. the first step's audience is empty — "Leads in this strategy" has 0 until
something enrols them, so pick "Every lead in the workspace" or a segment). `SENDING_OFF_NOTE` is
what a workspace with no healthy account sees instead, and `SENDING_CHANNELS` is the one channel
that can genuinely go out.

**Sample data** carries a "Sample" tag on the row where it appears. It cannot be removed: there is
no "Remove sample data" control, route or repository method (it used to live on the Workspace card
and at `DELETE /api/workspace/sample`).

**Strategy creation has one entry point:** Strategies → New strategy → `/dashboard/strategies/new`
(`new-strategy-view.tsx`). It asks the shape and nothing else, because the old dialog's other four
questions could not be answered before seeing the strategy. Channels follow from the steps; status
follows from what the user does.

### Setup — `/dashboard/configuration` — one screen, three tabs
`setup-overview-view.tsx` · `setup-integrations-view.tsx` (`/dashboard/configuration/integrations`; `/configuration/config` redirects here) ·
`setup-messages-view.tsx` (`/dashboard/configuration/messages`). Titled "Setup" and reached from
the rail — it is one of the six `DASHBOARD_NAV` destinations, so it works on a phone.

**It was six tabs, and before that three rail destinations.** Overview · LinkedIn · Email ·
Connections · Rules · Workspace collapsed to **Overview · Integrations · Messages**: LinkedIn and Email
were two copies of one account register (now Overview), Connections and Rules are both "what is
connected and how does sending behave" (now Config), Workspace held four read-only facts (now a
card on Config), and message copy had no home at all (now Messages). `/dashboard/integrations`
and `/dashboard/settings` are `permanentRedirect`s here, and the integrations route carries
`?connected=`/`?failed=` across so an in-flight hosted sign-in still lands.
**`lib/channels/connect.ts` builds its success/failure URLs from `SETUP_HREF`**, and
`ConnectResult` in `setup-overview-view.tsx` is what reads them — it polls the connect session for
the real outcome rather than trusting the query string, and clears the parameter so a refresh
cannot replay a stale result.

**Messages is new, and it is real copy.** `lib/ws/messages.ts` reads every stored workflow's
channel steps and lists the actual subject/body/note per touch, per strategy (`bodyField()` knows
`li_invite → note`, `call → notes`, else `body`). Nothing is invented: a strategy with no copy
written says so. Editing copy in place is open work (§7).

**The setup score only counts what the user can change.** "No mailbox connected" is `tone: "info"`,
not a blocker: connecting a mailbox is not built, so scoring it left every workspace permanently
short of full marks with no action available.

**LinkedIn accounts and mailboxes belong to the workspace, not to a strategy.** No strategy scope
on this screen. Each account's "Used by strategies" control (real strategies, many-to-many for
**both** channels) saves through `PUT /api/accounts/:id/strategies`; its daily caps and mailbox
rotation save (debounced) through `PATCH /api/accounts/:id`. Domains show their SPF/DKIM/DMARC
state. The Overview's checks come from `lib/data/setup.ts` (real state), never a constant.
**Connecting a mailbox is not built** and the screen says so instead of offering a button.

**WhatsApp, Calls and SMS** are a Planned row on Integrations — no account or number concept exists, so
there is nothing to configure and nothing was scaffolded. A tab whose whole content would be
"nothing to configure yet" does not get a tab.

**Variables, sending rules and compliance persist** through `/api/settings` → `workspace_settings`
(one row per workspace, three jsonb blobs); `lib/app/configuration.ts#defaultWorkspaceSettings()`
is the single source of the starting values and the rule tables still own each row's label and
hint. The screen says the values are saved but that nothing enforces them, because nothing sends.

### Presentation helpers — `lib/app/`
`channels.ts` (the short channel keys and their colours) · `audiences.ts` (stage colours, score band,
phone mask, tag colours, avatar tints) · `strategies.ts` (status pill wording) · `configuration.ts`
(rule catalogue + `defaultWorkspaceSettings()`, the one function that is a
`WorkspaceSettings` — see Workspace data below) · `integrations.ts` (provider catalogue + `providerView`) ·
`workflow.ts` (the graph model, templates, validation) · `segments.ts` (a
tiny event so the builder refreshes when a segment is saved) · **`adapt.ts` bridges to `lib/data`**
and is import-free at runtime, so `tests/adapt.test.mjs` pins every channel and stage round-trip.
**Nothing in here is workspace data.** (`workflow.ts` still carries the five demo workflows and
`LISTS` — used only by `MemoryRepository` for demo mode and by the tests that pin their figures.)

### Marketing — `components/` + `app/`
`Hero.tsx` (321L, pinned scroll-driven card merge) · `Journey.tsx` (383L) ·
`WorkflowLibrary.tsx` (440L) · `UntangleFlow.tsx` (212L, rAF-driven untangle) ·
`WhyFlightpath.tsx` · `FounderBooker.tsx` (468L, preferred-time request, **not** availability) ·
`demo/DemoForm.tsx` (304L) · `Navbar.tsx` `Footer.tsx` `Reveal.tsx` `SiteGlass.tsx`.
`lib/demoRequest.ts` (186L) is the shared validation contract — import-free, tested.
`components/pip/` (677L) is the site mascot: one rAF engine, perches keyed by
`data-pip-section`, hidden on `/dashboard`.

### Tests — `tests/` (Node's built-in runner, not Jest/Vitest)
`dataQuery.test.mjs` · `graphEdit.test.mjs` · `demoRequest.test.mjs` · `workflow.test.mjs` · `validate.test.mjs` ·
`adapt.test.mjs` · `signup.test.mjs` · `sample.test.mjs` · `setup.test.mjs` · `workflowPersist.test.mjs` · `audiencesValidation` `audiencesMerge` `audiencesJourney` `audiencesProfile` `audiencesImportPlan` `prospect` `workflowSegment` ·
`unipile.test.mjs` (the Unipile request contract + response readers) · `unipileEvents.test.mjs`
(both documented webhook envelopes) · `webhookConfig.test.mjs` (the header/query-param match) —
`engineSteps.test.mjs` (the pure step runner) —
**245 tests** (`journey.test.mjs` is the newest)
`.mjs` files import `.ts` directly via Node type stripping (needs Node ≥ 22.18), so **any module
under test must have no `@/` or extensionless imports and only erasable TS** (no enums, no
namespaces, no parameter properties).

---

## 4. Where do I change X?

| Goal | Touch |
|---|---|
| Add a field to audiences/strategies | `lib/db/schema.ts` → `db:generate` → `lib/data/types.ts` → `validate.ts` → `pg.ts` + `memory.ts` → `lib/app/adapt.ts` |
| Add an endpoint | `app/api/<name>/route.ts` using `withUser`/`json`/`fail`, then `lib/api.ts` |
| Add a repository method | `lib/data/repository.ts` first, then **both** impls (`pg.ts`, `memory.ts`) |
| Swap the database | implement `Repository`, return it from `getRepository()`. Nothing else. |
| Change the schema | edit `lib/db/schema.ts` → `npm run db:generate` → review the SQL → `npm run db:migrate`. Never hand-write a migration or `db:push`. |
| Make another screen live | copy the Audiences pattern: `api.*` in a `useEffect`, map through `lib/app/adapt.ts`, server-side filters, optimistic writes with rollback |
| Re-theme marketing | `:root` in `app/globals.css` + `@theme inline`. Grep `rgb(` and `pipSvg.ts` for hardcoded brand colours. |
| Re-theme workspace | the `.ws-root` token block at the top of `app/workspace.css`, and its `@theme inline` mapping right below it. Tokens are **never** on `:root` (that would repaint the marketing pages, which share the document) and components never carry hex — see §5. |
| Add a glass surface (marketing only) | selector list in `globals.css`'s glass-skin block **AND** `SiteGlass.tsx`'s lens/specular lists. Miss one → renders flat. The workspace has no glass surfaces any more — see §5. |
| Add a nav item | `lib/nav.ts` (workspace) or `lib/site.ts` (marketing). For the workspace, read §2d first: the rail and the phone sheet render the same six entries |
| Add a Setup tab | `SetupTabs` in `components/ws/shell/page.tsx` + a route under `app/dashboard/configuration/`. There are three (Overview · Integrations · Messages) and a tab whose content would be "nothing to configure yet" belongs on Config as a Planned row instead |
| Offer a new builder step | `STEPS` + `defaults()` + `stepLabel()` **and** `PALETTE` in `lib/app/workflow.ts`. `STEPS` describes a step so stored graphs render; `PALETTE` is what a user may add, and only steps that can actually run go in it (`tests/workflow.test.mjs` pins that) |
| Change what a new workspace starts with | `lib/data/sample.ts` (content, tested) and `sampleSeed.ts` (insert). Keep every email on `.example` and every phone in 555-01xx — the tests enforce it. |
| Add a field to a stored workflow | `WorkflowGraph` + `validateWorkflowGraph` in `lib/app/workflow.ts` (the whitelist **drops/refuses** anything not listed) + a case in `tests/workflowPersist.test.mjs` |
| Change what a connected account can do | `lib/data/types.ts` (`LinkedInSettings`/`EmailSettings`) → `validateAccountPatch` in `validate.ts` → `pg.ts` + `memory.ts` → `components/ws/setup/account-settings.tsx` |
| Add a setup check | `lib/data/setup.ts` (and its test). It is derived from `AccountsSnapshot`; do not hardcode |
| Swap the LinkedIn vendor | implement `LinkedInChannelAdapter` (`lib/channels/adapter.ts`) and return it from `getLinkedInAdapter()`. Nothing else — that is what the interface is for. |
| Handle another provider webhook | a reader in `lib/channels/events.ts` (+ a case in `tests/unipileEvents.test.mjs`), a writer in `inbound.ts`, a route under `app/api/webhooks/unipile/`, and the `source` in `webhookConfig.ts` so the registration script picks it up |
| Add a per-account figure | `AccountActivity` in `lib/data/types.ts` → `accountActivity()` in **both** repository impls → `SeatActivity` in `ChannelTabs.tsx`. Count real `events` rows; never estimate |
| Move a lead into or out of an uploaded audience | `segmentIds` on `AudienceInput` (`lib/data/validate.ts`) → `setSegments`/`segmentsOf` in `pg.ts` and their equivalents in `memory.ts` → the checkbox list in `components/ws/audiences/lead-form.tsx`. Sending the list replaces the whole membership; leaving the key out leaves it alone |
| Warn about something before a plan is launched | `blankCopySteps` (or a sibling) in `lib/app/workflow.ts` + a test, then the `Confirm` body in `components/ws/strategies/strategies-view.tsx`, which reads the plan when the dialog opens |
| Change how uploaded people are matched | `lib/audiences/merge.ts` (`mergeAudiences` + `findInJourney`; `planImport` follows `mergeAudiences` automatically) and `tests/audiencesMerge`/`audiencesJourney`/`audiencesImportPlan` |
| Change what the import review shows | `ImportPreview`/`ReviewRow` in `lib/audiences/segments.ts` → `analyseUpload` in `lib/audiences/analyse.ts` → `components/ws/audiences/import-review.tsx` |
| Add something to the prospect profile | `ProspectProfile` in `lib/data/types.ts` → `ProspectFacts` + `buildProspect` in `lib/audiences/prospect.ts` (+ `tests/prospect.test.mjs`) → `getProspect` in **both** `pg.ts` and `memory.ts` (scope every query by `workspace_id`) → `components/ws/audiences/lead-drawer.tsx` |
| Change what a step does when it runs | `runStep` in `lib/engine/steps.ts` (+ `tests/engineSteps.test.mjs`); the stores only apply its `effects`, so both impls follow |
| Add a builder step kind | `STEPS` + `defaults()` + `stepLabel()` in `lib/app/workflow.ts`; tests pin the five fixture graphs in `WORKFLOWS` |
| Add a Configuration setting (no screen edits them today — the rules UI was removed; rebuild one before adding a setting) | the catalogue entry in `lib/app/configuration.ts` (and its default in `defaultWorkspaceSettings()`), a field on `WorkspaceSettings` in `lib/data/types.ts`, a check in the matching `validate*Patch` in `lib/data/validate.ts`, then a row in `components/ws/setup/setup-rules.tsx`. Rows are its own `<Field>`/`<ToggleLine>` — don't hand-roll one, and don't write a rule's label or hint into the component: the catalogue owns that copy. |
| Add a workspace UI primitive | `components/ws/ui/` (one file per family), styled from tokens only. Check the name against `globals.css` first — it is loaded on `/dashboard` too, so a class name both stylesheets use inherits the marketing rules. |
| Add a screen state (loading / empty / failed) | `useAsync` in `lib/ws/use-async.ts` plus `Skeleton`/`EmptyState`/`LoadError` from `ui/misc.tsx`. Every card on these screens shows all three; a screen that shows only the happy path is unfinished. |

---

## 5. Hard constraints (each one cost real debugging)

**Build/dev**
- **Never `npm run build` while `next dev` runs.** Both write `.next/`; it corrupts the cache
  ("Could not find the module … segment-explorer-node.js"). Stop dev, delete `.next`, then build.
- `next dev` silently moves to port 3001+ if 3000 is taken — usually a forgotten server with a
  stale cache serving 500s. Check the printed "Local:" URL.
- Keep TypeScript on 5.x; TS 6 broke the `import "./globals.css"` side-effect import.

**Database**
- Use the **pooled** connection string (Neon host contains `-pooler`). Serverless opens far more
  connections than Postgres allows.
- Migrations are committed files. Never `db:push` at a deployed database.
- Every repository query filters `workspace_id`, **including by-id lookups** — an id alone is a
  guessable key, so a missing predicate is an access-control hole. Verified: a session in one
  workspace gets 404 on another's rows by exact id, and list endpoints never leak them.
- **Demo-mode state must live on `globalThis`.** Next bundles each route handler separately, so a
  module-level array in `memory.ts` was a different copy per route: an upload parked by
  `/api/audiences/uploads` was "no longer available" in `…/validate`, and an audience starred through
  `/api/audiences/[id]` still read unstarred in `/api/audiences`. `memory.ts` now keeps every mutable value
  behind `shared(key, init)`; add new demo state the same way. (Separate serverless instances still
  don't share it.)
- `createSegment` receives rows with the review's in-journey people already removed, so its own
  recheck finds only people who joined a strategy since; the audience's `excludedInJourney` is
  `report.journey.excluded` + that recheck. (It was recorded as 0 before 2026-10-22.)
- `numeric` columns come back from `pg` as **strings**, not numbers (deliberate, to avoid float
  precision loss). `num()` in `pg.ts` is the only place that converts.
- Paged queries need a **second unique sort key** (`ORDER BY score DESC, id ASC`). Without it,
  rows with equal scores swap between pages and one gets shown twice or skipped.
- **`app/globals.css` is loaded app-wide, including on `/dashboard`.** Only `app.css` is scoped to
  the workspace routes, not the other way round, so a workspace class name that also exists on the
  marketing page inherits its rules — check a new workspace class name against `globals.css`
  before using it.
- Analytics reads `daily_rollups`, so **today has no row until the rollup job runs** — a 30-day
  range legitimately returns 29 points the day after a seed. Not a bug.
- **Drizzle wraps driver errors.** A Postgres unique violation arrives as a `DrizzleQueryError`
  whose original is on `.cause`; `error.code` alone is `undefined`, so a duplicate-email signup
  would surface as a 500. `pgErrorCode()` in `lib/auth.ts` checks both.
- Browser tests: Next injects its own empty `role="alert"` route announcer, so
  `locator('[role="alert"]').first()` matches that, not your message. Scope it
  (`form div[role="alert"]`). And wait for `html.js` plus a beat before clicking a form, or the
  click lands before React attaches.
- `scripts/` has its own tsconfig: it runs under `node --experimental-strip-types`, which needs
  explicit `.ts` extensions that the app's tsconfig rejects. `npm run typecheck` runs both.

**Forms**
- A field the server normalises (the audience form's LinkedIn URL) must not be `type="url"`: the browser's
  own constraint check refuses `linkedin.com/in/x` (no scheme) before `onSubmit` runs. Use a text input
  with `inputMode="url"` and let `validate.ts` decide.
- Every `<form>` needs `method="post"`. Without it the HTML default is GET, so a submit that
  beats hydration navigates to `?email=…&password=…` — credentials into the URL bar, history
  and server logs. Found by a browser test clicking before React attached.

**Workspace design system (`app/workspace.css` + `components/ws/`)**
- **Tokens live on `.ws-root`, never `:root`.** `app/globals.css` is loaded app-wide, including on
  `/dashboard`; putting the workspace palette on `:root` would repaint every marketing page. The
  dashboard layout puts `.ws-root` on the shell and `workspace.css` declares everything inside it,
  then maps it with `@theme inline`. Same trap in the other direction: **a workspace class name
  that also exists in `globals.css` inherits the marketing rules** — the workspace deliberately
  avoids `.card`, `.btn`, `.field`, `.glass` and the rest of the glass-skin selector list.
- **No shadows, gradients or glass in the workspace.** Surfaces separate by a hairline border
  (`--border` between cards, the lighter `--divider` between rows inside one). The only shadow in
  the whole workspace is the 1px lift on the active `Segmented` option. The old vendored
  `app/app.css` (and its flattening block, its `.react-flow__*` rules, its `Thumb` material and
  its `.intg*` block) is **deleted**, along with every component that depended on it.
- **Mono carries structure, sans carries prose.** JetBrains Mono (`--font-code`, already loaded in
  `app/layout.tsx`) for the brand, page and card titles, uppercase micro-labels (`.label-mono`) and
  **every number** — counts, percentages, dates, times, ids. Inter for names, descriptions, body
  copy and button text. Collapsing to one family loses the look.
- **Colour never carries meaning alone.** Every status is a fg/bg token pair *with a text label*
  (`StatusPill`), and a destructive action differs in icon shape as well as colour
  (`variant="danger"` + `Trash2`/`Unlink`). The `--ch-*` channel colours are darkened from each
  vendor's brand colour so a white monogram clears 4.5:1 — use them **on tiles only**, never as
  text, and always beside the channel's name.
- **A fixed frame at `lg` and up.** The window is the frame: `AppShell` is `lg:h-dvh` (with a 600px floor,
  under which the whole page scrolls), `main` is `lg:overflow-hidden`, and the sidebar is `lg:h-full`.
  **A screen never makes the page scroll**: `PageBody` takes the height left under the top bar, one
  region is given `FILL` (`components/ws/ui/card.tsx`) and the list, table or pane inside it scrolls
  (`CardScroll`, or `lg:min-h-0 lg:flex-1 lg:overflow-y-auto`). Every flex or grid ancestor between
  the frame and a scroller needs `lg:min-h-0`, and a grid needs `lg:grid-rows-1`, or the track grows
  to its content. `main` is `relative` on purpose: a visually-hidden (`absolute`) label inside a
  scrolling pane would otherwise anchor to the viewport and stretch the document. Below `lg` the
  page is one long scroll, grids are `repeat(auto-fit,minmax(Npx,1fr))` and a wide table sits in
  `overflow-x-auto` with a `min-w`. Check a new screen at 1440x900, 1280x720 and 1024x700 that
  `document.documentElement.scrollHeight` equals the window height.
- **In a table that scrolls sideways, the row's actions go on the left, not the right.** A wide
  table in `overflow-x-auto` is fine for figures — you scroll to read them — but not for the
  control that does the thing. On Strategies the Launch and Pause buttons were the last column, so
  at every supported width they started off the right edge and the screen read as "there is no
  Launch button". **A sticky column cannot fix this**: a grid item's containing block is its own
  grid area, so `position: sticky; right: 0` on the last cell is clamped to that one track and
  never moves. The actions column is therefore the second one, where the scroll never reaches.
- **Compact density.** Body 12px, micro-labels 11px, page title 20px, controls 26–34px, sidebar 216px.
- **Spacing is fixed, not improvised.** Page body `px-6 pt-4 pb-6`, `gap-4` between sections, card
  header `px-4 py-[10px]`, rows `py-[9px]`. Matching these is what makes the margins line up across
  screens; a new card that invents its own padding shows immediately.
- **Motion is `framer-motion`, `transform`/`opacity` only, and always reduced-motion aware.**
  `components/ws/ui/motion.tsx` owns the easing and the four wrappers (`Appear`, `Swap`, `Row`,
  `Expand`); `Segmented` and `SetupTabs` share one `layoutId` thumb. Every wrapper reads
  `useReducedMotion()` and `workspace.css` zeroes durations under `prefers-reduced-motion` as a
  backstop. Do not animate layout-affecting properties, and do not use CSS `zoom` to rescale the
  app.
- **Do not add a control that cannot act.** Carried over from the previous design and still
  enforced: no global Search button without a palette behind it, no notification bell with a
  hardcoded dot, no row checkboxes without a bulk action, no Test button that is permanently
  disabled. A feature that is not built says so in words where the control would have been.
- **`components/glass.ts`** (the refraction/specular runtime, moved from `components/app/`) is
  **marketing-only** — `SiteGlass.tsx` imports it, nothing in `components/ws/` does. Don't delete
  it, and don't mount it on the dashboard.
- `toAppAudience`'s `li` is the stored `audiences.linkedin` (or `""`). It used to be a
  `linkedin.com/in/<name>` slug invented from the name — a profile nobody gave us. Don't
  reintroduce a derived URL.

**CSS / glass (marketing site only — `globals.css` + `SiteGlass.tsx`)**
- Three Chromium rules silently kill `backdrop-filter`, all found by testing the rendered page:
  the element having its own `filter`; sitting inside `isolation: isolate`; or **any** ancestor
  holding a transform — including the identity transform a forwards-filling animation leaves
  behind (hence `.intro-nav` fills `backwards`).
- The wallpaper (`body::before` on the marketing pages) is **load-bearing** — glass needs colour
  behind it to bend. Flatten it and every panel becomes a plain white card. (The dashboard has no
  wallpaper and no glass on purpose — see "Workspace design system" above; this rule is
  marketing-only.)
- Shared component classes stay inside `@layer components` so utilities can still override them.
  A rule that must beat the global unlayered `:focus-visible` must itself be unlayered.
- `--hl` must stay **inheriting** (pseudo-elements and inner pills read the animated value).
- Grid columns holding wide content need `minmax(0,1fr)` or mobile overflows horizontally.

**Workspace layout**
- The mobile navigation is a top bar plus an animated sheet below `lg` (`AppShell`), not a tab bar
  sized from a CSS variable. It renders the same `DASHBOARD_NAV` as the rail, so a destination
  missing from that list is unreachable on a phone — see §2d.
- **Two routes are chromeless** (`/dashboard/strategies/new` and `/dashboard/workflows/[id]`):
  `AppShell` detects them and renders the focus layout, the builder with a 60px `SidebarRail`. Add
  a focus route to that check, not by nesting another layout.
- **`app/dashboard/not-found.tsx`** is what `notFound()` renders for any dashboard page, inside the
  layout (the session and the way back survive). In the no-database `dev` deployment it says why a
  strategy you just created can 404: `MemoryRepository` writes live in one serverless instance and
  are not shared between requests, so create-then-open can land on a different instance. A database
  deployment never has this. **LinkedIn connecting is production-only**: `UNIPILE_DSN` /
  `UNIPILE_API_KEY` are set for the Vercel *production* target only, and the connect flow also needs
  the database (`connect_sessions`, `channel_accounts`), which `dev` deliberately lacks.
- The Setup tab strip wraps rather than scrolls — the underline is a `layoutId` element, so it
  follows whichever tab is current on either row.

- **Marketing typography (akkari.io-inspired pass).** `app/globals.css`'s `@theme inline` wires
  **both** `--font-serif` and `--font-mono` to `var(--font-code)` (JetBrains Mono, already loaded
  in `app/layout.tsx`) — akkari's own headlines render in a monospace face (confirmed via its
  rendered font: weight 500, `ui-monospace` stack), not a serif, so `.display`/`.font-serif` (the
  shared headline utility used by `Hero`, `Journey`, `WhyFlightpath`, `WorkflowLibrary`,
  `FounderBooker`, `DemoForm`, `AuthPage`, `SectionHeading`) now render mono at weight 500 with
  near-zero letter-spacing, not bold serif. `--font-display` (Instrument Serif) stays loaded but
  unused on the marketing site. `.eyebrow` and `.btn-primary` also use the mono face, uppercase.
  `body::before`'s wallpaper is toned down further toward a near-flat cream (akkari's own
  background is close to flat) — it still carries a little colour, so glass still has something
  to bend; don't flatten it to pure white or every panel reads as a plain card.
- **`.hero-cta-bar`** (`Hero.tsx`, wraps the two hero CTA buttons) is the one deliberately
  concentrated glass moment on the landing page, added alongside the existing per-surface glass.
  It is in the glass-skin selector list and `SiteGlass.tsx`'s `LENS_TARGETS`/`SPECULAR_TARGETS`
  like any other surface (add new glass controls to all three together). Its border-radius is
  `var(--radius-lg)` below the `sm:` breakpoint and `999px` above it — stacked on mobile, two
  full-pill buttons inside a 999px capsule pinch at the waist, so the full pill only applies once
  the row goes horizontal (must track the markup's own `sm:flex-row`).

**Animation**
- Animate `transform`/`opacity` only. New looping decorations must be added to the
  `prefers-reduced-motion` block.
- Every reveal is gated on `.js` (added by an inline script in `layout.tsx`) so content stays
  visible without JS.
- Chromium: SVG `pathLength` + `stroke-dasharray` + `vector-effect: non-scaling-stroke` draws
  only part of the path. Drop `vectorEffect` or use a `clip-path` wipe.
- `Hero`'s `DESKTOP_MQ` media query must match the CSS block in `globals.css`.

---

- **Sign-out must be a full page load** (`useSignOut()` in `components/ws/shell/use-sign-out.ts`
  uses `window.location.assign`, not `router.push`), and it navigates only after the server has
  confirmed the session row is gone. Next keeps a visited route's CSS across client-side
  navigation, so a soft navigation to `/login` rendered the marketing page with the workspace
  stylesheet still applied. A fresh document loads only the marketing styles. Same rule for any
  future jump from the app to a marketing route.

- **Density is the type scale in `workspace.css` + the sizes baked into `ui/`.** 13px body, 11px
  micro-labels, 30–38px controls. Re-tune by changing the primitive (`button`'s `size` variants,
  `.label-mono`), not by scattering size overrides through screens — and never with CSS `zoom`.

## 6. Content rules (from the product brief — these are commitments, not preferences)

- No invented testimonials, customer logos, metrics, integrations or certification claims.
- Dashboard and product figures stay labelled illustrative/demo data.
- Integrations beyond LinkedIn and email are shown as "Planned".
- No fake booking or calendar availability. The founder-call calendar is a clearly labelled
  *preferred-time request* — a founder confirms by email, nothing is booked until then.
- `/signup` creates a real account, but only for an invited address, and the form shows success
  only when the server confirms. With no database it says account creation is unavailable.
  Never show success on the client's own say-so.

---

## 7. Known gaps / open work

Roughly in the order they should be closed.

1. **Enrollment happens at Launch only.** `launchStrategy` sets `audiences.strategy_id` for the
   audiences the first step points at (consenting, not in another strategy). Nothing releases them
   when a strategy is paused or deleted, and a draft's segment still does not warn about overlaps
   with another draft until one launches.
2. **The engine sends and runs on a schedule; what is left is finer-grained.** Invites and
   messages go out for real, held to consent, the account's working hours, its warm-up ramp and
   daily caps, and a jittered pace, with every deferral re-queued rather than dropped (see §3).
   Still open: a **retry** for a provider refusal (today it is logged as `send_failed` and the
   lead moves on); a **condition that can see a reply**, so a sequence stops for someone who
   answered mid-step rather than at the next check; **per-account round-robin** when a workspace
   has several seats (the runner uses the first healthy one); and the tick's 40-workspace ceiling,
   which needs a cursor once there are more. The send path was verified end to end against a local
   Postgres — enrolment, the cap-reached deferral rolling to the next working morning, the tick's
   auth — but **not against a live LinkedIn account from here**.
3. **LinkedIn connects and sends; email does not.** LinkedIn accounts connect through Unipile's
   hosted sign-in (see "Connecting LinkedIn" in §3) wherever `UNIPILE_DSN` + `UNIPILE_API_KEY` are
   set; without them the screens say so rather than offering a button that 503s. Caps are now
   enforced in the runner and profiles are read (`getProfile` → the briefing on
   `audiences.extra.linkedin`). Still open: **`UNIPILE_WEBHOOK_SECRET` is not set in production**,
   so every webhook delivery is refused and replies arrive only through the Inbox's 30 s pull —
   setting it and running `npm run unipile:webhooks` makes them instant. Mailbox connection is not
   built at all: `sending_domains` is read-only and "Connect mailbox" is still disabled.
4. **Configuration rules are stored but not enforced, and no screen edits them.** Variables,
   sending rules and compliance persist in `workspace_settings` (`/api/settings`), but the sender
   reads the plan's own sending window and the account's caps instead, so that table is dead
   weight until a screen comes back. The channel tabs' "All accounts" / Tracking switches are a
   separate, still-unstored thing (`ChannelTabs.tsx`).
5. **`strategies.channels` is not derived from the workflow's steps.** Both are stored; editing the
   workflow does not update the strategy's channel list.
6. **`daily_rollups` is written incrementally, with gaps.** A real send upserts `reached`, a
   matched inbound reply upserts `engaged`/`replied`; `positive` and `meetings` are still only the
   sample's. Rollups have no strategy or person dimension, so Analytics cannot filter by either.
   The prospect profile already reads
   `events` and `workflow_runs` per person, so its engagement section fills in once the engine writes them.
   - **A segment can't be renamed or exported yet**, and there is no bulk action on a selection of
     leads — the table has no row checkboxes, so bringing bulk actions back means bringing the
     selection back with them. (A single lead can be added, edited and deleted.) The import review
     lists the first 500 rows; every row is still imported.
7. **Strategy counters are denormalised and nothing maintains them** (`sent`, `delivered`,
   rates): the sample's are derived from its rollups (a test pins that); real strategies show "—".
8. **Auth has no email verification, password reset link, OAuth or login rate limiting.** Fine for
   an invited handful; none of it is optional before a public launch. Login is brute-forceable
   (scrypt's cost slows it but does not stop it). Roles exist (`memberships.role`) but nothing
   enforces them. Sessions are not refreshed on use, so an 8-hour session ends mid-work.
9. **No way to join an existing workspace.** Every signup creates its own, so invited testers
   cannot share audiences or strategies. Needs an invite-to-workspace flow; the schema already supports
   many users per workspace. Settings → Team says inviting is unavailable.
10. **Uploads are capped at 4 MB** because Vercel rejects larger request bodies before our code
    runs. A bigger limit needs a direct-to-storage upload.
11. **Two simultaneous uploads containing the same new person can create two audiences** (there is no
    unique key on an audience's email, by design: contacts without one exist). The second upload would
    merge into the first.
12. **The Inbox cannot mark a thread read/handled** (no endpoint) and cannot reply (nothing sends).
13. **Deferred.** A lead still has two detail surfaces: the read-only `lead-drawer.tsx` and the
    `lead-form.tsx` modal its Edit button opens. Making the drawer editable in place (and deleting
    the modal) is a real refactor and was left out. There is also no global search: the top bar has
    no Search button because there is no palette behind it — building search means building the
    palette, not adding the button.
    **Setup → Messages is read-only.** It lists the real copy out of every stored workflow, but
    editing a template there is not built: the touch's copy is still edited through the stored
    graph. The template editor's own open questions (variables with fallbacks — the fallbacks
    themselves do persist in `workspace_settings`, though no screen edits them now — the LinkedIn 300-character invite limit, and the
    WhatsApp/DLT approval states) are unanswered, and WhatsApp and SMS cannot send anyway.
14. **Workspace-level channel on/off switches do not exist.** The builder's `channelsOff` prop and
    its "…is off in Settings" tooltip are left in place for when they do; nothing passes it today.
15. **The demo strategy's funnel is part of every workspace's Home and Analytics totals, for good.**
    It is labelled (`DemoNote`), but real activity will add to it rather than replace it. When a
    sender lands, decide whether the totals should exclude `is_sample` rollups by default; the rows
    are already flagged for it.
16. `gtm_mock.html` at the root is a standalone design reference, not part of the app.

## 8. Running it locally

```bash
cp .env.example .env.local      # fill DATABASE_URL (pooled) + SIGNUP_ALLOWED_EMAILS
npm run db:migrate              # applies drizzle/*.sql
npm run db:seed                 # OPTIONAL demo workspace; local/demo only (see below)
npm run dev
```

Without `DATABASE_URL` the app falls back to `MemoryRepository` and the single demo account, so a
bare clone still runs — but nothing persists, sign-up is unavailable, and the live screens show
the in-memory seed.

**Environments (a decision, not an accident).** Vercel deploys only `main` and `dev`
(`vercel.json`).

| | `main` (production) | `dev` |
|---|---|---|
| `DATABASE_URL` | set (pooled Neon Postgres, schema from `drizzle/`) | **unset, on purpose** |
| Mode | database: real accounts, persisted data | demo: hardcoded demo account, in-memory data that resets on restart |
| Sign-up | invite-only via `SIGNUP_ALLOWED_EMAILS` | says it is unavailable (nowhere to put an account) |

**Do not create a database or a Neon branch for `dev`.** Develop and verify against a local
Postgres or the in-memory demo mode instead. Promoting is merging `dev` into `main`; run
`npm run db:migrate` against the production database first **only if the change adds a file under
`drizzle/`**. `0002_sample_flag` and `0003_workspace_data_model` do: `main` must not receive code
that reads their columns/tables before the migration has run on Neon (apply with the Neon MCP
`run_sql_transaction`, one statement per element, then insert a `drizzle.__drizzle_migrations` row
with the file's real sha256 and the journal entry's `when`). Check the generated SQL's statement
*order* first: drizzle-kit emitted `ADD CONSTRAINT … PRIMARY KEY(…, is_sample)` before `ADD COLUMN
is_sample` in 0003 and it had to be reordered by hand.

**Giving access to a few testers** (deployed, no seed needed): set `DATABASE_URL` (pooled) and
`SIGNUP_ALLOWED_EMAILS` on the host, run `npm run db:migrate` once, and tell each person to open
`/signup` with the address you listed. A tester who forgets their password:
`read -rs NEW_PASSWORD && export NEW_PASSWORD && npm run db:set-password -- their@email.com`.

**Do not run `db:seed` against a database real people use** without setting `SEED_OWNER_EMAIL` and
`SEED_OWNER_PASSWORD`: the fallback password is committed in `scripts/seed-db.ts`.

**Deploys.** `vercel.json` carries one key, `ignoreCommand`: Vercel skips the build unless
`VERCEL_GIT_COMMIT_REF` is exactly `main` or `dev`, so only those two branches deploy and feature
branches stay local to development. The exit codes are inverted from the obvious reading — **exit 0
skips the build, exit 1 (or any non-zero) builds it**. Vercel reads this file from the branch it is
about to deploy, so a branch cut before this landed still deploys until it picks the file up.
To deploy another branch, add it to that test rather than editing the dashboard, so the rule stays
in version control.

---

## Maintaining this file

Update CONTEXT.md **in the same commit** as the change whenever you:
- add, move or delete a file, route or table → §3 and the §4 index
- change an architectural rule or seam → §2, §4, §5
- make a screen live, or add a repository method → §3 table and §5/§7
- close or discover a gap → §7
- hit a non-obvious constraint that cost debugging → §5 (this is the highest-value section;
  it is what stops the next agent repeating the same mistake)

Keep it a **map, not prose**: tables over paragraphs, one line per file, line counts so an agent
can judge what a file costs to read. If a section stops earning its tokens, cut it.
