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
| `memory.ts` | 971 | In-memory impl over the seed. No-config fallback; writes last until restart. **All its mutable state lives on `globalThis` via `shared()`** (see §5). Workflows: a `Map` by strategy id, falling back to the demo `WORKFLOWS` matched on strategy name, so the seed's four multichannel strategies open a real graph. |
| `pg.ts` | 1759 | Postgres impl via Drizzle. Filters `workspace_id` on every read *and* write (the `ws()` helper). Audiences page in SQL; strategies aggregate in JS. Uploads, segments, accounts, workflows and the sample world are all real tables now. |
| `seed.ts` | 213 | The `dev` (no-database) workspace, **derived from `sample.ts`**: one demo strategy, its audiences, threads, messages, tasks and per-channel rollup rows (`ROLLUPS`), and no accounts or domains. Exports the same shapes the repository returns, so `memory.ts` reads it like rows. |
| `sample.ts` | 195 | The demo strategy every workspace has: one paused multichannel strategy + 8 audiences, their conversations, to-dos and funnel. No accounts. Import-free; `tests/sample.test.mjs` pins that every email is on the reserved `.example` domain and every phone in the fictional 555-01xx range, so a sample audience can never be a real person. |
| `sampleSeed.ts` | 174 | Server-only. Inserts the demo strategy, from the `signUp` transaction **and** from `PgRepository.ensureDemo`: strategy + workflow, 8 audiences, 4 conversations and 3 to-dos, the funnel by day. All `is_sample`. No accounts, mailboxes or domains. |
| `setup.ts` | 151 | `setupChecks(accounts, domains)`: what is and is not set up, **computed from the workspace's own accounts**. Drives the Configuration overview, the tab badges and the rail badge. Import-free, tested. |
| `query.ts` | 68 | Pure filter/sort/paginate helpers shared by both impls. Import-free, tested. |
| `validate.ts` | 651 | Write-path validation, `{ok,data}|{ok,errors}`. Import-free, erasable, tested. An audience's `linkedin` goes through `normaliseUrl` (same rule as the upload's `checkUrl`: any web URL, `https://` added); a create with no stage starts at `new`. |

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
- **engine (not yet written to)** `workflow_runs` `step_jobs`
- **cross-channel settings** `workspace_settings` (one row per workspace, three jsonb blobs: Variables/Sending rules/Compliance — see Configuration below)

`workspace_id` is on every tenant-scoped table. `step_jobs.run_at` + `FOR UPDATE SKIP LOCKED`
is the job queue — no Redis or SQS needed.

### Connecting LinkedIn — `lib/channels/` + `app/api/integrations|webhooks/`

Driving LinkedIn means holding a member session and replaying actions against LinkedIn's own
internal endpoints. **We rent that, we do not build it** — and every call goes through one
interface so the vendor can be replaced without touching a route, a screen or a table.

| File | Purpose |
|---|---|
| `adapter.ts` | `LinkedInChannelAdapter`: `createHostedAuth`, `getAccount`, `deleteAccount`, `listWebhooks`, `createWebhook`. Plus `ProviderAccount` and `ProviderError`. The seam. |
| `unipile.ts` | The one implementation. `https://{DSN}/api/v1`, `X-API-KEY`, 15 s timeout. Server-only: the key can read every connected account. |
| `unipileRequests.ts` | The **pure** half — `unipileBaseUrl`, `hostedAuthBody`, `readHostedAuthUrl`, `readAccount`, `readWebhooks`. Import-free, so `tests/unipile.test.mjs` pins the request contract with no network and no key. |
| `events.ts` | Normalises the webhook payloads. Import-free, tested. |
| `webhookConfig.ts` | The webhook contract: `WEBHOOK_HEADER`, `WEBHOOK_QUERY_PARAM`, `WEBHOOK_SOURCES`, and the pure, tested `authorizeFromCarriers()` match. No value imports but `node:crypto`, so the registration **script** and `tests/webhookConfig.test.mjs` can both load it directly. |
| `webhookAuth.ts` | Untested glue: pulls the header and query-param candidates out of a `Request` and `UNIPILE_WEBHOOK_SECRET` out of the environment, then calls `authorizeFromCarriers()`. |
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
- **Unipile's v1 and v2 docs disagree on webhook field names** (`AccountStatus` wrapper vs
  `{event,data}`; `message_received` vs `message.created` vs `message.new`). `events.ts` reads
  every documented spelling and refuses a payload missing what it needs, rather than betting on
  one. An unrecognised status is `error`, never `ok`: an account in a state we do not understand
  must not read as usable. Note `event: "account.status"` is the *event's* name and is deliberately
  not read as a status.

