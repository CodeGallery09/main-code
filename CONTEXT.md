# CONTEXT.md — codebase map

Orientation file for agents. Read this first; it replaces grepping the tree.
**Keep it current:** any change that adds a file, a route, a table or an architectural
rule must update this file in the same commit. See "Maintaining this file" at the end.

Last updated: 2026-10-13 · ~29k lines of source across 128 files.

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
only. Both implement an iOS "liquid glass" look through different means.

### 2b. Two data models, bridged by an adapter
This is the big one.

| | `lib/data/` (canonical, DB-backed) | `lib/app/` (legacy, hardcoded) |
|---|---|---|
| Lead id | `"l_omar"` (string) | `17` (number) |
| Channel | `linkedin` `email` `whatsapp` `call` `sms` | `li` `mail` `wa` `call` `sms` |
| Campaign type | `standalone` `multichannel` | `single` `multi` |
| Lead stage | lowercase, 9 values | Capitalised, 9 values |
| Persistence | Postgres via `Repository` | module constants, none |

`lib/data/` is the real one and the DB vocabulary is the **superset** of both.
`lib/app/adapt.ts` maps between them. Screens still render the `lib/app` shape; they read live
rows through the adapter. **Converging the two models is open follow-up work** — until then, a
new field needs adding in both places plus the adapter.

### 2c. Most screens still read `lib/app/`, not the repository
Leads and Campaigns are live on Postgres. **The other seven screens still import `lib/app/`
constants**, so they render demo data no matter what the database holds. Swapping the database
alone does not make those screens live — each needs rewiring the way Leads and Campaigns were.
Status per screen in §3.

---

## 3. File map

### Storage seam — `lib/data/` (start here for anything data-related)
| File | L | Purpose |
|---|---|---|
| `types.ts` | 207 | Domain types. Import-free + erasable (loadable by `node --test`). |
| `repository.ts` | 133 | **The interface every page and route talks to.** `Ctx` is the first arg of every method — tenancy cannot be forgotten. `WriteError` ≠ `null` ≠ throw → 422/404/500. |
| `index.ts` | 22 | `getRepository()` factory. Returns Postgres when `DATABASE_URL` is set, memory otherwise. |
| `memory.ts` | 544 | In-memory impl over the seed. No-config fallback; writes last until restart. |
| `pg.ts` | 745 | Postgres impl via Drizzle. Filters `workspace_id` on every read *and* write (the `ws()` helper). Leads page in SQL; campaigns aggregate in JS. **Uploads/segments/profiles delegate to the in-memory store — see §7.** |
| `seed.ts` | 814 | Demo dataset. The only file that goes away once real data exists. |
| `query.ts` | 68 | Pure filter/sort/paginate helpers shared by both impls. Import-free, tested. |
| `validate.ts` | 305 | Write-path validation, `{ok,data}|{ok,errors}`. Import-free, erasable, tested. |

### Database — `lib/db/`
| File | L | Purpose |
|---|---|---|
| `schema.ts` | 430 | 15 tables. Drizzle definitions + Postgres enums. |
| `client.ts` | 60 | The one `pg` Pool, cached on `globalThis`. **Needs a pooled connection string.** |
| `../lib/password.ts` | 48 | scrypt hash/verify. Imports only `node:crypto`, so the seed and tests can load it. |
| `../drizzle/*.sql` | — | Generated migrations, committed. Never `db:push` at a deployed DB. |
| `../scripts/seed-db.ts` | 480 | `npm run db:seed`. Idempotent by workspace: deletes `w_demo` and rebuilds it, so a real tenant in the same database is untouched. |

