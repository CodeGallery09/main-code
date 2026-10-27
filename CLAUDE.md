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

Flightpath: a marketing site and prototype workspace for a GTM workflow-orchestration SaaS aimed at SMB sales teams. Routes: the landing page (`/`: Hero → Journey → WhyFlightpath → WorkflowLibrary → FounderBooker), a demo-request page (`/book-demo`), prototype auth pages (`/login`, `/signup`), and the signed-in app under `/dashboard`, including the strategy workflow builder. The workspace has **six destinations** — Home, Inbox, Audiences, Strategies, Analytics, Setup — and the rail and the phone sheet render the same six. Stack: Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS v4 (via `@tailwindcss/postcss`, no `tailwind.config`), ESLint 9 flat config. The only runtime dependency beyond Next and React is `lucide-react`.

The marketing pages (`/`, `/book-demo`, `/login`, `/signup`) use the Tailwind theme in `app/globals.css`, an iOS "liquid glass" skin over a colour wallpaper. The signed-in workspace under `/dashboard` uses `app/workspace.css` and `components/ws/`, a flat operations UI: white cards on a warm paper ground, hairline borders, one near-black accent, no shadows or glass. The two are deliberately separate: a redesign that put the landing page on the workspace stylesheet was rolled back, so `workspace.css` is loaded by the dashboard layout only, and its tokens are scoped to `.ws-root` rather than `:root` because `globals.css` is loaded app-wide.

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
- `components/SiteGlass.tsx` mounts the runtime (`mountLens` / `mountSpecular` from `components/glass.ts`) and is rendered by `Navbar`, so every page with the site chrome gets it and the dashboard does not. The navbar passes a stronger lens than the panes.
- `--hl` (registered with `@property`, **inheriting**) fades the pointer-tracked highlight in on hover. It must inherit: pseudo-elements and inner pills read the value the parent animates.
- **The ripple.** `--rip` (0 → 1, registered with `@property`, resting at 1 so an idle surface shows nothing) drives a ring that runs out from wherever the pointer lands; it is the first background-image layer in the glass skin. `mountSpecular` steps it per frame. It is deliberately **not** a CSS animation or transition: the pinned hero tiles carry their own, more specific, `animation` and `transition`, and either would silently win.
- **Hover strength.** Every pointer-driven highlight — the ripple ring, the specular pool, the button sheens, the navbar pills — is an alpha multiplied by `var(--hl)`. They were all scaled down by 30% at the user's request; keep them in proportion with each other if you re-tune. A cursor-following refracting droplet was built and then removed as too much; don't reintroduce it without asking.
- The hero photograph trial (`.hero-sky`, `public/hero-forest.jpg`, the dark-scope token flip) was removed at the user's request; the hero now sits on the same colour wash as the rest of the page, in the normal light scope. `.lg-nav.is-dark` and the `[data-nav-dark]` toggle in `Navbar` are dormant (no element sets that attribute any more) — left in place as a reusable "dark capsule over a dark surface" utility rather than deleted, in case a future section needs it.
- **The wallpaper on `body::before` is load-bearing**: glass only reads as glass when there is colour behind it to bend. Flattening it makes every panel a plain white card.
- Three Chromium rules silently disable `backdrop-filter`, all three found by testing the rendered page, so no glass surface may gain any of them:
  - its own `filter` (so the refraction rides *inside* the `backdrop-filter` list, as `var(--lens, opacity(1)) blur(…)`);
  - sitting inside `isolation: isolate`;
  - an ancestor holding a transform — including the identity transform a forwards-filling animation leaves behind, which is why `.intro-nav` fills `backwards`.