Inbound messages land in the Inbox **only** when the sender is already an audience in that workspace,
matched on their LinkedIn handle. A message from a stranger is kept as an `events` row and nothing
else: inventing a person out of a webhook payload would put them in someone's audience list.

Nothing sends. `SENDING_ENABLED` is still false — connecting an account is not sending, and the
drawer says as much.

### HTTP — `app/api/` + `lib/http.ts` + `lib/api.ts`
`lib/http.ts` (56L) holds `withUser`, `json`, `fail`, param parsers — so auth, caching and error
shapes are identical everywhere. `lib/api.ts` (113L) is the typed browser client; client
components call it, never `fetch("/api/...")` by hand. Server components read the repository
directly.

| Endpoint | Methods | Notes |
|---|---|---|
| `/api/me`, `/api/workspace`, `/api/overview` | GET | |
| `/api/tasks`, `/api/tasks/[id]/complete` | GET, POST | |
| `/api/audiences`, `/api/audiences/[id]` | GET POST PATCH DELETE | full CRUD. List takes `?segmentId=` (one audience) and searches name, company, title, email and tags |
| `/api/audiences/[id]/profile` | GET | the prospect profile (`getProspect`): company, journey, audiences, engagement, timeline, to-dos. Read-only; 404 across workspaces |
| `/api/strategies`, `/api/strategies/[id]` | GET POST PATCH DELETE | full CRUD. A multichannel strategy needs ≥ 2 channels (validate.ts). |
| `/api/strategies/[id]/workflow` | GET, PUT | the strategy's workflow. PUT takes `{ name, graph }` and **rebuilds the graph from a whitelist** (`validateWorkflowGraph`); 422 names the reason. 404 for another workspace's strategy. |
| `/api/workflows` | GET | every workflow in the workspace, newest edit first |
| `/api/accounts` | GET | the workspace's LinkedIn accounts, mailboxes and sending domains, each with the strategies that use it |
| `/api/accounts/[id]` | PATCH DELETE | PATCH is the dials only (LinkedIn daily caps; mailbox cap + rotate) — identity/state/health are never accepted. DELETE disconnects at the provider first, then removes the row |
| `/api/accounts/[id]/strategies` | PUT | `{ strategyIds }` replaces the strategies sending from an account; a foreign strategy id is a 422 |
| `/api/accounts/activity` | GET | `?days=` — real per-account counts from `events` (inbound messages, status changes). Zero means zero, never an estimate |
| `/api/integrations/linkedin/connect` | POST | opens a Unipile hosted sign-in; `{ accountId }` repairs one instead. 503 `not_configured` with no API key, 502 when the provider refuses. **GET is a 405** — a link prefetch must not open a sign-in |
| `/api/integrations/linkedin/connect/[id]` | GET | how one connect attempt of *this workspace's* is going; the screen polls it |
| `/api/webhooks/unipile/notify` | POST | hosted sign-in finished. See "Connecting LinkedIn" below for why this one has no secret and is still safe |
| `/api/webhooks/unipile/accounts` | POST | account status changed. Shared-secret header; writes `channel_accounts.state` |
| `/api/webhooks/unipile/messages` | POST | inbound message. Shared-secret header; idempotent on the provider's message id |
| `/api/badges` | GET | `{ tasks, inbox, config }`: the rail counts, fetched on every navigation |
| `/api/settings` | GET, PATCH | the Configuration screen's Variables/Sending rules/Compliance tabs (`workspace_settings`). PATCH body carries only the section(s) changed (`{ variableFallbacks? \| sendingRules? \| compliance? }`); shape/range checked in `validate.ts`, merged into the stored row by the repository. Always real for the signed-in workspace, but `SENDING_ENABLED` stays false so nothing acts on it — see Configuration below |
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
step share; it adds `report.plan`, an `ImportPreview`) · `phone.ts` `segments.ts` `table.ts` `limits.ts` `ctx.ts`.
UI: `upload-audiences.tsx` (349L) is the three-step modal (File → Match columns → Review & save) ·
`import-review.tsx` (272L) is its last step (totals, filterable row review, invalid-vs-blank
validation log, consent attestation) · `lead-drawer.tsx` (216L) is the profile drawer opened from
an Audiences row (the repository/route names stay `Prospect*` — see CLAUDE.md on the holdover) ·
`lead-form.tsx` (170L) adds or edits one lead by hand, opened from the Audiences header and from
the drawer's Edit button. **It asks only name, email, phone, LinkedIn (+ the consent attestation)**
and sends only those, so an edit never touches imported company/title/extra columns and the server
defaults the rest (stage `new`, source `form`, owner = creator). Stage, source, score, tags and
next step are not shown anywhere in this UI — they still exist in the schema.

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
| `shell/AppShell.tsx` | 136 | — | the frame: `Sidebar` + children above `lg`, top bar + animated sheet below it. Detects the two **focus routes** (`/dashboard/strategies/new`, `/dashboard/workflows/[id]`) and renders them chromeless. Layout is `flex flex-wrap`, never `fixed`/`sticky`/`h-screen` |
| `shell/sidebar.tsx` | 162 | — | `Sidebar` (252px) and `SidebarRail` (60px, builder only), `NavList`, `AccountCard`, `SignOutItem` (inline failure message), `NavBadge` (grey = information, black = needs you). **Five destinations** (`DASHBOARD_NAV` via `shell/nav.ts`) — see §2d |
| `shell/page.tsx` | 95 | — | `TopBar`, `PageHeader`, `PageBody` (`px-8 pt-6 pb-12`, `gap-5`), `SetupTabs` (animated underline, Overview · Config · Messages) |
| `shell/workspace-context.tsx` | 63 | `/api/badges` | user + workspace from the layout, badges refetched on every navigation, `refreshBadges()` for a screen that just changed one |
| `shell/use-sign-out.ts` | 34 | `/api/logout` | navigates only after the server confirms, with a **full page load** — see §5 |
| `home/home-view.tsx` | 388 | `/api/overview`, `/api/strategies`, `/api/tasks`, `/api/accounts` | four metric tiles (fixed 7-day window; ranges belong to Analytics, which it links to), To do with a Segmented filter and optimistic completion, Sending today from the accounts' quotas, Strategies, Setup health computed from `setupChecks`. The greeting is computed after mount (no date-dependent server markup) |
| `inbox/inbox-view.tsx` + `composer.tsx` + `messages.tsx` | 425 + 105 + 43 | `/api/threads`, `/api/threads/[id]` | four channel blocks that double as the filter, each stating its **capability before its action** (email replies here; LinkedIn and WhatsApp hand off; calls log an outcome). The composer is closed by default and closes on any switch. With `!SENDING_ENABLED` a reply is saved as a note, never sent |
| `audiences/audiences-view.tsx` | 456 | `/api/audiences`, `/api/audiences/segments` | drop zone, filters, segment cards that narrow the table, paged leads table, copy-email, Add a lead, delete with `Confirm`; a row opens `lead-drawer.tsx`, whose Edit opens `lead-form.tsx`. **No row checkboxes** — nothing consumed the selection and there is no bulk action |
| `strategies/strategies-view.tsx` | 302 | `/api/strategies`, `/api/strategies/[id]` | **the only strategy list** (§2d). Status Segmented + search + channel select; Pause/Resume, Duplicate (creates the strategy *and* copies its graph), Delete. A row opens the builder |
| `strategies/new-strategy-view.tsx` | 236 | `/api/strategies`, `/api/strategies/[id]/workflow` | focus route. Shape (multichannel / single channel), then a play or a blank sequence; creates the strategy + its workflow and opens the builder — **never on a GET** |
| `builder/builder-view.tsx` | 452 | `/api/strategies/[id]/workflow` | see below |
| `setup/setup-overview-view.tsx` + `account-settings.tsx` | 401 + 132 | `/api/accounts` | connected accounts, each account's dials behind its Settings, hosted-sign-in result banner, disconnect. No Pause: nothing is sending to pause |
| `setup/setup-config-view.tsx` + `setup-rules.tsx` | 249 + 539 | `/api/accounts`, `/api/settings` | the provider catalogue (`providerView()`) and starting a LinkedIn sign-in; `setup-rules.tsx` is the stored rules (sending window, limits, stop rules, skip rules, variable fallbacks, compliance) plus the Workspace card and "Remove sample data" |
| `setup/setup-messages-view.tsx` | 283 | `/api/workflows` | **all message copy in the workspace, in one place**, read out of every stored graph by `lib/ws/messages.ts`. The builder never edits copy (§5) |
| `analytics/analytics-view.tsx` + `charts.tsx` | 138 + 89 | `/api/analytics` | one report, no tabs. Hairline grid, single near-black accent |
| `ui/` | ~700 | — | `button` (cva: default/outline/ghost/dashed/danger/warning/inverse; sizes sm 30 · md 34 · lg 38 · icon 30 · icon-sm 28) · `card` · `status-pill` · `segmented` (shared-layout thumb) · `channel-tile` · `confirm` · `motion` (`Appear`, `Swap`, `Row`, `Expand`, and the one easing pair) · `misc` (`Initials, Meter, Switch, NativeSelect, SearchInput, Sparkline, MetricTile, EmptyState, Tag, ChannelChip, Skeleton, LoadError`) |
| `lib/ws/` | 462 | — | `utils.ts` (`cn`, `fmt`, `pct`, `initialsOf`) · `channels.ts` (the domain `Channel` union → display name, monogram, colour, order) · `format.ts` (metric values and footers; says "Nothing yet"/"No comparison" rather than inventing a 0%) · `use-async.ts` (the loading/ready/failed/retry contract every card shares) · `plan.ts` (the graph ⇄ ordered-list seam — see below) · `messages.ts` (real copy out of stored graphs) |
| `components/glass.ts` | ~230 | — | refraction + specular runtime, **marketing-only** (`SiteGlass.tsx` imports it). Was `components/app/glass.ts` |

