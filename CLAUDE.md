# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context map

`CONTEXT.md` in the repo root is the codebase map: file inventory with line counts, the
architectural seams, a "where do I change X" index, and the hard-won constraints. **Read it
before exploring the tree** — it is written to answer most orientation questions without opening
a source file.

**Keep it current in the same commit as the change.** Any work that adds, moves or deletes a
file, route or database table, changes an architectural rule or seam, makes a screen read live
data, adds a repository method, closes or uncovers a gap, or discovers a non-obvious constraint
must update the matching section of `CONTEXT.md` alongside the code. A stale map is worse than
none, because it is trusted. `CONTEXT.md` ends with a short section spelling out which section to
touch for which kind of change.

## Project

Flightpath: a marketing site and prototype workspace for a GTM workflow-orchestration SaaS aimed at SMB sales teams. Routes: the landing page (`/`: Hero → Journey → WhyFlightpath → WorkflowLibrary → FounderBooker), a demo-request page (`/book-demo`), prototype auth pages (`/login`, `/signup`), and the signed-in app under `/dashboard`, including the campaign workflow builder. Stack: Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS v4 (via `@tailwindcss/postcss`, no `tailwind.config`), ESLint 9 flat config. The only runtime dependency beyond Next and React is `lucide-react`.

The marketing pages (`/`, `/book-demo`, `/login`, `/signup`) use the Tailwind theme in `app/globals.css`, now an iOS "liquid glass" skin over a colour wallpaper. The signed-in workspace under `/dashboard` uses `app/app.css`, a verbatim port of the reference app's stylesheet. The two are deliberately separate: a redesign that put the landing page on `app.css` was rolled back, so `app.css` is loaded by the dashboard layout only. Both render the same material, through different stylesheets.

`gtm_mock.html` in the root is a standalone design reference/mock. It is not part of the app.

## Commands

```bash
npm run dev          # dev server (http://localhost:3000)
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm test             # node --test tests/*.test.mjs
node --test --test-name-pattern="validates email" tests/demoRequest.test.mjs   # single test
```

- **Tests** use Node's built-in runner, not Jest or Vitest. `.mjs` test files import `.ts` sources directly via Node's native type stripping (Node ≥ 22.18). So any module under test must:
  - have no extensionless relative imports and no `@/` alias imports;
  - use only erasable TS syntax (no enums or namespaces).
- **Never run `npm run build` while `next dev` is running.** Both write to `.next/`, and doing so has corrupted the cache: dev returns 500 with "Could not find the module … segment-explorer-node.js#SegmentViewNode in the React Client Manifest". The project also lives in a OneDrive folder. To build or recover: stop dev, delete `.next`, then build or restart.
- `next dev` silently moves to port 3001+ if 3000 is taken, often by a forgotten earlier dev server whose `.next` cache is stale (it then serves 500s). Check the "Local:" URL it prints, and stop the old process.
- Keep TypeScript on 5.x. TS 6 broke the `import "./globals.css"` side-effect import.

## Architecture