**The workspace design system (`app/workspace.css` + `components/ws/`)**
- `app/workspace.css` (163L) is the whole token layer: the palette, the status pairs, the `--ch-*` channel colours, the `@theme inline` mapping, `.label-mono`, and a `prefers-reduced-motion` block. It is imported by `app/dashboard/layout.tsx` only, so Next ships it on the dashboard routes alone. The previous vendored `app/app.css` is deleted, along with `components/app/`.
- **Tokens live on `.ws-root`, never `:root`.** `globals.css` is loaded on `/dashboard` too, so a global redeclaration would repaint the marketing pages — and a workspace class name that also exists in `globals.css` inherits the marketing rules. The workspace deliberately avoids `.card`, `.btn`, `.field`, `.glass` and the rest of the glass-skin selector list.
- **No shadows, gradients or glass in the workspace.** Surfaces separate by a hairline border (`--border` between cards, the lighter `--divider` between rows). The single exception is the 1px lift on the active `Segmented` option. `components/glass.ts` (the refraction/specular runtime, moved out of `components/app/`) is marketing-only now — `SiteGlass.tsx` imports it; nothing in `components/ws/` does.
- **Mono carries structure, sans carries prose.** JetBrains Mono (`--font-code`) for the brand, page and card titles, uppercase micro-labels (`.label-mono`) and **every number**; Inter for names, descriptions, body copy and buttons.
- **Colour never carries meaning alone.** Every status is a fg/bg pair with a text label (`StatusPill`); a destructive action differs in icon shape as well as colour. `--ch-*` colours are darkened from each vendor's brand colour so a white monogram clears 4.5:1 — use them on tiles only, never as text, always beside the channel name.
- **Layout without breakpoints.** The shell is `flex flex-wrap` (sidebar `basis-[252px] grow`, main `grow-[999] basis-[760px] min-w-0`); grids are `repeat(auto-fit,minmax(Npx,1fr))`, or `auto-fill` where one card must not stretch; wide tables sit in `overflow-x-auto` with a `min-w`. **Never make the sidebar `fixed`, `sticky` or `h-screen`.** The one breakpoint is `lg`, where the rail becomes a top bar and a sheet.
- **Spacing is fixed:** page body `px-8 pt-6 pb-12`, `gap-5` between sections, card header `px-[18px] py-[14px]`, rows `py-[11px]`–`py-[13px]`. That is what keeps margins aligned across screens.
- **Motion** is `framer-motion`, `transform`/`opacity` only, under ~220ms. `components/ws/ui/motion.tsx` owns the easing and the wrappers (`Appear`, `Swap`, `Row`, `Expand`); `Segmented` and the Setup tabs share one `layoutId` thumb. Every wrapper reads `useReducedMotion()`. Do not use CSS `zoom`.
- **Density** is the type scale in `workspace.css` plus the sizes baked into `components/ws/ui/` (13px body, 11px micro-labels, 30–38px controls). Re-tune the primitive, not individual screens.