Tables, grouped:
- **tenancy** `workspaces` `users` `memberships` `sessions`
- **domain** `leads` `campaigns` `workflows` `threads` `messages` `tasks`
- **quota/metrics** `channel_quotas` `daily_rollups` `events`
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
| `/api/me`, `/api/workspace`, `/api/overview` | GET | |
| `/api/tasks`, `/api/tasks/[id]/complete` | GET, POST | |
| `/api/leads`, `/api/leads/[id]` | GET POST PATCH DELETE | full CRUD |
| `/api/campaigns`, `/api/campaigns/[id]` | GET POST PATCH DELETE | full CRUD |
| `/api/threads`, `/api/threads/[id]`, `/api/threads/[id]/messages` | GET, POST | |
| `/api/analytics` | GET | `?range=`, `?channels=` |
| `/api/login`, `/api/logout` | POST | |
| `/api/demo-request` | POST | marketing; branches on `kind` (demo vs founder_call) |

Error shape is always `{ error: { code, message } }`. 401 unauth · 404 missing · 422 invalid.

### Auth — `lib/auth.ts` (220L, server-only, never import from a client component)
Two modes. **DB mode** (`DATABASE_URL` set): users with scrypt hashes, sessions as rows with a
server-checked `expires_at`, cookie carries an opaque random id only. **Demo mode**: one
hardcoded account + HMAC cookie, so a bare clone works.
The session carries the workspace — that is what makes tenancy resolvable from the session
instead of a forgeable request parameter.

### Lead uploads and segments — `lib/leads/` + `components/app/leads/`
`parseFile.ts` (csv/xlsx via exceljs) · `validation.ts` (the `ATTRIBUTES` catalogue and column
mapping) · `merge.ts` (how an uploaded row merges into an existing lead profile) · `phone.ts`
(libphonenumber-js) · `segments.ts` `table.ts` `limits.ts` `ctx.ts` · `UploadLeads.tsx` is the
upload modal, and `LeadsScreen` renders the segment list above the table.
**Backed by the in-memory store only** — see §7.

### Workspace screens — `components/app/`
| File | L | Reads from | Live? |
|---|---|---|---|
| `AppShell.tsx` | 210 | `lib/app/inbox`, `leads` | no |
| `HomeScreen.tsx` | 224 | `lib/app/*` (5 modules) | no |
| `LeadsScreen.tsx` | 400 | `lib/api.ts` | **yes — full CRUD, server-side filter/sort/page** |
| `LeadEditor.tsx` | 250 | — | create/edit dialog; server 422s render inline |
| `CampaignsScreen.tsx` | 330 | `lib/api.ts` | **yes — full CRUD, live figures** |
| `CampaignEditor.tsx` | 190 | — | create/edit dialog |
| `InboxScreen.tsx` | 231 | `lib/app/inbox` | no |
| `AnalyticsScreen.tsx` | 388 | `lib/app/metrics` | no |
| `SettingsScreen.tsx` | 153 | `lib/app/workspace` | no |
| `WorkflowsScreen.tsx` | 175 | `lib/app/workflowLibrary` | no |
| `IntegrationsScreen.tsx` | 342 | `lib/app/integrations` | no |
| `ui.tsx` `charts.tsx` `icons.tsx` | 628 | — | shared controls, SVG charts, 24px icons |
| `Glass.tsx` `glass.ts` | 285 | — | refraction + specular runtime |

### Workflow builder — `components/app/builder/` (1719L)
`WorkflowBuilder.tsx` owns state (nodes, edges, undo/redo, toasts) · `Canvas.tsx` is the
pannable/zoomable surface · `StepCard.tsx` the node · `Inspector.tsx` the right panel.
Model is `lib/app/workflow.ts` (695L) — import-free and erasable, pinned by
`tests/workflow.test.mjs`. **@xyflow/react is deliberately NOT a dependency**; the canvas is
ours but keeps `.react-flow__*` class names because `app.css` styles them.
Edits are in-component only — **no persistence yet**; the `workflows` table exists for it.