**Motion.** `framer-motion` only, and only `transform`/`opacity`: `Appear` (a 4px rise, staggered
by `index`), `Swap`/`Row` through `AnimatePresence`, `Expand` for a disclosure, and one
`layoutId` thumb shared by `Segmented` and `SetupTabs`. Every one of them reads
`useReducedMotion()`, and `workspace.css` zeroes durations under `prefers-reduced-motion` as a
backstop.

### Workflow builder — `components/ws/builder/builder-view.tsx` (452L)
**It is an ordered list, not a canvas.** The node-graph surface (pannable canvas, step palette,
property inspector, ~2000L across four files) is **deleted**: a sequence of touches is a list, and
the graph bought nothing a list does not say more plainly. Do not reintroduce it.

The screen reads, top to bottom, in one 820px column: *Here's the plan* (the save state and the
name) · *Who it goes to* · *What happens in order* (each touch's channel, template and day, plus
one **Pace** control — gentle / standard / persistent — that rewrites every gap) · *When to stop*
(stop-on-reply, locked) · *Nothing sends yet*.

**`lib/ws/plan.ts` (219L) is the seam.** The stored shape is unchanged — still a node/edge graph in
the `workflows` table, still validated by `validateWorkflowGraph()`. `readPlan(graph)` walks
`audience → out`, folds each `wait.days` into the next touch's `gap`, and returns an ordered
`Plan`; `writePlan()` rebuilds the audience → wait → touch chain, preserving each node's existing
data, and re-runs `layout()`. `paceOf()`/`repace()` map gaps to a pace and back.