**Workspace data (`lib/data/` + `/api/*`)**
- **Every dashboard screen reads its own workspace** through the repository and the REST API: Home, Inbox, Audiences, Strategies (+ builder), Analytics, Setup and the rail badges (`/api/badges`). A workspace only ever sees its own rows. **Never put figures, names, accounts or strategies in a component or in `lib/app/`** — `lib/app/` is presentation helpers (channel keys/colours, stage colours, status pills), the workflow model and rule defaults, not data.
- The only invented content is the **demo strategy**: `lib/data/sample.ts` (content, tested), inserted by `lib/data/sampleSeed.ts`. **Every workspace has it and nothing removes it**: signup seeds it, and `Repository.ensureDemo(ctx)` — called from the dashboard layout — seeds it for any workspace that lacks one (an advisory lock makes concurrent first loads safe). It is one paused multichannel strategy and everything inside it: 8 audiences, their conversations and to-dos, and its funnel by day. Every row is flagged `is_sample` and labelled "Sample" in the UI; Home and Analytics carry a "Demo figures" line (`DemoNote`) while it exists. Its figures are derived from one funnel table, so the strategies table, Home and Analytics agree (a test pins that). **It holds no accounts, mailboxes or domains** — those are the workspace's own, and a sample one would make Setup report something connected that is not.
- In the no-database demo mode (the `dev` deployment) `MemoryRepository` is built from the **same sample world** (`lib/data/seed.ts` derives everything from `sample.ts`), so dev shows what production shows. The funnel is held as per-channel rollup rows and read through the shared `rollupWindows` in `lib/data/query.ts`, the same selection the SQL store makes. `tests`-free but checked: every `/api/*` read returns the same shape in both modes.
- **LinkedIn accounts and mailboxes belong to the workspace, not to a strategy** (`channel_accounts`, `strategy_accounts` many to many, `sending_domains`). Any number of strategies can send from one account, for both channels. Connecting a real account is not built; a real workspace shows what is true (nothing connected). The setup checks are computed from real state in `lib/data/setup.ts`.

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
- `/api/signup` takes **name, company, email, password**. It creates a workspace (id `org_<12 url-safe chars>` via `newOrgId()`, named after the company), its owner (`memberships.role = owner`), default quotas, the **sample content** (`lib/data/sample.ts` / `sampleSeed.ts`) and a session in **one transaction**, then signs the user in and lands them on the Strategies screen (`FIRST_RUN_HREF`). **It is invite-only**: the address must be in `SIGNUP_ALLOWED_EMAILS` (exact, case-insensitive, no wildcards); unset means nobody can sign up. Duplicate emails are caught by the unique index (Postgres `23505`, found on `error.cause` because Drizzle wraps it), so two simultaneous signups cannot both win.
- `lib/signup.ts` is the shared contract (validation, allowlist, `SignupResponse`). Import-free like `lib/demoRequest.ts`, so the form, the route and `node --test` all use it. `SignupForm` validates first but moves on **only** when the server answers `{ ok: true }` — never present success on its own say-so.
- Sign-out is a labelled "Sign out" item at the foot of the rail (`SignOutItem`) plus an item in the mobile sheet (the rail is hidden on phones). Both use `useSignOut()` in `components/ws/shell/use-sign-out.ts`, which calls `api.logout()` → `POST /api/logout` (deletes the session row) and navigates only after the server confirms, **with a full page load** (`window.location.assign`): Next keeps a visited route's CSS across client-side navigation, so a soft navigation left `/login` unstyled.
- **Demo strategy.** Every workspace has one paused multichannel strategy with 8 audiences (see **Workspace data**), all flagged `is_sample` and labelled "Sample" in the UI. It is not removable: there is no "Remove sample data" control or route. Everything in it is invented and says so: emails use the reserved `.example` domain and phones the fictional 555-01xx range, so a sample audience can never be a real person (`tests/sample.test.mjs` enforces both).
- **Migration order.** `0002_sample_flag`, `0003_workspace_data_model`, `0005_channel_connections` and `0006_rename_leads_and_campaigns` add or rename columns and tables the code reads, so each must be applied to Neon **before** code that needs it is promoted to `main`. Check generated migration SQL statement order by hand (0003 needed one fix).
- **Terminology.** The product calls a lead an "audience" and a campaign a "strategy" everywhere — nav, screens, routes, code identifiers and the database (`0006_rename_leads_and_campaigns.sql`). The one deliberate holdover is `Prospect*` (`lib/audiences/prospect.ts`, `GET /api/audiences/[id]/profile`): the lead-detail drawer was already named that before this rename, decoupled from the "lead" display copy on purpose, and stays that way. The workflow builder's root **Audience** step (choosing which group a strategy targets — "Leads in this campaign" before this rename) is a different, older concept that happens to share the new name; don't conflate the two when reading `lib/app/workflow.ts`.
- **Environments.** Production (`main`) has `DATABASE_URL` set; `dev` deliberately has **no database** and runs in demo mode (hardcoded demo account, in-memory data, signup says it is unavailable). Do not create a database or Neon branch for `dev`. Vercel deploys only `main` and `dev` (`vercel.json`).
- There is no email sending, so **no password reset or verification**. The recovery path is `npm run db:set-password` (password from `NEW_PASSWORD`, never argv), which also revokes that user's sessions. No login rate limiting yet.
- `/dashboard` redirects to `/login` without a valid session; a signed-in visitor to `/login` or `/signup` is sent to the dashboard.
- `LOGIN_HREF`, `SIGNUP_HREF`, `DASHBOARD_HREF` live in `lib/site.ts`. Never import `lib/auth.ts` from a client component.