**Routes.** The builder has exactly one: `/dashboard/workflows/[id]` (and `/new?template=<key>`
for a blank one, via `blankWorkflow`). `/dashboard/campaigns/[id]` is a `permanentRedirect` to it,
kept for old links — never render a second builder there. `/dashboard/workflows` is the library
(`WorkflowsScreen`: `.wfgrid` cards, template picker); its numbers come from
`lib/app/workflowLibrary.ts`, which reuses `hasRun` so a never-published workflow reads "—".
A multichannel campaign *is* a workflow (same numeric id). `/dashboard/integrations`
(`IntegrationsScreen`, `lib/app/integrations.ts`): only LinkedIn and email can connect; every
other provider is `state: "planned"` with a disabled primary button.

### Legacy demo data — `lib/app/` (1833L, hardcoded)
`channels.ts` `leads.ts` `campaigns.ts` `inbox.ts` `workspace.ts` `integrations.ts`
`workflowLibrary.ts` · `metrics.ts` (241L) is a seeded PRNG walking 180 days, deterministic so
the screens still on it agree with each other · **`adapt.ts` (200L) bridges to `lib/data`** and is
import-free at runtime, so `tests/adapt.test.mjs` pins every channel and stage round-trip.

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
`adapt.test.mjs` — **70 tests**
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
| Re-theme workspace | `:root` tokens in `app/app.css`. It is vendored — change tokens, not rules. |
| Add a glass surface | selector list in the glass-skin block at the end of the stylesheet **AND** the lens/specular lists in `glass.ts` / `SiteGlass.tsx`. Miss one → renders flat. |
| Add a nav item | `lib/nav.ts` (workspace) or `lib/site.ts` (marketing) |
| Add a builder step kind | `STEPS` + `defaults()` + `stepLabel()` in `lib/app/workflow.ts`; tests pin the five seeded graphs |

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
- Analytics reads `daily_rollups`, so **today has no row until the rollup job runs** — a 30-day
  range legitimately returns 29 points the day after a seed. Not a bug.
- `scripts/` has its own tsconfig: it runs under `node --experimental-strip-types`, which needs
  explicit `.ts` extensions that the app's tsconfig rejects. `npm run typecheck` runs both.

**Forms**
- Every `<form>` needs `method="post"`. Without it the HTML default is GET, so a submit that
  beats hydration navigates to `?email=…&password=…` — credentials into the URL bar, history
  and server logs. Found by a browser test clicking before React attached.

**CSS / glass**
- Three Chromium rules silently kill `backdrop-filter`, all found by testing the rendered page:
  the element having its own `filter`; sitting inside `isolation: isolate`; or **any** ancestor
  holding a transform — including the identity transform a forwards-filling animation leaves
  behind (hence `.intro-nav` fills `backwards`).
- The wallpaper (`body::before`, `.app-shell`) is **load-bearing** — glass needs colour behind it
  to bend. Flatten it and every panel becomes a plain white card.
- Shared component classes stay inside `@layer components` so utilities can still override them.
  A rule that must beat the global unlayered `:focus-visible` must itself be unlayered.
- `--hl` must stay **inheriting** (pseudo-elements and inner pills read the animated value).
- Grid columns holding wide content need `minmax(0,1fr)` or mobile overflows horizontally.
- The mobile tab bar sizes itself from `--tabs`, set inline by `AppShell` from
  `DASHBOARD_NAV.length`. Add a nav item and it adapts; hardcoding the column count clips the last item.
- **One sliding pill.** Every selector in the workspace — segmented controls and page tabs, the
  nav rail and its Integrations/Settings foot group, the settings side tabs, the mobile tab bar —
  renders `Thumb` from `components/app/ui.tsx`, which slides one raised glass pill across a
  recessed track. The variant class (`.thumb` / `.tabthumb` / `.navthumb` / `.vthumb`) sets only
  the inset and radius; the material is the single `--thumb-bg` / `--thumb-sh` pair in the
  consistency block at the end of `app.css`, and `--track` is the recess every pill travels along.
  The same pair dresses outline buttons, the focused search field and selected sort headers, so
  **add a new control to that block rather than inventing a third fill**.