**A plan that branches is read-only, not flattened.** `readPlan` sets `linear: false` on any fork,
`cond` or `split`. The editor then disables every control (`Segmented` has a `disabled` prop for
exactly this), makes the name `readOnly`, shows a banner saying why, and `change()` returns early —
a stored branching graph is never silently rewritten into a straight line.

**Model.** `lib/app/workflow.ts` (946L) still owns `WorkflowGraph`, the templates,
`graphFromTemplate()`, `toGraph`/`fromGraph` and `validateWorkflowGraph()` /
`validateWorkflowName()` — a whitelist rebuild that rejects unknown step-data keys (incl.
`__proto__`), bad sockets, a second Audience, **cycles** and oversize graphs. Pinned by
`tests/workflow.test.mjs` + `tests/workflowPersist.test.mjs`. **@xyflow/react was never a
dependency** and the `.react-flow__*` class names are gone with `app.css`.

**Autosave.** 800 ms after the last change, serialised, flushed on `pagehide`/unmount with a
`keepalive` fetch. The save state is `idle | pending | saving | saved | failed` and starts at
`idle` when a stored graph loaded — it used to start at "Unsaved changes" on a page that had
changed nothing. Status (live/paused) belongs to the *strategy*, not the graph.

**The builder never edits message copy.** Each touch selects a template; the copy lives on
Setup → Messages. That is a product decision, not a missing feature.

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

