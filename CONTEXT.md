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
| Signed-in workspace | `/dashboard/**` | `app/app.css` | `lib/data/` (repository) + `lib/app/` (hardcoded) |

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
`globals.css` (marketing) and `app.css` (workspace) are **not** shared. A redesign that put the
landing page on `app.css` was rolled back. `app.css` is imported by `app/dashboard/layout.tsx`
only. The marketing site still implements an iOS "liquid glass" look (`globals.css` +
`SiteGlass.tsx`). **The workspace does not any more**: a later pass flattened every dashboard
surface to opaque `var(--surface)` panels on a flat `#FAFAF8` background — see §5, "Workspace is
flat, not glass."

### 2b. Two vocabularies, bridged by an adapter
| | `lib/data/` (canonical, DB-backed) | what some screens render (`lib/app/`) |
|---|---|---|
| Lead id | `"l_omar"` (string) | numeric in the old demo |
| Channel | `linkedin` `email` `whatsapp` `call` `sms` | `li` `mail` `wa` `call` `sms` |
| Campaign type | `standalone` `multichannel` | `single` `multi` |
| Lead stage | lowercase, 9 values | Capitalised, 9 values |

`lib/data/` is the real one. `lib/app/adapt.ts` maps between the two vocabularies for the screens
that still render the short channel keys and capitalised stages (Leads, Campaigns). **`lib/app/` no
longer holds any workspace data** — it is presentation helpers (`channels.ts`, `leads.ts` stage
colours/score band/avatar tints, `campaigns.ts` status tags), the workflow model, the integrations
catalogue and the Configuration rule defaults.

### 2c. Every workspace screen reads its own workspace
Home, Inbox, Leads, Campaigns (+ builder), Analytics and Setup all read through the repository /
REST API, so a workspace only ever sees its own rows.
**There is no demo content in the app any more except the sample world** (`lib/data/sample.ts` + `sampleSeed.ts`, §3):
rows flagged `is_sample`, seeded at signup, labelled "Sample" in the UI and deleted by "Remove
sample data". In the no-database demo mode (the `dev` deployment) `MemoryRepository` serves the
old demo dataset (`lib/data/seed.ts`) through the same API, so the same screens work there.

**The rule for new work:** a screen that needs data gets it from a repository method + an API
route. Never put figures, names, accounts or campaigns in a component or in `lib/app/`.

### 2d. Five destinations, and one record is never two sections
`DASHBOARD_NAV` in `lib/nav.ts` carries **Home, Inbox, Leads, Campaigns, Setup**, and the rail and
the mobile tab bar render the same five. There used to be nine, which did not fit the tab bar, so
below 820px — where `app.css` hides the rail — Configuration, Integrations and Settings were
unreachable on a phone. Two merges fixed that:

- **A multichannel campaign *is* its workflow** (same id, one stored graph), so there is no
  Workflows section. Campaigns is the list; `/dashboard/workflows/[id]` is still the builder, and
  `/dashboard/workflows` redirects to Campaigns.
- **Setup is Configuration + Integrations + Settings.** All three answered "what is connected and
  how does sending behave"; Settings held no controls at all, only read-only copies of the other
  two, and Integrations drew a tab strip across the three. `/dashboard/settings` and
  `/dashboard/integrations` redirect to `/dashboard/configuration`.

Analytics is a report rather than a place you live, so Home links to it instead of the rail.

**The rule for new work:** before adding a rail item, check the record it lists is not already
listed somewhere else under another name. Five fits the tab bar; a sixth does not.

---

## 3. File map

### Storage seam — `lib/data/` (start here for anything data-related)
| File | L | Purpose |
|---|---|---|
| `types.ts` | 418 | Domain types, incl. `ProspectProfile`. Import-free + erasable (loadable by `node --test`). |
| `repository.ts` | 269 | **The interface every page and route talks to.** `Ctx` is the first arg of every method — tenancy cannot be forgotten. `WriteError` ≠ `null` ≠ throw → 422/404/500. |
| `index.ts` | 22 | `getRepository()` factory. Returns Postgres when `DATABASE_URL` is set, memory otherwise. |
| `memory.ts` | 971 | In-memory impl over the seed. No-config fallback; writes last until restart. **All its mutable state lives on `globalThis` via `shared()`** (see §5). Workflows: a `Map` by campaign id, falling back to the demo `WORKFLOWS` matched on campaign name, so the seed's four multichannel campaigns open a real graph. |
| `pg.ts` | 1759 | Postgres impl via Drizzle. Filters `workspace_id` on every read *and* write (the `ws()` helper). Leads page in SQL; campaigns aggregate in JS. Uploads, segments, accounts, workflows and the sample world are all real tables now. |
| `seed.ts` | 831 | Demo dataset. The only file that goes away once real data exists. |
| `sample.ts` | 214 | The sample content every new workspace starts with: one paused multichannel campaign + 8 leads. Import-free; `tests/sample.test.mjs` pins that every email is on the reserved `.example` domain and every phone in the fictional 555-01xx range, so a sample lead can never be a real person. |
| `sampleSeed.ts` | 216 | Server-only. Inserts the whole sample world **inside the `signUp` transaction**: campaign + workflow, 8 leads, 4 conversations and 3 to-dos, the funnel by day, a LinkedIn account + mailbox + sending domain assigned to the campaign. All `is_sample`. |
| `setup.ts` | 151 | `setupChecks(accounts, domains)`: what is and is not set up, **computed from the workspace's own accounts**. Drives the Configuration overview, the tab badges and the rail badge. Import-free, tested. |
| `query.ts` | 68 | Pure filter/sort/paginate helpers shared by both impls. Import-free, tested. |
| `validate.ts` | 651 | Write-path validation, `{ok,data}|{ok,errors}`. Import-free, erasable, tested. A lead's `linkedin` goes through `normaliseUrl` (same rule as the upload's `checkUrl`: any web URL, `https://` added); a create with no stage starts at `new`. |

