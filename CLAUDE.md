# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- **Trial, on `dev` only: the hero photograph.** `.hero-sky` carries `public/hero-forest.jpg` (`-sm` for phones), a park lake at dusk, supplied by the user and only resized and shadow-lifted for the web. Because it is dark, `.hero` flips the theme tokens to a light-on-dark scope (`--ink`, `--muted`, `--g-tint` and the rest), so every utility and every glass surface under it turns with one block; the navbar does the same through `.lg-nav.is-dark`, which `Navbar` toggles while `[data-nav-dark]` is still under the capsule. The hero is pulled up by `--nav-h` so the picture runs under the floating navbar — without that the header takes its own strip of page wallpaper above the photo — and `.hero-sky` is masked at the bottom so the pinned frame dissolves into the page instead of cutting. The rest of the page keeps the colour wash.
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

**Workspace data (`lib/app/`)**
- The dashboard renders from `lib/app/`, a faithful port of the reference's demo content: `channels.ts`, `leads.ts` (rows plus derived score, tags, masked phone), `inbox.ts` (to-do queue and threads), `campaigns.ts`, `workspace.ts`.
- `metrics.ts` is the one source of numbers. A seeded PRNG walks 180 days and produces, per campaign and channel, a `[reached, engaged, replied, positive, meetings]` funnel; `totals()`, `buckets()` and `campaignMetrics()` read off it. It is deterministic, so the dashboard, the campaign table and analytics always agree — and it reproduces the reference's figures exactly.
- `lib/data/` and the `/api/*` endpoints remain the storage seam described below; the dashboard layout reads the signed-in user through it.

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

**Auth (prototype)**
- `lib/auth.ts` (server-only) holds one hardcoded account and signs an `httpOnly` session cookie with HMAC. `/api/login` and `/api/logout` set and clear it; `/dashboard` is a placeholder that redirects to `/login` without a valid session.
- `/signup` is a dummy form: it validates, creates nothing, and says so. Do not make it show a fake success.
- `LOGIN_HREF`, `SIGNUP_HREF`, `DASHBOARD_HREF` live in `lib/site.ts`. Never import `lib/auth.ts` from a client component.