**Liquid glass on the marketing pages (`app/globals.css` + `components/SiteGlass.tsx`)**
- The material is one unlayered **glass skin** block at the end of `globals.css`. Every pane, tile, chip, field and button in its selector list is a translucent fill (`--g-tint`) over a blurred, saturated and refracted backdrop (`--g-blur`, `--g-sat`), with a bright inner rim (`--g-rim`) and a soft shadow. Re-tune the whole page from those tokens on `:root`; **add a new surface to that selector list and to the lens/specular lists in `SiteGlass.tsx` together**, or it renders flat.
- `components/SiteGlass.tsx` mounts the runtime (`mountLens` / `mountSpecular` from `components/app/glass.ts`) and is rendered by `Navbar`, so every page with the site chrome gets it and the dashboard does not. The navbar passes a stronger lens than the panes.
- `--hl` (registered with `@property`, **inheriting**) fades the pointer-tracked highlight in on hover. It must inherit: pseudo-elements and inner pills read the value the parent animates.
- **The ripple.** `--rip` (0 → 1, registered with `@property`, resting at 1 so an idle surface shows nothing) drives a ring that runs out from wherever the pointer lands; it is the first background-image layer in the glass skin. `mountSpecular` steps it per frame. It is deliberately **not** a CSS animation or transition: the pinned hero tiles carry their own, more specific, `animation` and `transition`, and either would silently win.
- **Hover strength.** Every pointer-driven highlight — the ripple ring, the specular pool, the button sheens, the navbar pills — is an alpha multiplied by `var(--hl)`. They were all scaled down by 30% at the user's request; keep them in proportion with each other if you re-tune. A cursor-following refracting droplet was built and then removed as too much; don't reintroduce it without asking.
- The hero photograph trial (`.hero-sky`, `public/hero-forest.jpg`, the dark-scope token flip) was removed at the user's request; the hero now sits on the same colour wash as the rest of the page, in the normal light scope. `.lg-nav.is-dark` and the `[data-nav-dark]` toggle in `Navbar` are dormant (no element sets that attribute any more) — left in place as a reusable "dark capsule over a dark surface" utility rather than deleted, in case a future section needs it.
- **The wallpaper on `body::before` is load-bearing**: glass only reads as glass when there is colour behind it to bend. Flattening it makes every panel a plain white card.
- Three Chromium rules silently disable `backdrop-filter`, all three found by testing the rendered page, so no glass surface may gain any of them:
  - its own `filter` (so the refraction rides *inside* the `backdrop-filter` list, as `var(--lens, opacity(1)) blur(…)`);
  - sitting inside `isolation: isolate`;
  - an ancestor holding a transform — including the identity transform a forwards-filling animation leaves behind, which is why `.intro-nav` fills `backwards`.

**Liquid glass in the workspace (`app/app.css` + `components/app/glass.ts`)**
- `app/app.css` is the whole design system for the workspace: tokens, layout, every screen, the glass material, responsive rules and reduced motion. It is vendored — change the `:root` tokens rather than rewriting rules. The one addition is the clearly marked block at the end, which supplies the canvas positioning rules the removed React Flow stylesheet used to provide. It is imported by `app/dashboard/layout.tsx` only, so Next ships it on the dashboard routes alone.
- The glass is not just a blur. `components/app/glass.ts` runs two effects, mounted by `<Glass />`:
  - **Refraction.** For each glass surface it paints a rounded-rect bevel normal map into a canvas, feeds it to an SVG `feDisplacementMap`, and points the element's `--lens` at that filter. Filters are keyed `lg-<w>-<h>-<radius>` so surfaces of the same size share one.
  - **Specular.** A pointer listener writes `--mx` / `--my` onto the surface under the cursor and up to two ancestors, which the stylesheet turns into a highlight that follows the pointer — this is the hover response on buttons, cards, chips and rows.
- A surface opts in by class: the lens list is `.card,.pane,.side,.modal,…` and the specular list adds `.btn,.ib,.navi,.th,…`. **Add new glass controls to those selector lists in `glass.ts` and to the glass skin block at the end of `app.css`**, or they will render flat.
- Without JS, or where `backdrop-filter` is unsupported, surfaces still render — they just lose the refraction.

**Workspace data (`lib/data/` + `/api/*`)**
- **Every dashboard screen reads its own workspace** through the repository and the REST API: Home, Inbox, Leads, Campaigns, Workflows (+ builder), Analytics, Configuration, Integrations, Settings and the rail badges (`/api/badges`). A workspace only ever sees its own rows. **Never put figures, names, accounts or campaigns in a component or in `lib/app/`** — `lib/app/` is presentation helpers (channel keys/colours, stage colours, status pills), the workflow model and rule defaults, not data.
- The only invented content is the **sample world**: `lib/data/sample.ts` (content, tested) seeded by `lib/data/sampleSeed.ts` inside the signup transaction. Everything in it is flagged `is_sample`, labelled "Sample" in the UI (`SampleBanner`) and deleted by `DELETE /api/workspace/sample`. Its figures are derived from one funnel table, so the campaigns table, Home and Analytics agree (a test pins that).
- In the no-database demo mode (the `dev` deployment) `MemoryRepository` serves the older demo dataset in `lib/data/seed.ts` through the same API, so every screen works there too.
- **LinkedIn accounts and mailboxes belong to the workspace, not to a campaign** (`channel_accounts`, `campaign_accounts` many to many, `sending_domains`). Any number of campaigns can send from one account, for both channels. Connecting a real account is not built; a real workspace shows what is true (nothing connected). The setup checks are computed from real state in `lib/data/setup.ts`.