### Database — `lib/db/`
| File | L | Purpose |
|---|---|---|
| `schema.ts` | 592 | 22 tables. `campaigns.is_sample` / `leads.is_sample` mark invented rows (migration `0002_sample_flag`). Drizzle definitions + Postgres enums. |
| `client.ts` | 60 | The one `pg` Pool, cached on `globalThis`. **Needs a pooled connection string.** |
| `../lib/password.ts` | 48 | scrypt hash/verify. Imports only `node:crypto`, so the seed and tests can load it. |
| `../drizzle/*.sql` | — | Generated migrations, committed. Never `db:push` at a deployed DB. |
| `../scripts/seed-db.ts` | 480 | `npm run db:seed`. Idempotent by workspace: deletes `w_demo` and rebuilds it, so a real tenant in the same database is untouched. |

Tables, grouped:
- **tenancy** `workspaces` `users` `memberships` `sessions`
- **org-level channel accounts** `channel_accounts` `campaign_accounts` (many to many) `sending_domains` `connect_sessions`
- **uploads** `uploads` (parked parsed files, swept after 1 h) `segments` `segment_leads`
- **domain** `leads` `campaigns` `workflows` `threads` `messages` `tasks`
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
| `components/app/integrations/ConnectLinkedIn.tsx` | `useLinkedInConnect()` — popup + poll, and the one status line. |
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
  a workspace, lead or account id from a request body.
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

