# CONTEXT.md — codebase map

Orientation file for agents. Read this first; it replaces grepping the tree.
**Keep it current:** any change that adds a file, a route, a table or an architectural
rule must update this file in the same commit. See "Maintaining this file" at the end.

Last updated: 2026-10-15 · ~27k lines of source across 146 files.

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
```

---

## 2. The three splits you must know

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
Home, Inbox, Leads, Campaigns, Workflows (+ builder), Analytics, Configuration, Integrations and
Settings all read through the repository / REST API, so a workspace only ever sees its own rows.
**There is no demo content in the app any more except the sample world** (`lib/data/sample.ts` + `sampleSeed.ts`, §3):
rows flagged `is_sample`, seeded at signup, labelled "Sample" in the UI and deleted by "Remove
sample data". In the no-database demo mode (the `dev` deployment) `MemoryRepository` serves the
old demo dataset (`lib/data/seed.ts`) through the same API, so the same screens work there.

**The rule for new work:** a screen that needs data gets it from a repository method + an API
route. Never put figures, names, accounts or campaigns in a component or in `lib/app/`.

---

## 3. File map

### Storage seam — `lib/data/` (start here for anything data-related)
| File | L | Purpose |
|---|---|---|
| `types.ts` | 321 | Domain types. Import-free + erasable (loadable by `node --test`). |
| `repository.ts` | 230 | **The interface every page and route talks to.** `Ctx` is the first arg of every method — tenancy cannot be forgotten. `WriteError` ≠ `null` ≠ throw → 422/404/500. |
| `index.ts` | 22 | `getRepository()` factory. Returns Postgres when `DATABASE_URL` is set, memory otherwise. |
| `memory.ts` | 852 | In-memory impl over the seed. No-config fallback; writes last until restart. Workflows: a `Map` by campaign id, falling back to the demo `WORKFLOWS` matched on campaign name, so the seed's four multichannel campaigns open a real graph. |
| `pg.ts` | 1498 | Postgres impl via Drizzle. Filters `workspace_id` on every read *and* write (the `ws()` helper). Leads page in SQL; campaigns aggregate in JS. Uploads, segments, accounts, workflows and the sample world are all real tables now. |
| `seed.ts` | 831 | Demo dataset. The only file that goes away once real data exists. |
| `sample.ts` | 214 | The sample content every new workspace starts with: one paused multichannel campaign + 8 leads. Import-free; `tests/sample.test.mjs` pins that every email is on the reserved `.example` domain and every phone in the fictional 555-01xx range, so a sample lead can never be a real person. |
| `sampleSeed.ts` | 216 | Server-only. Inserts the whole sample world **inside the `signUp` transaction**: campaign + workflow, 8 leads, 4 conversations and 3 to-dos, the funnel by day, a LinkedIn account + mailbox + sending domain assigned to the campaign. All `is_sample`. |
| `setup.ts` | 151 | `setupChecks(accounts, domains)`: what is and is not set up, **computed from the workspace's own accounts**. Drives the Configuration overview, the tab badges and the rail badge. Import-free, tested. |
| `query.ts` | 68 | Pure filter/sort/paginate helpers shared by both impls. Import-free, tested. |
| `validate.ts` | 385 | Write-path validation, `{ok,data}|{ok,errors}`. Import-free, erasable, tested. |

### Database — `lib/db/`
| File | L | Purpose |
|---|---|---|
| `schema.ts` | 592 | 21 tables. `campaigns.is_sample` / `leads.is_sample` mark invented rows (migration `0002_sample_flag`). Drizzle definitions + Postgres enums. |
| `client.ts` | 60 | The one `pg` Pool, cached on `globalThis`. **Needs a pooled connection string.** |
| `../lib/password.ts` | 48 | scrypt hash/verify. Imports only `node:crypto`, so the seed and tests can load it. |
| `../drizzle/*.sql` | — | Generated migrations, committed. Never `db:push` at a deployed DB. |
| `../scripts/seed-db.ts` | 480 | `npm run db:seed`. Idempotent by workspace: deletes `w_demo` and rebuilds it, so a real tenant in the same database is untouched. |

Tables, grouped:
- **tenancy** `workspaces` `users` `memberships` `sessions`
- **org-level channel accounts** `channel_accounts` `campaign_accounts` (many to many) `sending_domains`
- **uploads** `uploads` (parked parsed files, swept after 1 h) `segments` `segment_leads`
- **domain** `leads` `campaigns` `workflows` `threads` `messages` `tasks`
- **quota/metrics** `channel_quotas` `daily_rollups` (keyed by workspace + day + channel + **campaign** + is_sample) `events`
- **engine (not yet written to)** `workflow_runs` `step_jobs`

`workspace_id` is on every tenant-scoped table. `step_jobs.run_at` + `FOR UPDATE SKIP LOCKED`
is the job queue — no Redis or SQS needed.

### HTTP — `app/api/` + `lib/http.ts` + `lib/api.ts`
`lib/http.ts` (56L) holds `withUser`, `json`, `fail`, param parsers — so auth, caching and error
shapes are identical everywhere. `lib/api.ts` (113L) is the typed browser client; client
components call it, never `fetch("/api/...")` by hand. Server components read the repository
directly.

| Endpoint | Methods | Notes |
|---|---|---|
| `/api/me`, `/api/workspace` | GET | |
| `/api/overview` | GET | `?range=7d\|30d\|90d` **or** `?from=&to=` (inclusive UTC days, clamped by `resolveWindow`), plus `?campaignId=` to narrow every figure to one strategy |
| `/api/tasks`, `/api/tasks/[id]/complete` | GET, POST | |
| `/api/leads`, `/api/leads/[id]` | GET POST PATCH DELETE | full CRUD |
| `/api/campaigns`, `/api/campaigns/[id]` | GET POST PATCH DELETE | full CRUD. A multichannel campaign needs ≥ 2 channels (validate.ts). |
| `/api/campaigns/[id]/workflow` | GET, PUT | the campaign's workflow. PUT takes `{ name, graph }` and **rebuilds the graph from a whitelist** (`validateWorkflowGraph`); 422 names the reason. 404 for another workspace's campaign. |
| `/api/workflows` | GET | every workflow in the workspace, newest edit first |
| `/api/accounts` | GET | the workspace's LinkedIn accounts, mailboxes and sending domains, each with the campaigns that use it |
| `/api/accounts/[id]` | PATCH | the dials only (LinkedIn daily caps; mailbox cap + rotate). Identity/state/health are never accepted |
| `/api/accounts/[id]/campaigns` | PUT | `{ campaignIds }` replaces the campaigns sending from an account; a foreign campaign id is a 422 |
| `/api/badges` | GET | `{ tasks, inbox, config }`: the rail counts, fetched on every navigation |
| `/api/leads/uploads`, `…/[id]/validate`, `/api/leads/segments` | POST, GET | parked file → per-channel reach + **in-journey warning** → saved segment. Max 4 MB (Vercel's body cap) |
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

### Lead uploads and segments — `lib/leads/` + `components/app/leads/`
`parseFile.ts` (csv/xlsx via exceljs) · `validation.ts` (`ATTRIBUTES`, column mapping, `validateUpload`,
`withoutRows`) · `merge.ts` (merge an uploaded row into an existing lead **and** `findInJourney`:
which rows are people already in another campaign) · `profile.ts` (a name/company/title for a row,
from its columns or, failing that, its email/LinkedIn) · `analyse.ts` (server-only: the one pass the
summary step and the save step share) · `phone.ts` `segments.ts` `table.ts` `limits.ts` `ctx.ts` ·
`UploadLeads.tsx` is the three-step modal.

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
| `AppShell.tsx` | 407 | `/api/badges` | rail, top bar, mobile tab bar, sign-out. Badges refetch on every navigation |
| `HomeScreen.tsx` | ~430 | `/api/overview`, `/api/campaigns` | today's tiles (+ per-channel split), Performance trend chart with a hover funnel readout, to-dos (completable), strategies (live/paused switch), daily quotas. The strategy select narrows every figure; the date range drives the chart only, because the tiles are explicitly "today" |
| `DateRange.tsx` | 212 | — | the `.drp` window picker: presets plus a month calendar, reporting an inclusive UTC `from`/`to` pair (the grain `daily_rollups` is stored at) |
| `InboxScreen.tsx` | 315 | `/api/threads` | read-only: the composer is disabled while `!SENDING_ENABLED` |
| `LeadsScreen.tsx` + `LeadEditor.tsx` | 592 + 269 | `/api/leads` | full CRUD, server-side filter/sort/page |
| `CampaignsScreen.tsx` + `CampaignEditor.tsx` | 405 + 192 | `/api/campaigns` | full CRUD |
| `AnalyticsScreen.tsx` | 526 | `/api/analytics`, `/api/campaigns` | Overview / Channels / Campaigns. No per-person or per-campaign daily data exists, so none is shown |
| `WorkflowsScreen.tsx` | 240 | server props from the repository | library + template picker |
| `ConfigurationScreen.tsx` + `configuration/` | 96 + ~1340 | `/api/accounts`, `/api/campaigns` | see below |
| `IntegrationsScreen.tsx` | 296 | `/api/accounts` | one card of collapsible sections (`.intg*` CSS at the end of `app.css`); provider state is *derived* (`providerView`) |
| `SettingsScreen.tsx` | 227 | `/api/workspace`, `/api/accounts` | channels, domains, members, plan |
| `SampleBanner.tsx` | 60 | `/api/workspace` | "this workspace includes sample data" + Remove button; renders on every data screen |
| `ui.tsx` `charts.tsx` `icons.tsx` | ~700 | — | shared controls, SVG charts, 24px icons. `TrendChart` takes an optional `tooltip(index)` and then draws a crosshair, dots and a `.tip` readout; without it the chart stays static |
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
`/dashboard/workflows/new` and numeric (old demo) ids **redirect to the library**. The header
`<select>` in the builder and the library lists the workspace's multichannel campaigns (a server-fed
prop, not the demo `CAMPAIGNS`).
`/dashboard/campaigns/[id]` is a `permanentRedirect` to the builder, kept for old links — never
render a second builder there. `/dashboard/workflows` is the library (`WorkflowsScreen`:
`.wfgrid` cards from `summariseStored()` in `lib/app/workflowLibrary.ts`, template picker). Picking a
template **creates a draft multichannel campaign + its workflow, then opens the builder** (a
workflow needs a campaign; creating on a GET would let link prefetch create rows). Library
"in flight"/"meetings" are dashes: nothing has been sent, so there is nothing to report.
`/dashboard/integrations` (`IntegrationsScreen`, `lib/app/integrations.ts`): only LinkedIn and
email can connect; every other provider is `state: "planned"`. Layout (a replica of a reference screenshot the user supplied — do not restyle it without asking):
an underline tab row (Configuration / Integrations / Settings, real links) with the search box at its
right, then ONE card: a Workspace ID row (real `org_…` id + copy icon), then collapsible sections
(bold heading, thin chevron, no counts), each a two-column grid of rows (brand-coloured logo tile from
the `TILE` map in the screen, name + pill, description, bare "+" or "Manage"). Providers that are connected or need attention are pulled out of their category into a
**Connected** section on top (rows show the live detail and a Manage link to Configuration); the
rest stay under Channels / Calendar / CRM / Developer. "+" opens the explainer drawer. The old
per-account LinkedIn/DNS panels were removed: Configuration → Mailboxes & domains owns that detail.

**Nothing sends, and the UI says so (`lib/capabilities.ts`).** `SENDING_ENABLED = false` gates every
path to "live": the builder's Launch/Resume and Test are disabled, the Campaigns switch refuses to
turn a campaign on, and the campaign editor hides Live/Scheduled. Pausing is always allowed. Flip
the flag only in the commit that lands a sender.

**Sample data.** `SampleBanner` (`components/app/SampleBanner.tsx`) asks `api.workspace()` for
`workspace.sample` and renders on Leads, Campaigns and Workflows until the user clicks "Remove
sample data" (`DELETE /api/workspace/sample`). Sample rows carry a "Sample" tag (`isSample`
through `adapt.ts`).

**Campaign creation has one entry point.** `CampaignsScreen`'s "Create campaign" button (opening
`CampaignEditor`) is now the only way in: the sidebar used to carry a second "New campaign" button
straight into a blank, unnamed workflow (`AppShell`, `href="/dashboard/workflows/new"`), and
`CampaignsScreen` carried a third, "New workflow", doing the same — both bypassed the name/type/
status/channel form and were removed. Starting a workflow from a template (`WorkflowsScreen`'s
"New workflow" + picker) is unaffected; it is the builder's own entry point, not a competing
campaign-creation path. Creating a **multichannel** campaign from `CampaignEditor` also saves an empty workflow and opens the builder on it.

### Configuration — `/dashboard/configuration`
`ConfigurationScreen.tsx` + `components/app/configuration/` (`Overview`, `ChannelTabs`, `RuleTabs`,
`parts`). Nine tabs: overview, LinkedIn, Email, WhatsApp, Calls, SMS, Variables, Sending rules,
Compliance. Reached from the rail's foot group (workspace-level setup, so not in `DASHBOARD_NAV`).

**LinkedIn accounts and mailboxes belong to the workspace, not to a campaign.** There is no campaign
scope on this screen. Each account tile has a "Used by campaigns" control (real campaigns, many to
many for BOTH channels — a mailbox is no longer exclusive to one campaign) saved through
`PUT /api/accounts/:id/campaigns`; the daily caps and mailbox rotation are saved (debounced) through
`PATCH /api/accounts/:id`. Domains show their SPF/DKIM/DMARC state. With nothing connected a tab says
so and the Connect button is disabled: **connecting a LinkedIn account or mailbox is not built**.

The Overview's checks come from `lib/data/setup.ts` (real state), not from a constant.
**WhatsApp, Calls and SMS** show only the planned note. **Variables, Sending rules, Compliance and
the "All accounts" / Tracking rule switches** show the defaults a workspace starts with in
`lib/app/configuration.ts`; edits last for the visit only (`<DemoNote>` says so) and nothing enforces
them, because nothing sends. Persisting them needs a settings store (§7).

### Presentation helpers — `lib/app/`
`channels.ts` (the short channel keys and their colours) · `leads.ts` (stage colours, score band,
phone mask, tag colours, avatar tints) · `campaigns.ts` (status pill wording) · `configuration.ts`
(tab list + rule defaults) · `integrations.ts` (provider catalogue + `providerView`) ·
`workflow.ts` (the graph model, templates, validation) · `workflowLibrary.ts` · `segments.ts` (a
tiny event so the builder refreshes when a segment is saved) · **`adapt.ts` bridges to `lib/data`**
and is import-free at runtime, so `tests/adapt.test.mjs` pins every channel and stage round-trip.
**Nothing in here is workspace data.** (`workflow.ts` still carries the five demo workflows and
`LISTS` — used only by `MemoryRepository` for demo mode and by the tests that pin their figures.)

### Marketing — `components/` + `app/`
`Hero.tsx` (321L, pinned scroll-driven card merge) · `Journey.tsx` (383L) ·
`WorkflowLibrary.tsx` (440L) · `UntangleFlow.tsx` (212L, rAF-driven untangle) ·
`WhyFlightpath.tsx` · `Pipeline.tsx` (~230L, "How it works": leads/channels/signals strands
converging on one node as the section scrolls through view — unpinned scroll-linked progress from
`section.getBoundingClientRect()`, `pathLength`/`stroke-dasharray` draw-in, `.js`-gated so the
no-JS and reduced-motion states both show the finished diagram) ·
`FounderBooker.tsx` (preferred-time request **and** a `FOUNDER_CALENDLY_URL` link that books
outright, both on the same section — `lib/site.ts`) ·
`demo/DemoForm.tsx` (304L) · `Navbar.tsx` `Footer.tsx` `Reveal.tsx` `SiteGlass.tsx`.
`lib/demoRequest.ts` (186L) is the shared validation contract — import-free, tested.
`components/pip/` (677L) is the site mascot: one rAF engine, perches keyed by
`data-pip-section`, hidden on `/dashboard`.

### Tests — `tests/` (Node's built-in runner, not Jest/Vitest)
`dataQuery.test.mjs` · `demoRequest.test.mjs` · `workflow.test.mjs` · `validate.test.mjs` ·
`adapt.test.mjs` · `signup.test.mjs` · `sample.test.mjs` · `setup.test.mjs` · `workflowPersist.test.mjs` · `leadsValidation` `leadsMerge` `leadsJourney` `leadsProfile` `workflowSegment` — **175 tests**
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
| Add a nav item | `lib/nav.ts` (workspace) or `lib/site.ts` (marketing) |
| Change what a new workspace starts with | `lib/data/sample.ts` (content, tested) and `sampleSeed.ts` (insert). Keep every email on `.example` and every phone in 555-01xx — the tests enforce it. |
| Add a field to a stored workflow | `WorkflowGraph` + `validateWorkflowGraph` in `lib/app/workflow.ts` (the whitelist **drops/refuses** anything not listed) + a case in `tests/workflowPersist.test.mjs` |
| Change what a connected account can do | `lib/data/types.ts` (`LinkedInSettings`/`EmailSettings`) → `validateAccountPatch` in `validate.ts` → `pg.ts` + `memory.ts` → `ChannelTabs.tsx` |
| Add a setup check | `lib/data/setup.ts` (and its test). It is derived from `AccountsSnapshot`; do not hardcode |
| Change how uploaded people are matched | `lib/leads/merge.ts` (`mergeLeads` + `findInJourney`) and `tests/leadsMerge`/`leadsJourney` |
| Add a builder step kind | `STEPS` + `defaults()` + `stepLabel()` in `lib/app/workflow.ts`; tests pin the five seeded graphs |
| Add a Configuration setting | the data in `lib/app/configuration.ts`, then the tab in `components/app/configuration/`. Rows are `<Row>`/`<ToggleRowView>` from `parts.tsx` — don't hand-roll one. |
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
- `numeric` columns come back from `pg` as **strings**, not numbers (deliberate, to avoid float
  precision loss). `num()` in `pg.ts` is the only place that converts.
- Paged queries need a **second unique sort key** (`ORDER BY score DESC, id ASC`). Without it,
  rows with equal scores swap between pages and one gets shown twice or skipped.
- **`--hl` is overloaded on the marketing page.** `:root` sets it to a warm hex for Pip's beak and
  feet, but the liquid-glass skin also registers `--hl` as a `@property` 0-to-1 opacity that fades
  the pointer highlight in on hover (see CLAUDE.md), redefined on `.card:hover` and friends. Any
  component nested in a `.card` that reads `var(--hl)` as a color gets that number instead and the
  stroke silently disappears — pick a literal hex or a differently-named token instead.
- **`app/globals.css` is loaded app-wide, including on `/dashboard`.** Only `app.css` is scoped to
  the workspace routes, not the other way round, so a workspace class name that also exists on the
  marketing page inherits its rules: `.stat.hero` silently picked up `.js .hero { height: 250vh }`
  and blew every tile to 2500px. The Home tile is `.stat.lead` for that reason. Check a new
  workspace class name against `globals.css` before using it.
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
3. **LinkedIn and email connection are not built.** `channel_accounts` / `sending_domains` are
   ready and the UI reads them, but a real workspace has none (only the sample's). A new workspace
   therefore shows two blocking setup checks, which is true.
4. **Configuration rules are not stored.** Variables, sending rules, compliance, tracking and the
   "All accounts" switches are in-component defaults. Needs a `workspace_settings` store and the
   engine to enforce them.
5. **`campaigns.channels` is not derived from the workflow's steps.** Both are stored; editing the
   workflow does not update the campaign's channel list.
6. **Nothing writes `events`, and no job builds `daily_rollups`.** Only the sample's rollups exist,
   so Analytics is real SQL over invented numbers until the engine lands. Rollups have no campaign
   or person dimension, so Analytics cannot filter by either.
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
13. `gtm_mock.html` at the root is a standalone design reference, not part of the app.

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