**Signed-in app (`/dashboard`)**
- Routes: `/dashboard` (Home), `/dashboard/inbox`, `/leads`, `/campaigns`, `/campaigns/[id]` (the builder), `/analytics`, `/settings`. `app/dashboard/layout.tsx` guards the session and renders `components/app/AppShell.tsx` (glass rail, top bar, mobile tab bar). It is `force-dynamic` so signing out takes effect immediately.
- Screens live in `components/app/` and render from `lib/app/` (see **Workspace data**). `ui.tsx` holds the shared controls (`Segmented`, `Switch`, `Avatar`, `Delta`, `Meter`), `charts.tsx` the SVG sparkline, area and bar charts, `icons.tsx` the 24px icon set.
- **The campaign builder** (`/dashboard/campaigns/[id]`, `components/app/builder/`) is the workflow canvas from the design reference. A multichannel campaign row opens it; `/dashboard/campaigns/new` is a blank one, which is where "Create campaign" and "New campaign" lead. Standalone campaigns have no workflow, so their rows do not link and their ids 404.
  - `lib/app/workflow.ts` is the model and is **import-free and erasable**, so `tests/workflow.test.mjs` can load it directly: the step catalogue (`STEPS`, which carries each kind's group, chip icon and outgoing ports), the per-kind `defaults()` and `stepLabel()`, the `fromSpec()` seed parser, the `layout()` tidy pass, `stepStats()`, `issues()` and `edgePath()`. The five seeded workflows are those of the five `type: "multi"` campaigns in `campaigns.ts`, and they reproduce the reference's graphs, positions and figures exactly — the tests pin those numbers, so treat a change to them as a regression.
  - `stepStats()` is the one source of the canvas figures: it walks the audience list size down the tree, splitting at each condition by that check's pass rate, and is skipped entirely for a draft. Nothing is stored per node.
  - `components/app/builder/`: `WorkflowBuilder.tsx` owns the state (nodes, edges, undo/redo, toasts, the step menu), `Canvas.tsx` is the pannable, zoomable surface, `StepCard.tsx` the node card and `Inspector.tsx` the right-hand panel plus the workflow settings. **@xyflow/react is deliberately not a dependency** — the canvas is ours. It keeps the reference's `.react-flow__*` class names because `app.css` already styles the nodes, edges, controls and minimap through them, so the last block of `app.css` adds back the handful of positioning rules that package's own stylesheet used to supply. Nothing in the builder reaches for a DOM library.
  - Edits live in the component for the length of the visit; there is no workflow store behind it yet. The settings panel says so, next to the note that the figures are illustrative.
- **The storage seam is `lib/data/repository.ts`.** Pages and route handlers only ever talk to that interface, obtained from `getRepository()` in `lib/data/index.ts`. Today it returns `MemoryRepository` (`lib/data/memory.ts`) over the demo seed in `lib/data/seed.ts`. To add a database, implement `Repository` against your client and return it from the factory — nothing else changes.
- `lib/data/query.ts` holds the pure filter/sort/paginate helpers both implementations share; it is import-free and covered by `tests/dataQuery.test.mjs`.
- REST endpoints live under `app/api/*`: `me`, `workspace`, `overview`, `tasks`, `tasks/[id]/complete`, `campaigns`, `campaigns/[id]`, `leads`, `leads/[id]`, `threads`, `threads/[id]`, `threads/[id]/messages`, `analytics`. They share `lib/http.ts` (`withUser`, `json`, `fail`, param parsers) so auth, caching and error shapes are identical: 401 unauthenticated, 404 missing, 422 invalid, `{ error: { code, message } }`.
- Server components read the repository directly; client components call the typed browser client in `lib/api.ts`. Don't `fetch("/api/...")` by hand.
- Writes in the memory store last until the server restarts. That is deliberate for the prototype.

**Workflows and the builder**
- A multichannel campaign *is* a workflow: campaign ids and workflow ids are the same number. `lib/app/workflow.ts` owns the graph model and the `WORKFLOWS` seed; `lib/app/workflowLibrary.ts` derives the handful of numbers the library cards show (it reuses `hasRun` from `lib/app/campaigns.ts`, so a never-published workflow reads "—" on both screens).
- **The builder has one route: `/dashboard/workflows/[id]`**, with `/new?template=<key>` for a fresh one. `/dashboard/campaigns/[id]` is a permanent redirect to it, kept only so older links work — do not render a second copy of the builder there.
- `/dashboard/workflows` is the library: `.wfgrid` cards, a dashed "new" card and a `.tplgrid` template picker, all classes the reference CSS already defines.

**Integrations (`/dashboard/integrations`)**
- `lib/app/integrations.ts` is the catalogue: providers, their state, LinkedIn seats, and sending domains with their DNS records and mailboxes.
- **LinkedIn and email are the only providers that connect.** WhatsApp Business, Twilio, calendar and the CRMs are `state: "planned"`, which greys the dot, disables the drawer's primary button and says so in a warn box. That is the content rule below, not a styling choice: never offer a connection the product cannot honour.
- Reached from the rail (below the main nav, next to Settings) via `INTEGRATIONS_HREF` in `lib/nav.ts`.

**Wallpaper is load-bearing.** Glass only reads as glass when there is colour behind it — the app wallpaper on `.app-shell`, and `body::before` on the marketing pages. Flattening either makes every panel look like a plain white card, so check `--tint` / `--g-tint` and the blur before touching them.

Pip is a marketing guide and is hidden on `/dashboard` (see `components/pip/Pip.tsx`).

## Content rules

These come from the original product brief:
- No invented testimonials, customer logos, metrics or integrations, and no certification claims.
- Dashboard and product figures must stay labelled as illustrative or demo data.
- Integrations beyond LinkedIn and email are shown as "Planned".
- No fake booking or calendar availability. The founder-call calendar is allowed only as a clearly labelled preferred-time request (see above).