Inbound messages land in the Inbox **only** when the sender is already a lead in that workspace,
matched on their LinkedIn handle. A message from a stranger is kept as an `events` row and nothing
else: inventing a person out of a webhook payload would put them in someone's lead list.

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
| `/api/leads`, `/api/leads/[id]` | GET POST PATCH DELETE | full CRUD. List takes `?segmentId=` (one audience) and searches name, company, title, email and tags |
| `/api/leads/[id]/profile` | GET | the prospect profile (`getProspect`): company, journey, audiences, engagement, timeline, to-dos. Read-only; 404 across workspaces |
| `/api/campaigns`, `/api/campaigns/[id]` | GET POST PATCH DELETE | full CRUD. A multichannel campaign needs ≥ 2 channels (validate.ts). |
| `/api/campaigns/[id]/workflow` | GET, PUT | the campaign's workflow. PUT takes `{ name, graph }` and **rebuilds the graph from a whitelist** (`validateWorkflowGraph`); 422 names the reason. 404 for another workspace's campaign. |
| `/api/workflows` | GET | every workflow in the workspace, newest edit first |
| `/api/accounts` | GET | the workspace's LinkedIn accounts, mailboxes and sending domains, each with the campaigns that use it |
| `/api/accounts/[id]` | PATCH DELETE | PATCH is the dials only (LinkedIn daily caps; mailbox cap + rotate) — identity/state/health are never accepted. DELETE disconnects at the provider first, then removes the row |
| `/api/accounts/[id]/campaigns` | PUT | `{ campaignIds }` replaces the campaigns sending from an account; a foreign campaign id is a 422 |
| `/api/accounts/activity` | GET | `?days=` — real per-account counts from `events` (inbound messages, status changes). Zero means zero, never an estimate |
| `/api/integrations/linkedin/connect` | POST | opens a Unipile hosted sign-in; `{ accountId }` repairs one instead. 503 `not_configured` with no API key, 502 when the provider refuses. **GET is a 405** — a link prefetch must not open a sign-in |
| `/api/integrations/linkedin/connect/[id]` | GET | how one connect attempt of *this workspace's* is going; the screen polls it |
| `/api/webhooks/unipile/notify` | POST | hosted sign-in finished. See "Connecting LinkedIn" below for why this one has no secret and is still safe |
| `/api/webhooks/unipile/accounts` | POST | account status changed. Shared-secret header; writes `channel_accounts.state` |
| `/api/webhooks/unipile/messages` | POST | inbound message. Shared-secret header; idempotent on the provider's message id |
| `/api/badges` | GET | `{ tasks, inbox, config }`: the rail counts, fetched on every navigation |
| `/api/settings` | GET, PATCH | the Configuration screen's Variables/Sending rules/Compliance tabs (`workspace_settings`). PATCH body carries only the section(s) changed (`{ variableFallbacks? \| sendingRules? \| compliance? }`); shape/range checked in `validate.ts`, merged into the stored row by the repository. Always real for the signed-in workspace, but `SENDING_ENABLED` stays false so nothing acts on it — see Configuration below |
| `/api/leads/uploads`, `…/[id]/validate`, `/api/leads/segments` | POST, GET | parked file → review (per-channel reach, **in-journey warning**, import plan) → saved segment. Segments carry a live `leadCount`. Max 4 MB (Vercel's body cap) |
| `/api/workspace/sample` | DELETE | removes the sample campaign (its workflow cascades) + sample leads; idempotent |
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
default quota rows + **the sample content** + session in **one transaction**, so a failure leaves
no half-account. The form collects **name, company, email, password**. The workspace id is a fresh
`org_<12 url-safe chars>` (`newOrgId()`, 72 random bits) — the tenant key stored as
`workspaces.id` and `workspace_id` everywhere — and the workspace is named after the company.
After signing up the user lands on `FIRST_RUN_HREF` (`/dashboard/campaigns`), where the sample
campaign is. Each signup gets **its own workspace** — there is no way to join one (§7).

| File | Purpose |
|---|---|
| `lib/signup.ts` | Shared contract: `validateSignup()` (name, company, email, password), `parseAllowlist()`, `isInvited()`, `SignupResponse`. Import-free + erasable; used by the form, the route and tests. |
| `app/api/signup/route.ts` | 201 + cookie · 422 invalid · 403 `not_invited` · 409 `exists` · 503 `unavailable`. Requires `application/json`. |
| `components/auth/SignupForm.tsx` | Validates, then posts. Moves on **only** when the server answers `{ ok: true }`. |
| `scripts/set-password.ts` | `npm run db:set-password -- <email>`, password from `NEW_PASSWORD`. Updates an existing user only, and revokes their sessions. The only recovery path (no email sending). |
| `SignOutItem` + `SignOutButton` in `AppShell.tsx` | The labelled rail item and the top-bar icon (the rail is hidden on phones). Both use `useSignOut()`: `api.logout()` → `POST /api/logout` deletes the session row, and it navigates only after the server confirms. |

### Audiences, import review and prospect profiles — `lib/leads/` + `components/app/leads/`
The UI calls an uploaded segment an **audience** and a lead a **prospect**; the code and tables keep
`segment`/`lead`.
`parseFile.ts` (csv/xlsx via exceljs) · `validation.ts` (`ATTRIBUTES`, column mapping, `validateUpload`,
`withoutRows`) · `merge.ts` (merge an uploaded row into an existing lead — its `matchedExisting` is the
distinct existing prospects matched, which is what an audience stores as `profilesMerged`; `merged` also
counts in-file repeats — `planImport`, the dry run
of that merge that labels each row new / existing / duplicate-in-file — **and** `findInJourney`:
which rows are people already in another campaign) · `profile.ts` (a name/company/title for a row,
from its columns or, failing that, its email/LinkedIn; `identityGaps` for "missing details";
`splitFileFields` sorts kept columns into company facts vs the rest; `identityFill` gives a *matched*
existing lead the file's company/title only where it has none — never its name, never an overwrite) · `prospect.ts` (`buildProspect`:
both stores hand it their raw rows and it assembles the `ProspectProfile` — engagement counts,
timeline; import-free, tested) · `analyse.ts` (server-only: the one pass the review step and the save
step share; it adds `report.plan`, an `ImportPreview`) · `phone.ts` `segments.ts` `table.ts` `limits.ts` `ctx.ts`.
UI: `UploadLeads.tsx` is the three-step modal (File → Mapping → Review & import) · `ImportReview.tsx`
is its last step (totals, filterable row review, invalid-vs-blank validation log, consent) ·
`ProspectDrawer.tsx` is the profile drawer opened from a Leads row.

**The review is the save, dry-run.** `planImport` runs the same `mergeLeads` `createSegment` runs, on
the same rows (in-journey people removed), so "N new · M existing updated" is what the save writes;
`tests/leadsImportPlan.test.mjs` pins that the two agree. Importing never assigns a campaign or
starts anything.

**The profile shows stored facts only.** Contact fields, company (lead's company, work-email domain
unless it is a personal mailbox, company columns from the file, other prospects at the same company),
journey (`leads.campaign_id`, latest `workflow_runs` row), audiences (`segment_leads`), and engagement
+ timeline built from `messages`, `events`, `tasks`, the lead's creation and its imports. Nothing
writes `events` or `workflow_runs` yet (§7), so for a real workspace engagement is empty and the
drawer says so; the demo store has no events, runs or creation times for seed leads.

**It is all in Postgres now.** A parsed file is parked in `uploads` (not process memory: serverless
instances do not share it); saving creates a `segments` row, inserts new people as ordinary `leads`
(source `csv`, stage `new`), merges matches into existing leads, and links everyone in
`segment_leads`. A person can be in several segments.

**Cross-campaign dedupe.** A lead belongs to at most one campaign (`leads.campaign_id`). Any
uploaded row matching a lead who has a campaign on **any** of email / mobile / WhatsApp / LinkedIn
is *excluded* from the new segment, the summary step says how many and from which campaigns, and the
save step recomputes it server-side (never trusts the browser). Excluded rows are not enriched
either. `tests/leadsJourney.test.mjs` pins the "any field matches" rule.
**Consent:** the modal asks the user to attest the people may be contacted; that sets `consent` on
leads the upload *creates*. It never changes an existing lead's consent.

### Workspace screens — `components/app/`
| File | L | Reads from | Notes |
|---|---|---|---|
| `AppShell.tsx` | ~370 | `/api/badges` | rail, top bar, mobile tab bar, sign-out. **Five destinations** (`DASHBOARD_NAV`), the same five in the rail and the tab bar — see §2d. Badges refetch on every navigation. The top bar carries the title and sign-out only: the Search (⌘K) button and the notification bell had no handler and the bell's dot was hardcoded |
| `HomeScreen.tsx` | ~260 | `/api/overview`, `/api/campaigns` | stats (fixed 7-day window; ranges belong to Analytics, which it links to), to-dos (completable), campaigns. Each to-do's button **deep-links to its lead** (`?lead=<id>` on Inbox/Leads) rather than to the list |
| `InboxScreen.tsx` | ~300 | `/api/threads` | read-only: with `!SENDING_ENABLED` the composer is one line of text, not a disabled box plus a note plus a disabled button. Opens the thread named by `?lead=<id>`. One "Open lead", pointed at the lead |
| `LeadsScreen.tsx` + `LeadEditor.tsx` | ~570 + 165 | `/api/leads`, `/api/leads/segments`, `/api/leads/[id]/profile` | full CRUD, server-side filter/sort/page; audience cards narrow the table (`segmentId`); a row (or its name) opens `ProspectDrawer`; below 820px the table is replaced by the `.lcards` list. A saved import selects its new audience. Opens the lead named by `?lead=<id>`. **No row checkboxes** (nothing consumed the selection and there is no bulk action), **no "Avg call"/"Follow-ups" columns** (empty for every lead until calling and sending exist, and their sort only ordered the visible page) and no inline row Edit (the row opens the drawer, which edits). The UI says "lead" throughout; the `Prospect*` type and route names are unchanged. **The lead form asks only name, email, phone, LinkedIn URL (+ the consent attestation)**; the PATCH/POST sends only those, so an edit never touches imported company/title/extra and the server defaults the rest (stage `new`, source `form`, owner = creator). Status, source, tags and next step are not shown in the table, its filters or the drawer (user request: profiles get enriched later) — they still exist in the schema |
| `CampaignsScreen.tsx` + `campaigns/TemplatePicker.tsx` + `CampaignEditor.tsx` | ~320 + 105 + 100 | `/api/campaigns` | **the only campaign list and the only place one is created** (§2d). New campaign = pick a template, which creates the campaign and its workflow and opens the builder. Row click opens the builder. Row actions are Pause (live/scheduled only), Rename, Delete. `CampaignEditor.tsx` is now just `RenameCampaign` |
| `AnalyticsScreen.tsx` | ~420 | `/api/analytics` | **one report, no tabs.** The per-channel table sits under its own bar chart; per-campaign totals link to Campaigns. No per-person or per-campaign daily data exists, so none is shown |
| `ConfigurationScreen.tsx` + `configuration/` | ~120 + ~1700 | `/api/accounts`, `/api/campaigns` | the **Setup** screen — see below |
| `configuration/Connections.tsx` | ~370 | `/api/accounts`, `/api/workspace` | was `IntegrationsScreen.tsx`; now Setup's Connections tab. One card of collapsible sections (`.intg*` CSS at the end of `app.css`); provider state is *derived* (`providerView`). "Manage" switches tab instead of navigating |
| `configuration/Workspace.tsx` | ~90 | `/api/workspace` | was `SettingsScreen.tsx`; now Setup's Workspace tab, team + plan only |
| `SampleBanner.tsx` | 60 | `/api/workspace` | "this workspace includes sample data" + Remove button. **Home only** — it used to repeat on all eight screens, undismissable; the "Sample" pills on rows carry it elsewhere |
| `ui.tsx` `charts.tsx` `icons.tsx` | 628 | — | shared controls, SVG charts, 24px icons |
| `glass.ts` | ~230 | — | refraction + specular runtime, **marketing-only now** (see §5) |

### Workflow builder — `components/app/builder/` (~2000L)
`WorkflowBuilder.tsx` owns state (nodes, edges, undo/redo, toasts) · `Canvas.tsx` is the
pannable/zoomable surface · `StepCard.tsx` the node · `Inspector.tsx` the right panel.
Model is `lib/app/workflow.ts` (946L) — import-free and erasable, pinned by
`tests/workflow.test.mjs`. **@xyflow/react is deliberately NOT a dependency**; the canvas is
ours but keeps `.react-flow__*` class names because `app.css` styles them.
**Persistence.** One `workflows` row per multichannel campaign (unique `campaign_id`; the route id
*is* the campaign id). `workflow.ts` also holds the storage side: `WorkflowGraph`
(`{nodes, edges, settings}`), `graphFromTemplate()`, `toGraph`/`fromGraph`, and
`validateWorkflowGraph()` / `validateWorkflowName()` — a whitelist rebuild that rejects unknown
step-data keys (incl. `__proto__`), bad sockets, a second Audience, **cycles** (the canvas walks the
graph recursively and would hang) and oversize graphs; pinned by `tests/workflowPersist.test.mjs`.
`WorkflowBuilder` autosaves 800 ms after the last change (a fingerprint of the content, so an
unchanged graph never saves), serialises saves, flushes on `pagehide`/unmount with a `keepalive`
fetch, and shows a truthful Saved / Unsaved changes / Saving… / "Couldn't save · Retry". Status
(live/paused) belongs to the *campaign*, not the graph.
**Audience lists** in the builder: `campaign` ("Leads in this campaign") and `workspace` ("All
leads"), both counted live from `api.leads`, then uploaded segments, then the demo `LISTS`
relabelled "(demo)". The Audience step stores only the list key.

**Routes.** The builder has exactly one: `/dashboard/workflows/[id]` where `id` is a multichannel
campaign's id (string). The page resolves the session itself, loads campaign + workflow through
the repository, and 404s for an unknown id, another workspace's id or a standalone campaign.
`/dashboard/workflows/new` and numeric (old demo) ids **redirect to Campaigns**. The header
`<select>` in the builder lists the workspace's multichannel campaigns (a server-fed prop, not the
demo `CAMPAIGNS`).
`/dashboard/campaigns/[id]` is a `permanentRedirect` to the builder, kept for old links — never
render a second builder there. **`/dashboard/workflows` is a `permanentRedirect` to Campaigns**:
there is no separate library any more (§2d). Picking a template on Campaigns **creates a draft
multichannel campaign + its workflow, then opens the builder** (a workflow needs a campaign;
creating on a GET would let link prefetch create rows).

**The builder offers only steps that can run.** `PALETTE` in `lib/app/workflow.ts` lists LinkedIn
invite, LinkedIn message, Email and Call task; WhatsApp and SMS need a business number and approved
templates that do not exist, so a sequence built from them could never send with nothing on the
canvas saying so. `STEPS` still describes them and `CHECKS` still holds `read` ("Read WhatsApp"),
so a stored graph that holds one keeps validating and rendering — `OFFERED_CHECKS` is what the
Inspector offers. No template builds one either (`tests/workflow.test.mjs` pins all of this).
The Audience step's Job titles / Company size / Location fields were removed: they were stored and
never read, so the lead count beside them never moved.

**Canvas figures are projections, and say so.** `stepStats()` multiplies the audience size by the
fixed rates in `PASS`/`RATE`. Rates render with a `~` and the canvas carries a permanent line
("Step counts are estimates from typical rates, not your results"). Replace them with real counts
in the commit that lands a sender, not before.

**Nothing sends, and the UI says so (`lib/capabilities.ts`).** `SENDING_ENABLED = false` gates every
path to "live". The builder shows "Nothing sends yet" where Launch would be (a disabled Launch made
its own confirmation dialog unreachable) and has no Test button (it was permanently disabled).
The Campaigns table offers Pause, not an on/off switch that could only fail in one direction.
Pausing is always allowed. Flip the flag only in the commit that lands a sender.

**Sample data.** `SampleBanner` (`components/app/SampleBanner.tsx`) asks `api.workspace()` for
`workspace.sample` and renders **on Home only**, until the user clicks "Remove sample data"
(`DELETE /api/workspace/sample`). It used to repeat at the top of all eight screens. Sample rows
carry a "Sample" tag (`isSample` through `adapt.ts`) wherever they appear.

**Campaign creation has one entry point.** `CampaignsScreen`'s "New campaign" opens
`campaigns/TemplatePicker.tsx`, and that is the only way in. It asks one question (which shape),
because the old dialog's other four could not be answered before seeing the campaign: a
standalone/multichannel type whose standalone branch had no detail screen at all, a status list
including Completed, five channel checkboxes with a footnote saying three of them do not send, and
a start date hinting it would "start now" when nothing starts. Channels follow from the steps and
status follows from what the user does. `CampaignEditor.tsx` is now `RenameCampaign`.

### Setup — `/dashboard/configuration`
`ConfigurationScreen.tsx` + `components/app/configuration/` (`Overview`, `ChannelTabs`, `RuleTabs`,
`Connections`, `Workspace`, `parts`). **Six tabs: Overview, LinkedIn, Email, Connections, Rules,
Workspace** (`CONFIG_TABS` in `lib/app/configuration.ts`), titled "Setup" and reached from the main
rail — it is one of the five `DASHBOARD_NAV` destinations, so it works on a phone.

It was three rail destinations. WhatsApp, Calls and SMS each had a tab whose whole content was a
paragraph saying there was nothing to configure (the Overview tiles and Connections say it once);
Variables, Sending rules and Compliance are three groups of switches over one subject and share the
Rules tab; Connections is the old Integrations screen; Workspace is what was left of Settings.
`/dashboard/integrations` and `/dashboard/settings` are `permanentRedirect`s here, and the
integrations route carries `?connected=`/`?failed=` across so an in-flight hosted sign-in still
lands (the screen then opens the Connections tab). **`lib/channels/connect.ts` builds its
success/failure URLs from `SETUP_HREF`.**

**The setup score only counts what the user can change.** "No mailbox connected" is `tone: "info"`,
not a blocker: connecting a mailbox is not built, so scoring it left every workspace permanently
short of full marks with a red row and no action. `CheckTab` is `"li" | "mail"`.

**LinkedIn accounts and mailboxes belong to the workspace, not to a campaign.** There is no campaign
scope on this screen. Each account tile has a "Used by campaigns" control (real campaigns, many to
many for BOTH channels — a mailbox is no longer exclusive to one campaign) saved through
`PUT /api/accounts/:id/campaigns`; the daily caps and mailbox rotation are saved (debounced) through
`PATCH /api/accounts/:id`. Domains show their SPF/DKIM/DMARC state. With nothing connected a tab says
so and the Connect button is disabled: **connecting a LinkedIn account or mailbox is not built**.

The Overview's checks come from `lib/data/setup.ts` (real state), not from a constant.
**WhatsApp, Calls and SMS** have a tile each, marked Planned, which opens Connections — there is no
account/number concept for them yet, so there is nothing to configure and nothing was scaffolded.

**Variables, Sending rules and Compliance now persist** through `/api/settings` →
`workspace_settings` (one row per workspace, three jsonb blobs). `RuleTabs.tsx`'s
`useSavedSection` hook loads a section on mount and saves it (debounced, like `ChannelTabs.tsx`'s
`useSavedSetting`) on every edit; `<SavedNote>` in `parts.tsx` says the values are saved but
nothing enforces them, because nothing sends. `lib/app/configuration.ts#defaultWorkspaceSettings()`
is the single source of the starting values (also what `MemoryRepository` seeds in demo mode) —
the rule tables in that file (`STOP_RULES`, `AUDIENCE_RULES`, `REGIONAL_RULES`, `CONSENT`, …) still
own each row's *label and hint*; only the on/off/chosen state moved to the store. Three controls on
these tabs are still genuinely unbuilt, not because saving is fake but because there is nowhere to
save them to yet — they keep their own inline "not available yet" text: "Add variable" (a new
token), snippets, and the do-not-contact CSV upload. The **"All accounts" / Tracking rule
switches** on the channel tabs (`ChannelTabs.tsx`) are unrelated and still in-component defaults —
see §7.

### Presentation helpers — `lib/app/`
`channels.ts` (the short channel keys and their colours) · `leads.ts` (stage colours, score band,
phone mask, tag colours, avatar tints) · `campaigns.ts` (status pill wording) · `configuration.ts`
(tab list + rule catalogue + `defaultWorkspaceSettings()`, the one function that is a
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
`adapt.test.mjs` · `signup.test.mjs` · `sample.test.mjs` · `setup.test.mjs` · `workflowPersist.test.mjs` · `leadsValidation` `leadsMerge` `leadsJourney` `leadsProfile` `leadsImportPlan` `prospect` `workflowSegment` ·
`unipile.test.mjs` (the Unipile request contract + response readers) · `unipileEvents.test.mjs`
(both documented webhook envelopes) · `webhookConfig.test.mjs` (the header/query-param match) —
**217 tests**
`.mjs` files import `.ts` directly via Node type stripping (needs Node ≥ 22.18), so **any module
under test must have no `@/` or extensionless imports and only erasable TS** (no enums, no
namespaces, no parameter properties).

---

## 4. Where do I change X?

| Goal | Touch |
|---|---|
| Add a field to leads/campaigns | `lib/db/schema.ts` → `db:generate` → `lib/data/types.ts` → `validate.ts` → `pg.ts` + `memory.ts` → `lib/app/adapt.ts` |
| Add an endpoint | `app/api/<name>/route.ts` using `withUser`/`json`/`fail`, then `lib/api.ts` |
| Add a repository method | `lib/data/repository.ts` first, then **both** impls (`pg.ts`, `memory.ts`) |
| Swap the database | implement `Repository`, return it from `getRepository()`. Nothing else. |
| Change the schema | edit `lib/db/schema.ts` → `npm run db:generate` → review the SQL → `npm run db:migrate`. Never hand-write a migration or `db:push`. |
| Make another screen live | copy the Leads pattern: `api.*` in a `useEffect`, map through `lib/app/adapt.ts`, server-side filters, optimistic writes with rollback |
| Re-theme marketing | `:root` in `app/globals.css` + `@theme inline`. Grep `rgb(` and `pipSvg.ts` for hardcoded brand colours. |
| Re-theme workspace | `:root` tokens in `app/app.css`. It is vendored, multi-pass — change the **final** `:root`/flattening block at the true end of the file, since same-specificity CSS means last-in-source wins over every earlier redeclaration. |
| Add a glass surface (marketing only) | selector list in `globals.css`'s glass-skin block **AND** `SiteGlass.tsx`'s lens/specular lists. Miss one → renders flat. The workspace has no glass surfaces any more — see §5. |
| Add a nav item | `lib/nav.ts` (workspace) or `lib/site.ts` (marketing). For the workspace, read §2d first: the rail and the mobile tab bar render the same five entries, and five is what fits the bar |
| Add a Setup tab | `CONFIG_TABS` + `ConfigTab` in `lib/app/configuration.ts`, then a branch in `ConfigurationScreen.tsx`. A tab whose content is "nothing to configure yet" belongs on Connections as a Planned row instead |
| Offer a new builder step | `STEPS` + `defaults()` + `stepLabel()` **and** `PALETTE` in `lib/app/workflow.ts`. `STEPS` describes a step so stored graphs render; `PALETTE` is what a user may add, and only steps that can actually run go in it (`tests/workflow.test.mjs` pins that) |
| Change what a new workspace starts with | `lib/data/sample.ts` (content, tested) and `sampleSeed.ts` (insert). Keep every email on `.example` and every phone in 555-01xx — the tests enforce it. |
| Add a field to a stored workflow | `WorkflowGraph` + `validateWorkflowGraph` in `lib/app/workflow.ts` (the whitelist **drops/refuses** anything not listed) + a case in `tests/workflowPersist.test.mjs` |
| Change what a connected account can do | `lib/data/types.ts` (`LinkedInSettings`/`EmailSettings`) → `validateAccountPatch` in `validate.ts` → `pg.ts` + `memory.ts` → `ChannelTabs.tsx` |
| Add a setup check | `lib/data/setup.ts` (and its test). It is derived from `AccountsSnapshot`; do not hardcode |
| Swap the LinkedIn vendor | implement `LinkedInChannelAdapter` (`lib/channels/adapter.ts`) and return it from `getLinkedInAdapter()`. Nothing else — that is what the interface is for. |
| Handle another provider webhook | a reader in `lib/channels/events.ts` (+ a case in `tests/unipileEvents.test.mjs`), a writer in `inbound.ts`, a route under `app/api/webhooks/unipile/`, and the `source` in `webhookConfig.ts` so the registration script picks it up |
| Add a per-account figure | `AccountActivity` in `lib/data/types.ts` → `accountActivity()` in **both** repository impls → `SeatActivity` in `ChannelTabs.tsx`. Count real `events` rows; never estimate |
| Change how uploaded people are matched | `lib/leads/merge.ts` (`mergeLeads` + `findInJourney`; `planImport` follows `mergeLeads` automatically) and `tests/leadsMerge`/`leadsJourney`/`leadsImportPlan` |
| Change what the import review shows | `ImportPreview`/`ReviewRow` in `lib/leads/segments.ts` → `analyseUpload` in `lib/leads/analyse.ts` → `components/app/leads/ImportReview.tsx` |
| Add something to the prospect profile | `ProspectProfile` in `lib/data/types.ts` → `ProspectFacts` + `buildProspect` in `lib/leads/prospect.ts` (+ `tests/prospect.test.mjs`) → `getProspect` in **both** `pg.ts` and `memory.ts` (scope every query by `workspace_id`) → `ProspectDrawer.tsx` |
| Add a builder step kind | `STEPS` + `defaults()` + `stepLabel()` in `lib/app/workflow.ts`; tests pin the five seeded graphs |
| Add a Configuration setting | the catalogue entry in `lib/app/configuration.ts` (and its default in `defaultWorkspaceSettings()` if it's one of Variables/Sending rules/Compliance), a field on `WorkspaceSettings` in `lib/data/types.ts`, a check in the matching `validate*Patch` function in `lib/data/validate.ts`, then the tab in `components/app/configuration/`. Rows are `<Row>`/`<ToggleRowView>` from `parts.tsx` — don't hand-roll one. |
| Re-skin a single workspace screen | there is no scope mechanism for this any more (the old `.cfg` scope was removed once its palette became the dashboard-wide default — see §5). A screen that must differ needs its own new token scope, the same shape `.cfg` used to be. |

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
  `/api/leads/uploads` was "no longer available" in `…/validate`, and a lead starred through
  `/api/leads/[id]` still read unstarred in `/api/leads`. `memory.ts` now keeps every mutable value
  behind `shared(key, init)`; add new demo state the same way. (Separate serverless instances still
  don't share it.)
- `createSegment` receives rows with the review's in-journey people already removed, so its own
  recheck finds only people who joined a campaign since; the audience's `excludedInJourney` is
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
- A field the server normalises (the lead form's LinkedIn URL) must not be `type="url"`: the browser's
  own constraint check refuses `linkedin.com/in/x` (no scheme) before `onSubmit` runs. Use a text input
  with `inputMode="url"` and let `validate.ts` decide.
- Every `<form>` needs `method="post"`. Without it the HTML default is GET, so a submit that
  beats hydration navigates to `?email=…&password=…` — credentials into the URL bar, history
  and server logs. Found by a browser test clicking before React attached.

**Workspace is flat, not glass**
- The dashboard used to carry the same "liquid glass" material as the marketing site (blur,
  translucent tint, specular rim). It was removed for performance and for a minimalist look, and
  the fix lives in **one block at the true end of `app.css`**, after everything else — `app.css`
  is a vendored, multi-pass file (its own header names 8 "layers," but in practice `:root` and the
  master surface selector get redeclared several times across historical passes), so rather than
  hunt every scattered `backdrop-filter`/`:root`/gradient declaration, the final block wins by
  plain CSS cascade order (same specificity, last in source) and is the one place "the look"
  belongs now. That block: disables `backdrop-filter` everywhere (`*, *::before, *::after`);
  restores opaque `var(--surface)` + `var(--line)` on the master glass-surface selector list
  (`.card,.pane,.side,.modal,…`) and `display:none`s its `:before`/`:after` specular/refraction
  pseudo-elements; flattens `.btn.pri/.acc/.warn`, `.thumb`/`.navthumb`/`.vthumb`/`.tabthumb` and
  the toggle switch from glossy gradients to solid token fills; sets `html, body` to `#FAFAF8` and
  hides `.bgfx` (the animated blob wallpaper); and trims `.card`/`.wfc`/`.kpi`/`.cf-tile` padding
  and radius plus the `--g`/`--pr` spacing tokens for smaller cards and shorter pages. **Add any
  new dashboard surface's flat styling there, not to the older glass-era blocks above it** — they
  still exist (harmless, since the final block overrides them) but are not where edits belong.
- `components/app/glass.ts` (the refraction/specular runtime) **still exists but is no longer
  mounted on the dashboard** — `components/app/Glass.tsx` (the component that mounted it there)
  was deleted and `AppShell.tsx` no longer renders it. The module is kept because the marketing
  site's `SiteGlass.tsx` still imports it; don't delete `glass.ts` itself.
- The akkari palette/mono-font pair used to be scoped to Configuration alone via a `.cfg` class
  (`Screen`'s `className`). That scope is gone — its tokens are now set directly in the base
  `:root` at the top of `app.css` (further overridden by the final flattening block's `--accent`
  values, same cascade rule as above), so the whole dashboard wears it by default. There is no
  per-screen scope mechanism left; a screen that must differ needs a new one, shaped like `.cfg`
  was.
- `toAppLead`'s `li` is the stored `leads.linkedin` (or `""`). It used to be a `linkedin.com/in/<name>`
  slug invented from the name — a profile nobody gave us. Don't reintroduce a derived URL.
- `toAppLead` (`lib/app/adapt.ts`) must not append a `Title: …` tag the stored tags already
  carry — `LeadsScreen` keys tag chips by text, so a repeat is a duplicate-key React warning.

**CSS / glass (marketing site only — `globals.css` + `SiteGlass.tsx`)**
- Three Chromium rules silently kill `backdrop-filter`, all found by testing the rendered page:
  the element having its own `filter`; sitting inside `isolation: isolate`; or **any** ancestor
  holding a transform — including the identity transform a forwards-filling animation leaves
  behind (hence `.intro-nav` fills `backwards`).
- The wallpaper (`body::before` on the marketing pages) is **load-bearing** — glass needs colour
  behind it to bend. Flatten it and every panel becomes a plain white card. (The dashboard's own
  wallpaper/glass is gone on purpose — see "Workspace is flat, not glass" above; this rule is
  marketing-only now.)
- Shared component classes stay inside `@layer components` so utilities can still override them.
  A rule that must beat the global unlayered `:focus-visible` must itself be unlayered.
- `--hl` must stay **inheriting** (pseudo-elements and inner pills read the animated value).
- Grid columns holding wide content need `minmax(0,1fr)` or mobile overflows horizontally.

**Workspace layout (still applies — not glass-related)**
- The mobile tab bar sizes itself from `--tabs`, set inline by `AppShell` from
  `DASHBOARD_NAV.length`. Add a nav item and it adapts; hardcoding the column count clips the last item.
- **One sliding pill.** Every selector in the workspace — segmented controls and page tabs, the
  nav rail and its Integrations/Settings foot group, the settings side tabs, the mobile tab bar —
  renders `Thumb` from `components/app/ui.tsx`, which slides one raised pill across a recessed
  track. The variant class (`.thumb` / `.tabthumb` / `.navthumb` / `.vthumb`) sets only the inset
  and radius; the material is the single `--thumb-bg` / `--thumb-sh` pair (now flat `var(--surface)`
  + a hairline, per the final flattening block above, not a glossy gradient), and `--track` is the
  recess every pill travels along. **Add a new control to that pair rather than inventing a third
  fill.**
- `Thumb` measures from its own `parentElement`, not a ref passed in: React attaches a parent's
  ref *after* its children's layout effects run, so a thumb handed its track's ref measures nothing
  on the first pass and never appears. It measures with `getBoundingClientRect()` against the
  track rather than `offsetTop` — the Leads row sits inside the positioned `.navhas` dropdown
  wrapper, which would otherwise be its offset parent and report zero.
- The Configuration tab strip **scrolls, it does not wrap**: `Thumb` translates along one row, so
  a second row leaves the pill sitting under the wrong tab.
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

- **Sign-out must be a full page load** (`useSignOut()` uses `window.location.assign`, not
  `router.push`). `app/app.css` is unscoped (it resets `*` and restyles `body`) and Next keeps a
  visited route's CSS across client-side navigation, so a soft navigation to `/login` rendered the
  marketing page with the workspace stylesheet still applied (left-aligned, no padding). A fresh
  document loads only the marketing styles. Same rule for any future jump from the app to a
  marketing route.

- **Density lives in one block.** The "Minimal and compact" block near the end of `app/app.css`
  (before the `.intg*` rules) is the workspace's type/control scale: 13px body, 11px sub-text, 30–32px
  controls, 32px rail rows. It overrides the vendored rules above it, so it must stay after them. Do not
  use CSS `zoom` to shrink the app: it breaks `glass.ts` lens sizing and the builder's pointer maths.

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

1. **Enrollment: when does a lead "enter a campaign"?** `leads.campaign_id` is what the upload
   dedupe reads, and today it is set only by hand (the lead editor) and by the sample. Choosing a
   segment as a workflow's audience does **not** assign its leads, and nothing releases them. The
   natural moment is Launch (not built). Until then, two overlapping files uploaded for two draft
   campaigns will not warn about each other.
2. **No execution engine.** `workflow_runs` / `step_jobs` are shaped for it; nothing writes them.
   Intended shape: an authenticated `/api/jobs/tick` claiming due rows with
   `FOR UPDATE SKIP LOCKED`, poked by cron (a GitHub Actions schedule is a free MVP scheduler).
   `SENDING_ENABLED` stays false until it lands.
3. **LinkedIn connects; email does not.** LinkedIn accounts connect through Unipile's hosted
   sign-in (see "Connecting LinkedIn" in §3) wherever `UNIPILE_DSN` + `UNIPILE_API_KEY` are set;
   without them the screens say so rather than offering a button that 503s. Still open on this
   path: **no throttle service** (the per-account caps are stored and shown but nothing enforces
   them — that is the execution engine, §2), **no profile enrichment** (`GET /users/{id}` is not
   called, so a connected seat adds no lead context), and **nothing sends**. Mailbox connection is
   not built at all: `sending_domains` is read-only and "Connect mailbox" is still disabled.
4. **Configuration rules are stored but not enforced.** Variables, sending rules and compliance now
   persist in `workspace_settings` (`/api/settings`), but nothing reads that table yet — enforcing
   it needs the execution engine (§2) and `SENDING_ENABLED` to flip. The channel tabs' "All
   accounts" / Tracking switches are a separate, still-unstored thing (`ChannelTabs.tsx`).
5. **`campaigns.channels` is not derived from the workflow's steps.** Both are stored; editing the
   workflow does not update the campaign's channel list.
6. **`events` is written only by the LinkedIn webhooks, and no job builds `daily_rollups`.**
   Account connects, status changes and inbound messages land in `events` (and `/api/accounts/activity`
   counts them); nothing else does. Only the sample's rollups exist,
   so Analytics is real SQL over invented numbers until the engine lands. Rollups have no campaign
   or person dimension, so Analytics cannot filter by either. The prospect profile already reads
   `events` and `workflow_runs` per person, so its engagement section fills in once the engine writes them.
   - **Audiences can't be renamed, deleted or exported yet**, and there is no bulk action on a
     selection of leads — the table's row checkboxes were removed with the rest of the dead
     controls, so bringing bulk actions back means bringing the selection back with them. The
     import review lists the first 500 rows; every row is still imported.
7. **Campaign counters are denormalised and nothing maintains them** (`sent`, `delivered`,
   rates): the sample's are derived from its rollups (a test pins that); real campaigns show "—".
8. **Auth has no email verification, password reset link, OAuth or login rate limiting.** Fine for
   an invited handful; none of it is optional before a public launch. Login is brute-forceable
   (scrypt's cost slows it but does not stop it). Roles exist (`memberships.role`) but nothing
   enforces them. Sessions are not refreshed on use, so an 8-hour session ends mid-work.
9. **No way to join an existing workspace.** Every signup creates its own, so invited testers
   cannot share leads or campaigns. Needs an invite-to-workspace flow; the schema already supports
   many users per workspace. Settings → Team says inviting is unavailable.
10. **Uploads are capped at 4 MB** because Vercel rejects larger request bodies before our code
    runs. A bigger limit needs a direct-to-storage upload.
11. **Two simultaneous uploads containing the same new person can create two leads** (there is no
    unique key on a lead's email, by design: contacts without one exist). The second upload would
    merge into the first.
12. **The Inbox cannot mark a thread read/handled** (no endpoint) and cannot reply (nothing sends).
13. **Deferred from the UX audit.** A lead still has two detail surfaces: the read-only
    `ProspectDrawer` and the `LeadEditor` modal its Edit button opens. The inline row Edit is gone,
    but making the drawer editable in place (and deleting the modal) is a real refactor and was
    left out. There is also no global search: the top bar's Search button was removed because it
    had no handler, so building search means building the palette, not re-adding the button.
14. **Workspace-level channel on/off switches do not exist.** The builder's `channelsOff` prop and
    its "…is off in Settings" tooltip are left in place for when they do; nothing passes it today.
15. `gtm_mock.html` at the root is a standalone design reference, not part of the app.

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
