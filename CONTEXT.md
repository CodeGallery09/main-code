# CONTEXT.md — codebase map

Orientation file for agents. Read this first; it replaces grepping the tree.
**Keep it current:** any change that adds a file, a route, a table or an architectural
rule must update this file in the same commit. See "Maintaining this file" at the end.

Last updated: 2026-10-14 · ~32k lines of source across 135 files.

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
| `ConfigurationScreen.tsx` + `configuration/` | 1805 | `lib/app/configuration`, `lib/app/campaigns` | no |
| `ui.tsx` `charts.tsx` `icons.tsx` | 628 | — | shared controls, SVG charts, 24px icons |
| `glass.ts` | ~230 | — | refraction + specular runtime, **marketing-only now** (see §5) |

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
A multichannel campaign *is* a workflow (same numeric id) **in the demo data layer only** — see
the id-mismatch gap in §7. `/dashboard/integrations` (`IntegrationsScreen`,
`lib/app/integrations.ts`): only LinkedIn and email can connect; every other provider is
`state: "planned"` with a disabled primary button.

**Workflows are campaign-scoped, with a jump dropdown everywhere a workflow is shown.**
`WorkflowsScreen.tsx`'s header and `WorkflowBuilder.tsx`'s toolbar (`.bh`) both carry a
`<select>` of `CAMPAIGNS.filter(c => c.type === "multi")` (same filter in both, kept local to
each file rather than shared, since it's one line) that routes to `/dashboard/workflows/<id>` on
change — the same pattern as Configuration's campaign picker (above). The builder's select is
keyed by `workflow.id`; a draft not yet in `CAMPAIGNS` (new/unsaved) gets a synthetic option so
the control never shows empty.

**Campaign creation has one entry point.** `CampaignsScreen`'s "Create campaign" button (opening
`CampaignEditor`) is now the only way in: the sidebar used to carry a second "New campaign" button
straight into a blank, unnamed workflow (`AppShell`, `href="/dashboard/workflows/new"`), and
`CampaignsScreen` carried a third, "New workflow", doing the same — both bypassed the name/type/
status/channel form and were removed. Starting a workflow from a template (`WorkflowsScreen`'s
"New workflow" + picker) is unaffected; it is the builder's own entry point, not a competing
campaign-creation path.

### Configuration — `/dashboard/configuration`
`ConfigurationScreen.tsx` + `components/app/configuration/` (`Overview`, `ChannelTabs`,
`RuleTabs`, `parts`), reading `lib/app/configuration.ts`. Nine tabs: an overview of the setup
checks that are failing, one per channel (LinkedIn, Email, WhatsApp, Calls, SMS), then
Variables, Sending rules and Compliance. Reached from the rail's **foot group**, with
Integrations and Settings — it is workspace-level setup, not a working screen, so it stays out
of `DASHBOARD_NAV` and off the mobile tab bar. `CONFIGURATION_HREF` is in `lib/nav.ts`.

Three things to know before changing it:
- **Edits are in-component only.** Every switch, stepper and field holds state for the length of
  the visit; there is no configuration store or route behind it. Each tab carries the
  `<DemoNote>` saying so, and the figures are sample data, not measurements (§6).
- **WhatsApp, Calls and SMS carry `<PlannedNote>`** and disable their primary buttons, for the
  same reason Integrations marks them planned (§6). *Known inconsistency:* `SettingsScreen`
  still shows those three as "Connected", because `lib/app/workspace.ts` predates the rule.
- **The akkari palette/font used to be scoped to this screen alone** (a `.cfg` class). It is now
  the whole dashboard's default — see §5, "Workspace is flat, not glass."

**Campaign scoping.** The `cf-head` row carries a campaign picker (`CAMPAIGNS` from
`lib/app/campaigns.ts`, demo data, same as the Workflows library) alongside the tab strip, so it
shows on every tab. Only the LinkedIn and Email tabs read it (`scopeCampaignId` prop into
`LinkedInTab`/`EmailTab`): picking a campaign tags the seat or mailbox that serves it with a
"Selected campaign" badge, and a multichannel pick adds an "Open workflow" link to its builder.
Sending rules, variables and compliance stay workspace-wide on purpose — they are not per-campaign
in the product brief, so the picker does not filter them; the screen says this under the tab
strip when a campaign is selected.