**Signed-in app (`/dashboard`)**
- Routes: `/dashboard` (Home), `/dashboard/inbox`, `/audiences`, `/strategies`, `/strategies/new`, `/workflows/[id]` (the builder), `/analytics`, `/configuration` (Setup · Overview) + `/configuration/config` + `/configuration/messages`. `app/dashboard/layout.tsx` guards the session, reads the user and workspace in parallel, and renders `components/ws/shell/AppShell.tsx` (sidebar, top bar, mobile sheet). It is `force-dynamic` so signing out takes effect immediately. **Every `page.tsx` is a thin server component rendering one client view** — fetch in the page, pass props to the view.
- **The rail and the phone sheet render the same six entries** (`DASHBOARD_NAV`). Below `lg` the rail is replaced by a top bar and a sheet, so anything not in that list is unreachable on a phone: before adding a rail item, check the record it lists is not already listed under another name. Analytics has its own place; it was linked from Home while the nav was a five-slot tab bar. Two routes are chromeless (`/dashboard/strategies/new` and the builder) — `AppShell` detects them.
- **Do not add a control that cannot act.** The top bar's Search (⌘K) button, its notification bell with a hardcoded unread dot, the Audiences "⋯", the row checkboxes with no bulk action and the builder's Test button were all removed for this reason. A feature that is not built says so in words where it would have been.
- Screens live in `components/ws/<area>/*-view.tsx` and fetch their own data through `lib/api.ts` (see **Workspace data**), each through `useAsync` in `lib/ws/use-async.ts` so loading, empty, failed and retry look the same everywhere. `components/ws/ui/` holds the primitives (`button`, `card`, `status-pill`, `segmented`, `channel-tile`, `confirm`, `motion`, and `misc`: `Initials, Meter, Switch, NativeSelect, SearchInput, Sparkline, MetricTile, EmptyState, Tag, ChannelChip, Skeleton, LoadError`); `components/ws/analytics/charts.tsx` holds the SVG charts; icons are `lucide-react` only. `lib/ws/` holds `utils.ts`, `channels.ts`, `format.ts`, `use-async.ts`, `plan.ts` and `messages.ts`.
- **The workflow builder** is covered under "Workflows and the builder" below. `lib/app/workflow.ts` is still the model (import-free and erasable, `tests/workflow*.test.mjs`), but the builder is now an **ordered list, not a canvas**: `components/ws/builder/builder-view.tsx` over the graph ⇄ list seam in `lib/ws/plan.ts`. The node-graph canvas, palette and inspector are deleted; **@xyflow/react was never a dependency**. `stepStats()` derives the figures from the audience size; they are estimates, not results.
**Audience uploads and segments (`lib/audiences/`, `/api/audiences/*`)**
- One uploaded file is one **segment**. The flow is three steps in `components/ws/audiences/upload-audiences.tsx` (File → Match columns → Review & save), opened from the Audiences screen's header and its drop zone. Adding or editing one lead by hand is `components/ws/audiences/lead-form.tsx` (name, email, phone, LinkedIn + the consent attestation, and nothing else); `lead-drawer.tsx` is the read-only profile. Max 4 MB (`lib/audiences/limits.ts`): Vercel rejects larger bodies before our code runs.
- Files are parsed **on the server only** (`.csv` with our own reader, `.xlsx` through `exceljs`; the browser imports `limits.ts` only). The browser sees headers, the first five rows and a suggested mapping. The parsed file is parked in the `uploads` table (not process memory — serverless instances do not share it) and swept after an hour.
- Every repository call takes `Ctx` first. The audiences routes build theirs from the session cookie via `requestCtx()` in `lib/audiences/ctx.ts` — never from the request body, which would be a tenancy bypass.
- **Validation is content-based, never header-based** (`lib/audiences/validation.ts`, import-free): email needs an `@` with something either side, LinkedIn needs a web URL, and numbers go through `lib/audiences/phone.ts` (libphonenumber-js `/max`, exact digit counts). `lib/audiences/analyse.ts` is the one server pass the summary step and the save step share.
- **Saving a segment writes real audiences.** New people become ordinary `audiences` rows (source `csv`, stage `new`; name/company/title come from the file's columns via `lib/audiences/profile.ts`, else from the email/LinkedIn), matches are merged into existing audiences (`lib/audiences/merge.ts`: email, then mobile, WhatsApp, LinkedIn; the existing audience keeps what it has and gains what it lacked), and everyone is linked in `segment_audiences`. Consent: the modal asks the user to attest the people may be contacted; it applies to audiences the upload *creates* and never changes an existing audience's consent.
- **Cross-strategy dedupe.** An audience is in at most one strategy (`audiences.strategy_id`). Rows matching an audience who has a strategy on ANY of email/mobile/WhatsApp/LinkedIn (`findInJourney`) are excluded from the new segment: the summary step warns with the count and the strategies, and the save step recomputes it server-side. Enrollment (setting `strategy_id` from a workflow's audience) is not built — it belongs to Launch.
- In the builder, the first step picks an audience: "Audiences in this strategy", "All audiences" (both counted live), or a saved segment (`AudienceList` carries `reach` and `columns` per attribute; `stepStats()` counts reachable audiences and a channel step is capped by the column it reads).
- Tests: `audiencesValidation`, `audiencesMerge`, `audiencesJourney`, `audiencesProfile`, `workflowSegment`.

- **The storage seam is `lib/data/repository.ts`.** Pages and route handlers only ever talk to that interface, obtained from `getRepository()` in `lib/data/index.ts`. It returns `PgRepository` (`lib/data/pg.ts`, Drizzle over Postgres) when `DATABASE_URL` is set and `MemoryRepository` (`lib/data/memory.ts`, over the demo seed in `lib/data/seed.ts`) otherwise. Every method takes `Ctx` (`workspaceId` + `userId`) first, built from the session in `lib/http.ts` and never from a request body; implementations must filter on `workspace_id` for reads *and* by-id writes. Every screen is wired to it; see `CONTEXT.md`.
- `lib/data/query.ts` holds the pure filter/sort/paginate helpers both implementations share; it is import-free and covered by `tests/dataQuery.test.mjs`.
- REST endpoints live under `app/api/*`: `me`, `workspace`, `overview`, `badges`, `tasks`, `tasks/[id]/complete`, `strategies`, `strategies/[id]`, `strategies/[id]/workflow`, `workflows`, `accounts`, `accounts/[id]`, `accounts/[id]/strategies`, `audiences`, `audiences/[id]`, `audiences/uploads…`, `audiences/segments`, `threads`, `threads/[id]`, `threads/[id]/messages`, `analytics`. They share `lib/http.ts` (`withUser`, `json`, `fail`, param parsers) so auth, caching and error shapes are identical: 401 unauthenticated, 404 missing, 422 invalid, `{ error: { code, message } }`.
- Server components read the repository directly; client components call the typed browser client in `lib/api.ts`. Don't `fetch("/api/...")` by hand.
- Writes in the memory store (no `DATABASE_URL`) last until the server restarts.

**Workflows and the builder**
- A multichannel strategy *is* a workflow: the route id is the strategy id, and the graph is stored in the `workflows` table (one row per strategy) through `Repository.getWorkflow/saveWorkflow`. `lib/app/workflow.ts` owns the graph model, the demo `WORKFLOWS` seed (used by the memory repository) and the storage helpers: `validateWorkflowGraph()` rebuilds every incoming graph from a whitelist (unknown keys, bad sockets, a second Audience and cycles are refused — the canvas recurses and would hang on a cycle).
- **The builder is a list.** `lib/ws/plan.ts` reads the stored graph into an ordered `Plan` (each touch's channel, template and day gap) and writes it back, preserving node data and re-running `layout()`. A plan that branches (`cond`, `split` or any fork) is marked `linear: false` and rendered **read-only with a banner** — it is never silently flattened. One Pace control (gentle / standard / persistent) rewrites every gap. The stored shape, and `validateWorkflowGraph()`, are unchanged.
- **The builder has one route: `/dashboard/workflows/[id]`.** It autosaves (debounced, flushed on leave) and shows a truthful save state. `/new`, numeric ids and `/dashboard/workflows` itself all redirect to Strategies; `/dashboard/strategies/[id]` is a permanent redirect to the builder — do not render a second copy of the builder there.
- **There is no separate workflow library.** A multichannel strategy *is* its workflow, so Strategies is the list, and its "New strategy" button goes to `/dashboard/strategies/new` (`components/ws/strategies/new-strategy-view.tsx`), which creates a draft strategy and its workflow and opens the builder (never create rows on a GET: link prefetch would run it). Creating asks the shape and nothing else.
- **The palette offers only steps that can run.** `PALETTE` holds LinkedIn invite, LinkedIn message, Email and Call task. `STEPS` still describes WhatsApp and SMS so stored graphs render, and `CHECKS` still holds `read`, but `PALETTE` and `OFFERED_CHECKS` are what a user may add. No template builds one either. Adding a step to `STEPS` does not put it on offer; that is deliberate.
- **Canvas figures are projections.** `stepStats()` multiplies the audience size by fixed typical rates; rates render with a `~` and the canvas carries a permanent "estimates, not your results" line. Do not present them as measurements.
- **Nothing sends.** `lib/capabilities.ts` `SENDING_ENABLED = false` refuses to switch a strategy "live" anywhere. The builder shows "Nothing sends yet" where Launch would be rather than a disabled button, and the Strategies table offers Pause rather than a switch that can only fail one way. Do not mark invented or unsent work as live; flip the flag only in the commit that lands a sender.

**Connecting LinkedIn (`lib/channels/` + `/api/integrations|webhooks/*`)**
- Driving LinkedIn is **rented, not built**: every call goes through `LinkedInChannelAdapter`
  (`lib/channels/adapter.ts`), with Unipile as the one implementation (`unipile.ts`, server-only —
  `UNIPILE_DSN` + `UNIPILE_API_KEY`). `getLinkedInAdapter()` returns `null` until both are set, and
  the screens then say connecting is not configured instead of offering a button that 503s.
- **Hosted auth only.** Custom auth would put the member's LinkedIn password and 2FA in our
  servers; the hosted wizard keeps them at the provider. Add custom auth as another adapter method
  if it is ever wanted — not by widening the routes.
- **`connect_sessions` is what makes a webhook tenant-safe.** Its id goes to the provider as `name`
  and comes back on `notify_url`; it is the only thing tying a provider account to a workspace, so
  it is `randomBytes` (not `newId`'s `Math.random`), short-lived, and **never the workspace id**.
- `lib/channels/inbound.ts` is the **one place that writes workspace rows without a `Ctx`** — a
  webhook has no session. The workspace is derived from `channel_accounts.provider_account_id`,
  unique across the whole table, so the caller cannot steer the lookup. It never takes a workspace,
  audience or account id from a body. Read its header comment before changing it.
- The notify callback carries no secret (Unipile's `notify_url` takes no headers), so it proves
  nothing by itself: the reference must be an unexpired pending session, and the account identity is
  read back from the provider with our key. The account-status and messages webhooks **are**
  authenticated, by `UNIPILE_WEBHOOK_SECRET` sent back on every delivery (Unipile does not sign
  bodies). Two carriers are accepted — a header (`npm run unipile:webhooks` registers it via the
  API) or a `?token=` query param on the callback URL, because Unipile's dashboard UI has no header
  field for an "Account" webhook, so one made there has nowhere else to carry it. The matching logic
  is the import-free, pure half in `lib/channels/webhookConfig.ts`
  (`tests/webhookConfig.test.mjs`); `webhookAuth.ts` is just the untested `Request`/env glue around
  it. Unset secret ⇒ every delivery refused, whichever carrier it arrives on.
- **Unipile's v1 and v2 docs disagree on webhook field names**, so `lib/channels/events.ts` reads
  every documented spelling and refuses a payload missing what it needs. An unrecognised status is
  `error`, never `ok`. `event: "account.status"` is an event name, not a status — do not read it as
  one. `tests/unipileEvents.test.mjs` pins each shape; add a case rather than loosening a reader.
- Inbound messages reach the Inbox **only** when the sender is already an audience (matched on their
  LinkedIn handle). A stranger's message is an `events` row and nothing more: never invent an audience
  from a webhook. Deliveries are idempotent on the provider's message id — Unipile retries five
  times without a 200 in 30 s.
- LinkedIn account state is now four values (`healthy`, `signed_out`, `restricted`, `connecting`).
  **A restriction is a product state, not a bug report** — use `linkedInNeedsAction()` /
  `linkedInStateNote()` in `lib/data/setup.ts` rather than comparing to `signed_out`.
- `SENDING_ENABLED` stays **false**. Connecting an account is not sending, and the UI says so.

**Setup (`/dashboard/configuration`) — one screen, three tabs**
- Overview · Config · Messages (`SetupTabs` in `components/ws/shell/page.tsx`). It was six tabs, and before that three rail destinations: LinkedIn and Email were two copies of one account register (now Overview), Connections and Rules both answered "what is connected and how does sending behave" (now Config), Workspace held four read-only facts (now a card on Config), and message copy had no home at all (now Messages). `/dashboard/settings` and `/dashboard/integrations` are permanent redirects here, and `lib/channels/connect.ts` builds its hosted-sign-in return URLs from `SETUP_HREF`.
- **Overview** is the register of connected accounts: each account's dials behind its Settings, "Sign in again" for a LinkedIn connection that needs repair, disconnect, and `ConnectResult` — which reads the `?connected=`/`?failed=` reference the hosted sign-in returns, **polls the connect session for the real outcome** rather than trusting the query string, and clears the parameter so a refresh cannot replay a stale result.
- **Config** is the provider catalogue (`providerView()`) plus the stored rules (`components/ws/setup/setup-rules.tsx`): sending window, limits, stop rules, skip rules, variable fallbacks, compliance — all persisted through `/api/settings` → `workspace_settings` — and the Workspace card (name, plan, seats, id). The screen says the rules are saved and that nothing enforces them yet, because nothing sends. **Every rule's label and hint still comes from the catalogue in `lib/app/configuration.ts`**; the component owns no copy about a rule's meaning.
- **Messages** lists the real copy in every stored workflow, read by `lib/ws/messages.ts` (`li_invite → note`, `call → notes`, else `body`). Nothing is invented: a strategy with no copy written says so. Editing a template there is not built, and the builder never edits copy.
- **The setup score only counts what the user can change.** "No mailbox connected" is `tone: "info"`, not a blocker — connecting a mailbox is not built, so scoring it left every workspace permanently short of full marks with no action available. Never add a blocking check the user cannot clear.
- A tab whose content would be "nothing to configure yet" does not get a tab: WhatsApp, Calls and SMS are a Planned row on Config and a Planned tile on Overview.

**The provider catalogue (Setup → Config)**
- `lib/app/integrations.ts` is the static provider catalogue. A provider's *state* is derived from the workspace's own accounts and domains by `providerView()`; the tab is a channel strip plus one card per category with a collapsible body; account and domain detail lives on Overview.
- **LinkedIn and email are the only providers that can connect.** LinkedIn now genuinely connects (see "Connecting LinkedIn" above) wherever a provider is configured — `providerView()` takes that as an argument, so a deployment without a key shows "Not configured" rather than a dead button. Connecting a mailbox is still not built. WhatsApp Business, Twilio, calendar, the CRMs and webhooks are `planned`, which shows a Planned pill and says so in the drawer. That is the content rule below, not a styling choice: never offer a connection the product cannot honour.
- Reached as the Config tab of Setup; `SETUP_HREF` in `lib/nav.ts` is Overview.

**Wallpaper is load-bearing on the marketing pages.** Glass only reads as glass when there is colour behind it to bend (`body::before`); flatten it and every panel looks like a plain white card, so check `--g-tint` and the blur before touching it. The dashboard has no wallpaper and no glass on purpose.

Pip is a marketing guide and is hidden on `/dashboard` (see `components/pip/Pip.tsx`).

## Content rules

These come from the original product brief:
- No invented testimonials, customer logos, metrics or integrations, and no certification claims.
- Dashboard and product figures must stay labelled as illustrative or demo data.
- Integrations beyond LinkedIn and email are shown as "Planned".
- No fake booking or calendar availability. The founder-call calendar is allowed only as a clearly labelled preferred-time request (see above).