- `Thumb` measures from its own `parentElement`, not a ref passed in: React attaches a parent's
  ref *after* its children's layout effects run, so a thumb handed its track's ref measures nothing
  on the first pass and never appears. It measures with `getBoundingClientRect()` against the
  track rather than `offsetTop` — the Leads row sits inside the positioned `.navhas` dropdown
  wrapper, which would otherwise be its offset parent and report zero.
- `toAppLead` (`lib/app/adapt.ts`) must not append a `Title: …` tag the stored tags already
  carry — `LeadsScreen` keys tag chips by text, so a repeat is a duplicate-key React warning.

**Animation**
- Animate `transform`/`opacity` only. New looping decorations must be added to the
  `prefers-reduced-motion` block.
- Every reveal is gated on `.js` (added by an inline script in `layout.tsx`) so content stays
  visible without JS.
- Chromium: SVG `pathLength` + `stroke-dasharray` + `vector-effect: non-scaling-stroke` draws
  only part of the path. Drop `vectorEffect` or use a `clip-path` wipe.
- `Hero`'s `DESKTOP_MQ` media query must match the CSS block in `globals.css`.

---

## 6. Content rules (from the product brief — these are commitments, not preferences)

- No invented testimonials, customer logos, metrics, integrations or certification claims.
- Dashboard and product figures stay labelled illustrative/demo data.
- Integrations beyond LinkedIn and email are shown as "Planned".
- No fake booking or calendar availability. The founder-call calendar is a clearly labelled
  *preferred-time request* — a founder confirms by email, nothing is booked until then.
- `/signup` validates and creates nothing, and says so. Never show a fake success.

---

## 7. Known gaps / open work

Roughly in the order they should be closed.

1. **Seven screens still read `lib/app/` constants** (Home, Inbox, Analytics, Settings,
   Workflows, Integrations, AppShell counts) — they render demo data regardless of the database.
   Leads and Campaigns show the pattern to follow.
2. **Two data models** bridged by `lib/app/adapt.ts`; converging them removes the adapter and the
   need to add every new field in three places.
3. **Uploads, segments and lead profiles have no tables.** The upload feature works against the
   in-memory store, and `PgRepository` delegates its six methods there, so with `DATABASE_URL`
   set those rows still live in process memory, vanish on restart, and are not tenant-isolated by
   the database the way every other table is. Parked uploads are meant to be scratch (the modal
   says so); segments and profiles are not. `lib/leads/merge.ts` defines what the schema needs.
4. **Workflow builder does not persist.** The `workflows` table is ready and unused.
5. **No execution engine.** `workflow_runs` / `step_jobs` are shaped for it; nothing writes them.
   Intended shape: an authenticated `/api/jobs/tick` claiming due rows with
   `FOR UPDATE SKIP LOCKED`, poked by cron (a GitHub Actions schedule is a free MVP scheduler).
6. **Nothing writes `events`, and no job builds `daily_rollups`.** The seed writes rollups
   directly, so analytics is real SQL over invented numbers. `lib/app/metrics.ts` (the PRNG) still
   backs the screens not yet rewired.
7. **Campaign counters are denormalised and nothing maintains them.** `campaigns.sent/delivered/
   openRate/...` come from the seed; the engine should own them.
8. **Auth has no OAuth, email verification, password reset or rate limiting**, and roles exist as
   a column (`memberships.role`) that nothing enforces. Better Auth drops in on the same Postgres.
   Sessions are not refreshed on use, so an 8-hour session ends mid-work.
9. **No `getUser` for team members** — the owner is the only account with a password hash, so
   only one person can sign in.
10. `gtm_mock.html` at the root is a standalone design reference, not part of the app.

## 8. Running it locally

```bash
cp .env.example .env.local      # fill DATABASE_URL (pooled) + AUTH_SESSION_SECRET
npm run db:migrate              # applies drizzle/*.sql
npm run db:seed                 # demo workspace; idempotent, scoped to w_demo
npm run dev
```

Without `DATABASE_URL` the app falls back to `MemoryRepository` and the single demo account, so a
bare clone still runs — but nothing persists, and the live screens show the in-memory seed.

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