**Channel assignment is exclusive for email, shared for LinkedIn.** `Mailbox.campaignId` is a
single `number | null` — a mailbox sends for one campaign at a time, and `Mailboxes()`'s `assign()`
clears any other mailbox already holding that campaign id when it is reassigned, so the rule holds
even though nothing is persisted. `LinkedInSeat.campaignIds` is a `number[]` — a seat can carry
several campaigns at once, with no such exclusivity. Both are edited from a "Used by campaigns" /
"Assigned campaign" control on the seat/mailbox tile in `ChannelTabs.tsx`, state-only like the rest
of the screen.


### Legacy demo data — `lib/app/` (2631L, hardcoded)
`channels.ts` `leads.ts` `campaigns.ts` `inbox.ts` `workspace.ts` `integrations.ts`
`configuration.ts` (829L — the Configuration screen's content) `workflowLibrary.ts` · `metrics.ts` (241L) is a seeded PRNG walking 180 days, deterministic so
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
| Re-theme workspace | `:root` tokens in `app/app.css`. It is vendored, multi-pass — change the **final** `:root`/flattening block at the true end of the file, since same-specificity CSS means last-in-source wins over every earlier redeclaration. |
| Add a glass surface (marketing only) | selector list in `globals.css`'s glass-skin block **AND** `SiteGlass.tsx`'s lens/specular lists. Miss one → renders flat. The workspace has no glass surfaces any more — see §5. |
| Add a nav item | `lib/nav.ts` (workspace) or `lib/site.ts` (marketing) |
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
- Analytics reads `daily_rollups`, so **today has no row until the rollup job runs** — a 30-day
  range legitimately returns 29 points the day after a seed. Not a bug.
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

1. **Eight screens still read `lib/app/` constants** (Home, Inbox, Analytics, Settings,
   Workflows, Integrations, Configuration, AppShell counts) — they render demo data regardless of
   the database. Leads and Campaigns show the pattern to follow.
2. **Two data models** bridged by `lib/app/adapt.ts`; converging them removes the adapter and the
   need to add every new field in three places.
3. **Uploads, segments and lead profiles have no tables.** The upload feature works against the
   in-memory store, and `PgRepository` delegates its six methods there, so with `DATABASE_URL`
   set those rows still live in process memory, vanish on restart, and are not tenant-isolated by
   the database the way every other table is. Parked uploads are meant to be scratch (the modal
   says so); segments and profiles are not. `lib/leads/merge.ts` defines what the schema needs.
3b. **A live multichannel campaign's "open workflow" link 404s.** `CampaignsScreen` links a
   `type: "multi"` campaign to `/dashboard/workflows/{c.id}`, but live campaigns come from
   `lib/data/seed.ts` with string ids (`"c_netnew"`, ...), while the builder's `getWorkflow` reads
   the demo `WORKFLOWS` array in `lib/app/workflow.ts`, keyed by small integers (`1`, `2`, ...) —
   `getWorkflow(Number("c_netnew"))` is `getWorkflow(NaN)`, so the route 404s for every real
   campaign today. It only "works" for the Configuration screen's own picker and the Workflows
   library, because both of those stay on the demo `lib/app/campaigns.ts` ids throughout. Found
   while wiring the Configuration screen's per-campaign "Open workflow" link (kept pointed at the
   demo ids, so it works) rather than the live Campaigns table (left as-is, so as not to paper
   over a 404 with a change that only hides it). Fixing this for real needs the builder rewired
   onto `Repository` (ties into gap 4), not a cosmetic id translation.
4. **Workflow builder does not persist.** The `workflows` table is ready and unused.
4b. **Configuration does not persist either, and has no sequence editor.** Every control holds
   state for the visit. The design reference also opens a sequence/script into a step editor
   (step list, A/B variants, traffic split, token palette, live preview, send-test); the
   `.cf-steps` / `.cf-pv*` / `.cf-phone*` / `.cf-ab` / `.cf-tok` rules in `app.css` are the
   reference's own and are waiting for it. Nothing renders them today, and sequence rows do not
   open.
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