**Nothing sends, and the UI says so (`lib/capabilities.ts`).** `SENDING_ENABLED = false` gates
every path to "live". The builder shows "Nothing sends yet" where Launch would be (a disabled
Launch made its own confirmation dialog unreachable) and has no Test button. The Strategies table
offers Pause, not a switch that could only fail one way. Flip the flag only in the commit that
lands a sender.

**Sample data** carries a "Sample" tag on the row where it appears. It cannot be removed: there is
no "Remove sample data" control, route or repository method (it used to live on the Workspace card
and at `DELETE /api/workspace/sample`).

**Strategy creation has one entry point:** Strategies → New strategy → `/dashboard/strategies/new`
(`new-strategy-view.tsx`). It asks the shape and nothing else, because the old dialog's other four
questions could not be answered before seeing the strategy. Channels follow from the steps; status
follows from what the user does.

### Setup — `/dashboard/configuration` — one screen, three tabs
`setup-overview-view.tsx` · `setup-config-view.tsx` (`/dashboard/configuration/config`) ·
`setup-messages-view.tsx` (`/dashboard/configuration/messages`). Titled "Setup" and reached from
the rail — it is one of the six `DASHBOARD_NAV` destinations, so it works on a phone.

**It was six tabs, and before that three rail destinations.** Overview · LinkedIn · Email ·
Connections · Rules · Workspace collapsed to **Overview · Config · Messages**: LinkedIn and Email
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

**WhatsApp, Calls and SMS** are a Planned row on Config — no account or number concept exists, so
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
`dataQuery.test.mjs` · `demoRequest.test.mjs` · `workflow.test.mjs` · `validate.test.mjs` ·
`adapt.test.mjs` · `signup.test.mjs` · `sample.test.mjs` · `setup.test.mjs` · `workflowPersist.test.mjs` · `audiencesValidation` `audiencesMerge` `audiencesJourney` `audiencesProfile` `audiencesImportPlan` `prospect` `workflowSegment` ·
`unipile.test.mjs` (the Unipile request contract + response readers) · `unipileEvents.test.mjs`
(both documented webhook envelopes) · `webhookConfig.test.mjs` (the header/query-param match) —
**221 tests**
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
| Add a Setup tab | `SetupTabs` in `components/ws/shell/page.tsx` + a route under `app/dashboard/configuration/`. There are three (Overview · Config · Messages) and a tab whose content would be "nothing to configure yet" belongs on Config as a Planned row instead |
| Offer a new builder step | `STEPS` + `defaults()` + `stepLabel()` **and** `PALETTE` in `lib/app/workflow.ts`. `STEPS` describes a step so stored graphs render; `PALETTE` is what a user may add, and only steps that can actually run go in it (`tests/workflow.test.mjs` pins that) |
| Change what a new workspace starts with | `lib/data/sample.ts` (content, tested) and `sampleSeed.ts` (insert). Keep every email on `.example` and every phone in 555-01xx — the tests enforce it. |
| Add a field to a stored workflow | `WorkflowGraph` + `validateWorkflowGraph` in `lib/app/workflow.ts` (the whitelist **drops/refuses** anything not listed) + a case in `tests/workflowPersist.test.mjs` |
| Change what a connected account can do | `lib/data/types.ts` (`LinkedInSettings`/`EmailSettings`) → `validateAccountPatch` in `validate.ts` → `pg.ts` + `memory.ts` → `components/ws/setup/account-settings.tsx` |
| Add a setup check | `lib/data/setup.ts` (and its test). It is derived from `AccountsSnapshot`; do not hardcode |
| Swap the LinkedIn vendor | implement `LinkedInChannelAdapter` (`lib/channels/adapter.ts`) and return it from `getLinkedInAdapter()`. Nothing else — that is what the interface is for. |
| Handle another provider webhook | a reader in `lib/channels/events.ts` (+ a case in `tests/unipileEvents.test.mjs`), a writer in `inbound.ts`, a route under `app/api/webhooks/unipile/`, and the `source` in `webhookConfig.ts` so the registration script picks it up |
| Add a per-account figure | `AccountActivity` in `lib/data/types.ts` → `accountActivity()` in **both** repository impls → `SeatActivity` in `ChannelTabs.tsx`. Count real `events` rows; never estimate |
| Change how uploaded people are matched | `lib/audiences/merge.ts` (`mergeAudiences` + `findInJourney`; `planImport` follows `mergeAudiences` automatically) and `tests/audiencesMerge`/`audiencesJourney`/`audiencesImportPlan` |
| Change what the import review shows | `ImportPreview`/`ReviewRow` in `lib/audiences/segments.ts` → `analyseUpload` in `lib/audiences/analyse.ts` → `components/ws/audiences/import-review.tsx` |
| Add something to the prospect profile | `ProspectProfile` in `lib/data/types.ts` → `ProspectFacts` + `buildProspect` in `lib/audiences/prospect.ts` (+ `tests/prospect.test.mjs`) → `getProspect` in **both** `pg.ts` and `memory.ts` (scope every query by `workspace_id`) → `components/ws/audiences/lead-drawer.tsx` |
| Add a builder step kind | `STEPS` + `defaults()` + `stepLabel()` in `lib/app/workflow.ts`; tests pin the five fixture graphs in `WORKFLOWS` |
| Add a Configuration setting | the catalogue entry in `lib/app/configuration.ts` (and its default in `defaultWorkspaceSettings()`), a field on `WorkspaceSettings` in `lib/data/types.ts`, a check in the matching `validate*Patch` in `lib/data/validate.ts`, then a row in `components/ws/setup/setup-rules.tsx`. Rows are its own `<Field>`/`<ToggleLine>` — don't hand-roll one, and don't write a rule's label or hint into the component: the catalogue owns that copy. |
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
- **Layout without breakpoints.** The shell is `flex flex-wrap` (sidebar `basis-[252px] grow`, main
  `grow-[999] basis-[760px] min-w-0`), grids are `repeat(auto-fit,minmax(Npx,1fr))` — or
  `auto-fill` where a single card must not stretch the full width — and a wide table sits in
  `overflow-x-auto` with a `min-w`. **Never make the sidebar `fixed`, `sticky` or `h-screen`.** The
  one breakpoint is `lg`, where the rail becomes a top bar and a sheet.