**Legacy styling system (`app/globals.css`)**
- Design tokens are CSS variables on `:root` in `app/globals.css`. The testing theme is black-and-white "liquid glass": pure white `--bg`, near-black `--ink`, and a black `--accent` / `--accent-ink` (so tinted elements are neutral greys), with system green/orange/red for status. Every other token is derived next to them. They are mapped to Tailwind utilities through `@theme inline` (`bg-surface`, `text-accent-ink`, `bg-sky`, …). To re-theme, edit only the `:root` block; add new colours in both places. A few rules and SVGs (Pip's artwork in `components/pip/pipSvg.ts`, `rgb(...)` glows and the pastel wallpaper in `body::before` in `globals.css`, `app/icon.svg`) hardcode brand colours, so grep for them when changing the palette.
- **Liquid glass:** `.glass`, `.glass-lg` and `.card` share one translucent fill + heavy `backdrop-filter` blur/saturation + specular inset rim (all in `@layer components`), sitting over the fixed pastel "wallpaper" gradient in `body::before`. Small controls (chips, calendar days/slots, month arrows, picker rows marked `glass-row`) get the same look from the **unlayered "glass skin" block at the end of `globals.css`**, which has to be unlayered to beat their background utilities; add new chip-like controls to that selector list. iOS control idioms live there too: `.btn-secondary` is a pale-grey "tinted" capsule, `.field` is a grey-filled text field, and the template picker in `WorkflowLibrary` is a grey segmented control with a white thumb. Glass only reads against something behind it, so keep the wallpaper, and keep the number of blurred surfaces on screen small (the pinned Hero's cards drop their blur once merged). The navbar is a floating glass capsule (`sticky top-3`); `--nav-h` (76px) is the pinned Hero's top offset.
- Use `--accent` for fills, buttons and rings, and `text-accent-ink` for accent-coloured text: accent and ink are the same black here, but keep the split so a coloured theme still works.
- Fonts: `--font-sans`, `--font-serif` (the bold display face; utility name kept from the earlier serif) and `--font-mono` (labels/eyebrows, rendered in the system face like iOS section headers) all start with the Apple system stack (`-apple-system`, SF Pro) and fall back to Inter loaded via `next/font` in `app/layout.tsx` (`--font-body`), so Apple devices get real SF and everything else gets Inter. `.font-serif` and `.display` are weight 700 with tight tracking, and `em` is not italic (it is muted grey).
- **Shared component classes** (`.card`, `.btn`, `.btn-primary`, `.btn-secondary`, `.container-page`, `.eyebrow`, `.field`) must stay inside `@layer components`. Unlayered CSS beats Tailwind utilities, so layered classes can still be overridden by utilities, e.g. `hidden` on a `.btn`.
- **Exception:** a rule that must beat the global unlayered `:focus-visible` outline must itself be unlayered (see `.field:focus-visible`).

**Animation conventions**
- An inline script in `layout.tsx` adds `.js` to `<html>`. Every entrance or reveal style is gated on `.js …`, so content stays visible without JS.
- Page-load intros are pure CSS keyframes (`.intro`, `.intro-word`, `.intro-card`, …), staggered with the `--d` custom property (`style={{"--d": "300ms"}}`). They run before hydration, so the intro plays even though `Hero` is a client component.
- Scroll reveals use `components/Reveal.tsx` / `lib/useInView.ts`, an IntersectionObserver that toggles `.is-visible` (delay via `--reveal-delay`).
- Heavy animation avoids React re-renders per frame:
  - `Hero` is pinned (sticky, 250vh, desktop only via the `DESKTOP_MQ` media query, which must match the CSS block in `globals.css`). Its six cards sit in their final grid slots and are translated out to scattered positions, then scroll progress glides them home (FLIP-style, inline transforms). After they land, `--m` (0→1, set on the section from scroll progress) fades each card's outline (`.hcard::before`) and fades in hairline dividers (`.hcard::after`), so the six read as one card. Outside the desktop query the cards stay separate and stacked.
  - `Journey` and `WorkflowLibrary` use beat timers plus one rAF for the travelling packet, started when in view. Journey's extra motion (dot springs and rings, text slide-ins, pill pops, gauge sheen, pinging token) is pure CSS keyed off the `.jr-row.is-on` / `.is-chosen` / `.is-on` state classes, so it replays whenever the beat state resets; its looping pings are in the reduced-motion block.
  - `WhyFlightpath` shows the same five chips twice. "Today" is tilted and jittering with tangled curved wires. "With Flightpath" is `components/UntangleFlow.tsx`: it starts from the exact tangled layout, then (once in view) a rAF loop writes chip positions, wire `d` attributes and packet positions straight to refs while the tangle untangles into columns around a hub; its server HTML and reduced-motion state are the finished layout. Both cards read one shared `TOOLS`/`LINKS` table exported from that file, so edit positions there.
- Animate `transform`/`opacity` only. The `prefers-reduced-motion` block at the end of `globals.css` zeroes durations and delays and hides decorative loops. New looping decorations need adding there.
- Known Chromium pitfall: SVG `pathLength` + `stroke-dasharray` combined with `vector-effect: non-scaling-stroke` draws only part of the path. Drop `vectorEffect`, or use a `clip-path` wipe instead.
- Grid columns that hold wide content need `minmax(0,1fr)` (e.g. `grid-cols-1`) to avoid mobile horizontal overflow.

**Navigation**
- `lib/site.ts` holds `DEMO_HREF` (`/book-demo`), `NAV_LINKS` and the auth route constants. Nav hrefs are root-relative hashes (`/#journey`, `/#why`, `/#how-it-works`) so they work from any route. Use `next/link` for them.
- Section ids on the landing page are what those links target. `#top` exists on both pages because the footer's "Back to top" links to it. The landing page's last section has anchor `id="founders"` but `data-pip-section="demo"` (Pip's table key), so the two differ on purpose.

**Demo-request flow (`/book-demo`)**
- `lib/demoRequest.ts` is the single shared contract: option lists, the `DemoRequest` type, `validateDemoRequest()` and the `DemoSubmitResponse` union. It is deliberately import-free so it runs in the browser, in the route handler, and under `node --test`.
- `components/demo/DemoForm.tsx` (client) validates with that same function. `submitDemoRequest()` in that file is the only network call.
- `app/api/demo-request/route.ts` re-validates, then forwards to `process.env.DEMO_REQUEST_WEBHOOK_URL`, with an optional `DEMO_REQUEST_WEBHOOK_SECRET` sent as a Bearer token. Both are server-only; see `.env.example`.
  - Webhook not set: returns 503 `not_configured`.
  - Invalid input: 422 with field errors.
  - Webhook failure: 502.
- The success UI must only appear on a genuine `{ ok: true }`.
- `app/book-demo/page.tsx` is `force-dynamic` so its "delivery not connected" setup note reflects the runtime env.
- **Founder call booker** (`components/FounderBooker.tsx`, landing page `#founders`) is a second request shape on the same endpoint: it posts `{ kind: "founder_call", … }`, validated by `validateFounderCall()` in `lib/demoRequest.ts` (preferred `date` + `time` in 30-minute slots 09:00–17:30, plus name, email, pains, optional notes and guest). The route branches on `kind` and tells the webhook apart by `type` (`demo_request` vs `founder_call_request`). The calendar is a **preferred-time picker, not availability**: copy must say a founder confirms by email and nothing is booked until then. "Today" is read in an effect so the server render has no date-dependent markup.

**Pip (site mascot)**
- `components/pip/`: `Pip.tsx` is mounted once in the root layout, `engine.ts` is the imperative engine (one rAF loop, all listeners disposed on unmount), `pipSvg.ts` holds the artwork, and the styles are in `app/pip.css`.
- Sections opt in with `data-pip-section="<id>"`. The perches and lines live in the `SECTIONS` table in `engine.ts`; missing sections are skipped, so one table serves both routes.
- Sections talk to Pip through `lib/pip.ts`: `pipSay(text)` makes him speak, and `setPipBusy(true)` pauses his idle skits while a section narrates itself.
- On form fields he reads `data-explain` hints; forms marked `data-pip-host` are where he perches to cheer.

**Auth (MVP: invite-only accounts)**
- `lib/auth.ts` (server-only) runs in two modes, chosen by `DATABASE_URL`. **Database mode:** users are rows with a scrypt hash (`lib/password.ts`), and a session is a row in `sessions` with a server-checked `expires_at`; the `httpOnly` cookie holds only an opaque random id, so logout genuinely revokes it and a copied cookie dies with it. **Demo mode** (no database): the single hardcoded account and an HMAC cookie, so a bare clone still runs. `AUTH_SESSION_SECRET` only signs that demo cookie.
- `/api/signup` takes **name, company, email, password**. It creates a workspace (id `org_<12 url-safe chars>` via `newOrgId()`, named after the company), its owner (`memberships.role = owner`), default quotas, the **sample content** (`lib/data/sample.ts` / `sampleSeed.ts`) and a session in **one transaction**, then signs the user in and lands them on the Campaigns screen (`FIRST_RUN_HREF`). **It is invite-only**: the address must be in `SIGNUP_ALLOWED_EMAILS` (exact, case-insensitive, no wildcards); unset means nobody can sign up. Duplicate emails are caught by the unique index (Postgres `23505`, found on `error.cause` because Drizzle wraps it), so two simultaneous signups cannot both win.
- `lib/signup.ts` is the shared contract (validation, allowlist, `SignupResponse`). Import-free like `lib/demoRequest.ts`, so the form, the route and `node --test` all use it. `SignupForm` validates first but moves on **only** when the server answers `{ ok: true }` — never present success on its own say-so.
- Sign-out is a labelled "Sign out" item at the foot of the rail (`SignOutItem`) plus an icon in `TopBar` (the rail is hidden on phones). Both use `useSignOut()` in `components/app/AppShell.tsx`, which calls `api.logout()` → `POST /api/logout` (deletes the session row) and navigates only after the server confirms, **with a full page load** (`window.location.assign`): `app.css` is unscoped and survives client-side navigation, so a soft navigation left `/login` unstyled.
- **Sample data.** Every new workspace starts with one paused multichannel campaign and 8 leads, all flagged `is_sample`, labelled "Sample" in the UI, and removable via `DELETE /api/workspace/sample` ("Remove sample data" banner). Everything in it is invented and says so: emails use the reserved `.example` domain and phones the fictional 555-01xx range, so a sample lead can never be a real person (`tests/sample.test.mjs` enforces both).
- **Migration order.** `0002_sample_flag` and `0003_workspace_data_model` add columns and tables the code reads, so each must be applied to Neon **before** code that needs it is promoted to `main`. Check generated migration SQL statement order by hand (0003 needed one fix).
- **Environments.** Production (`main`) has `DATABASE_URL` set; `dev` deliberately has **no database** and runs in demo mode (hardcoded demo account, in-memory data, signup says it is unavailable). Do not create a database or Neon branch for `dev`. Vercel deploys only `main` and `dev` (`vercel.json`).
- There is no email sending, so **no password reset or verification**. The recovery path is `npm run db:set-password` (password from `NEW_PASSWORD`, never argv), which also revokes that user's sessions. No login rate limiting yet.
- `/dashboard` redirects to `/login` without a valid session; a signed-in visitor to `/login` or `/signup` is sent to the dashboard.
- `LOGIN_HREF`, `SIGNUP_HREF`, `DASHBOARD_HREF` live in `lib/site.ts`. Never import `lib/auth.ts` from a client component.

**Signed-in app (`/dashboard`)**
- Routes: `/dashboard` (Home), `/dashboard/inbox`, `/leads`, `/campaigns`, `/campaigns/[id]` (the builder), `/analytics`, `/settings`. `app/dashboard/layout.tsx` guards the session and renders `components/app/AppShell.tsx` (glass rail, top bar, mobile tab bar). It is `force-dynamic` so signing out takes effect immediately.
- Screens live in `components/app/` and fetch their own data (see **Workspace data**). `ui.tsx` holds the shared controls (`Segmented`, `Switch`, `Avatar`, `Delta`, `Meter`), `charts.tsx` the SVG sparkline, area and bar charts, `icons.tsx` the 24px icon set.
- **The workflow builder** is covered under "Workflows and the builder" below. `lib/app/workflow.ts` is the model (import-free and erasable, `tests/workflow*.test.mjs`); `components/app/builder/` is the canvas (`WorkflowBuilder` owns state and autosave, `Canvas`, `StepCard`, `Inspector`). **@xyflow/react is deliberately not a dependency** — the canvas is ours and keeps the reference's `.react-flow__*` class names because `app.css` styles them. `stepStats()` derives the canvas figures from the audience size; they are estimates, not results.
**Lead uploads and segments (`lib/leads/`, `/api/leads/*`)**
- One uploaded file is one **segment**. The flow is three steps in `components/app/leads/UploadLeads.tsx`, opened from the Leads dropdown in the rail (`LeadsNav` in `AppShell.tsx`, rendered into `document.body` because the rail scrolls and is its own stacking context) and from the Leads screen. Max 4 MB (`lib/leads/limits.ts`): Vercel rejects larger bodies before our code runs.
- Files are parsed **on the server only** (`.csv` with our own reader, `.xlsx` through `exceljs`; the browser imports `limits.ts` only). The browser sees headers, the first five rows and a suggested mapping. The parsed file is parked in the `uploads` table (not process memory — serverless instances do not share it) and swept after an hour.
- Every repository call takes `Ctx` first. The leads routes build theirs from the session cookie via `requestCtx()` in `lib/leads/ctx.ts` — never from the request body, which would be a tenancy bypass.
- **Validation is content-based, never header-based** (`lib/leads/validation.ts`, import-free): email needs an `@` with something either side, LinkedIn needs a web URL, and numbers go through `lib/leads/phone.ts` (libphonenumber-js `/max`, exact digit counts). `lib/leads/analyse.ts` is the one server pass the summary step and the save step share.
- **Saving a segment writes real leads.** New people become ordinary `leads` rows (source `csv`, stage `new`; name/company/title come from the file's columns via `lib/leads/profile.ts`, else from the email/LinkedIn), matches are merged into existing leads (`lib/leads/merge.ts`: email, then mobile, WhatsApp, LinkedIn; the existing lead keeps what it has and gains what it lacked), and everyone is linked in `segment_leads`. Consent: the modal asks the user to attest the people may be contacted; it applies to leads the upload *creates* and never changes an existing lead's consent.
- **Cross-campaign dedupe.** A lead is in at most one campaign (`leads.campaign_id`). Rows matching a lead who has a campaign on ANY of email/mobile/WhatsApp/LinkedIn (`findInJourney`) are excluded from the new segment: the summary step warns with the count and the campaigns, and the save step recomputes it server-side. Enrollment (setting `campaign_id` from a workflow's audience) is not built — it belongs to Launch.
- In the builder, the first step picks an audience: "Leads in this campaign", "All leads" (both counted live), or a saved segment (`AudienceList` carries `reach` and `columns` per attribute; `stepStats()` counts reachable leads and a channel step is capped by the column it reads).
- Tests: `leadsValidation`, `leadsMerge`, `leadsJourney`, `leadsProfile`, `workflowSegment`.

- **The storage seam is `lib/data/repository.ts`.** Pages and route handlers only ever talk to that interface, obtained from `getRepository()` in `lib/data/index.ts`. It returns `PgRepository` (`lib/data/pg.ts`, Drizzle over Postgres) when `DATABASE_URL` is set and `MemoryRepository` (`lib/data/memory.ts`, over the demo seed in `lib/data/seed.ts`) otherwise. Every method takes `Ctx` (`workspaceId` + `userId`) first, built from the session in `lib/http.ts` and never from a request body; implementations must filter on `workspace_id` for reads *and* by-id writes. Every screen is wired to it; see `CONTEXT.md`.
- `lib/data/query.ts` holds the pure filter/sort/paginate helpers both implementations share; it is import-free and covered by `tests/dataQuery.test.mjs`.
- REST endpoints live under `app/api/*`: `me`, `workspace`, `workspace/sample`, `overview`, `badges`, `tasks`, `tasks/[id]/complete`, `campaigns`, `campaigns/[id]`, `campaigns/[id]/workflow`, `workflows`, `accounts`, `accounts/[id]`, `accounts/[id]/campaigns`, `leads`, `leads/[id]`, `leads/uploads…`, `leads/segments`, `threads`, `threads/[id]`, `threads/[id]/messages`, `analytics`. They share `lib/http.ts` (`withUser`, `json`, `fail`, param parsers) so auth, caching and error shapes are identical: 401 unauthenticated, 404 missing, 422 invalid, `{ error: { code, message } }`.
- Server components read the repository directly; client components call the typed browser client in `lib/api.ts`. Don't `fetch("/api/...")` by hand.
- Writes in the memory store (no `DATABASE_URL`) last until the server restarts.

**Workflows and the builder**
- A multichannel campaign *is* a workflow: the route id is the campaign id, and the graph is stored in the `workflows` table (one row per campaign) through `Repository.getWorkflow/saveWorkflow`. `lib/app/workflow.ts` owns the graph model, the demo `WORKFLOWS` seed (used by the memory repository) and the storage helpers: `validateWorkflowGraph()` rebuilds every incoming graph from a whitelist (unknown keys, bad sockets, a second Audience and cycles are refused — the canvas recurses and would hang on a cycle). `lib/app/workflowLibrary.ts` derives the library cards.
- **The builder has one route: `/dashboard/workflows/[id]`.** It autosaves (debounced, flushed on leave) and shows a truthful save state. `/new` and numeric ids redirect to the library; `/dashboard/campaigns/[id]` is a permanent redirect — do not render a second copy of the builder there.
- `/dashboard/workflows` is the library: `.wfgrid` cards and a `.tplgrid` template picker. Picking a template creates a draft multichannel campaign and its workflow, then opens the builder (never create rows on a GET: link prefetch would run it).
- **Nothing sends.** `lib/capabilities.ts` `SENDING_ENABLED = false` disables Launch/Test in the builder and refuses to switch a campaign "live" anywhere. Do not mark invented or unsent work as live; flip the flag only in the commit that lands a sender.

**Integrations (`/dashboard/integrations`)**
- `lib/app/integrations.ts` is the static provider catalogue. A provider's *state* is derived from the workspace's own accounts and domains by `providerView()`; the page is one card of collapsible category sections with a **Connected** section on top (connected/needs-attention providers are pulled out of their category); account and domain detail lives in Configuration.
- **LinkedIn and email are the only providers that can connect**, and connecting is not built yet (the drawer's Connect button is disabled and says so). WhatsApp Business, Twilio, calendar, the CRMs and webhooks are `planned`, which shows a Planned pill and says so in the drawer. That is the content rule below, not a styling choice: never offer a connection the product cannot honour.
- Reached from the rail (below the main nav, next to Settings) via `INTEGRATIONS_HREF` in `lib/nav.ts`.

**Wallpaper is load-bearing.** Glass only reads as glass when there is colour behind it — the app wallpaper on `.app-shell`, and `body::before` on the marketing pages. Flattening either makes every panel look like a plain white card, so check `--tint` / `--g-tint` and the blur before touching them.

Pip is a marketing guide and is hidden on `/dashboard` (see `components/pip/Pip.tsx`).

## Content rules

These come from the original product brief:
- No invented testimonials, customer logos, metrics or integrations, and no certification claims.
- Dashboard and product figures must stay labelled as illustrative or demo data.
- Integrations beyond LinkedIn and email are shown as "Planned".
- No fake booking or calendar availability. The founder-call calendar is allowed only as a clearly labelled preferred-time request (see above).