- **Spacing is fixed, not improvised.** Page body `px-8 pt-6 pb-12`, `gap-5` between sections, card
  header `px-[18px] py-[14px]`, rows `py-[11px]`–`py-[13px]`. Matching these is what makes the
  margins line up across screens; a new card that invents its own padding shows immediately.
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

1. **Enrollment: when does an audience "enter a strategy"?** `audiences.strategy_id` is what the upload
   dedupe reads, and today it is set only by hand (the audience editor) and by the sample. Choosing a
   segment as a workflow's audience does **not** assign its audiences, and nothing releases them. The
   natural moment is Launch (not built). Until then, two overlapping files uploaded for two draft
   strategies will not warn about each other.
2. **No execution engine.** `workflow_runs` / `step_jobs` are shaped for it; nothing writes them.
   Intended shape: an authenticated `/api/jobs/tick` claiming due rows with
   `FOR UPDATE SKIP LOCKED`, poked by cron (a GitHub Actions schedule is a free MVP scheduler).
   `SENDING_ENABLED` stays false until it lands.
3. **LinkedIn connects; email does not.** LinkedIn accounts connect through Unipile's hosted
   sign-in (see "Connecting LinkedIn" in §3) wherever `UNIPILE_DSN` + `UNIPILE_API_KEY` are set;
   without them the screens say so rather than offering a button that 503s. Still open on this
   path: **no throttle service** (the per-account caps are stored and shown but nothing enforces
   them — that is the execution engine, §2), **no profile enrichment** (`GET /users/{id}` is not
   called, so a connected seat adds no audience context), and **nothing sends**. Mailbox connection is
   not built at all: `sending_domains` is read-only and "Connect mailbox" is still disabled.
4. **Configuration rules are stored but not enforced.** Variables, sending rules and compliance now
   persist in `workspace_settings` (`/api/settings`), but nothing reads that table yet — enforcing
   it needs the execution engine (§2) and `SENDING_ENABLED` to flip. The channel tabs' "All
   accounts" / Tracking switches are a separate, still-unstored thing (`ChannelTabs.tsx`).
5. **`strategies.channels` is not derived from the workflow's steps.** Both are stored; editing the
   workflow does not update the strategy's channel list.
6. **`events` is written only by the LinkedIn webhooks, and no job builds `daily_rollups`.**
   Account connects, status changes and inbound messages land in `events` (and `/api/accounts/activity`
   counts them); nothing else does. Only the sample's rollups exist,
   so Analytics is real SQL over invented numbers until the engine lands. Rollups have no strategy
   or person dimension, so Analytics cannot filter by either. The prospect profile already reads
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
    themselves do persist, see Config — the LinkedIn 300-character invite limit, and the
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
