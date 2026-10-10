# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Flightpath: a marketing site for a GTM workflow-orchestration SaaS aimed at SMB sales teams. It has two routes: the landing page (`/`) and a demo-request page (`/book-demo`). Stack: Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS v4 (via `@tailwindcss/postcss`, no `tailwind.config`), ESLint 9 flat config. The only runtime dependency beyond Next and React is `lucide-react`.

`gtm_mock.html` in the root is a standalone design reference/mock. It is not part of the app.

## Commands

```bash
npm run dev          # dev server (http://localhost:3000)
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm test             # node --test tests/demoRequest.test.mjs
node --test --test-name-pattern="validates email" tests/demoRequest.test.mjs   # single test
```

- **Tests** use Node's built-in runner, not Jest or Vitest. `.mjs` test files import `.ts` sources directly via Node's native type stripping (Node ≥ 22.18). So any module under test must:
  - have no extensionless relative imports and no `@/` alias imports;
  - use only erasable TS syntax (no enums or namespaces).
- **Never run `npm run build` while `next dev` is running.** Both write to `.next/`, and doing so has corrupted the cache: dev returns 500 with "Could not find the module … segment-explorer-node.js#SegmentViewNode in the React Client Manifest". The project also lives in a OneDrive folder. To build or recover: stop dev, delete `.next`, then build or restart.
- Keep TypeScript on 5.x. TS 6 broke the `import "./globals.css"` side-effect import.

## Architecture

**Styling system (`app/globals.css`)**
- Design tokens are CSS variables on `:root` (`--bg`, `--surface`, `--ink`, `--muted`, `--line`, `--accent` #4F46E5, `--success` #0F6E4E, `--alert`, …). They are mapped to Tailwind utilities through `@theme inline`, giving `bg-surface`, `text-accent`, `border-line` and so on. Add new colours in both places.
- Fonts come from `next/font` in `app/layout.tsx` and are exposed as `font-serif` (Instrument Serif, headlines), `font-sans` (Inter, body) and `font-mono` (JetBrains Mono, labels/eyebrows).
- **Shared component classes** (`.card`, `.btn`, `.btn-primary`, `.btn-secondary`, `.container-page`, `.eyebrow`, `.field`) must stay inside `@layer components`. Unlayered CSS beats Tailwind utilities, so layered classes can still be overridden by utilities, e.g. `hidden` on a `.btn`.
- **Exception:** a rule that must beat the global unlayered `:focus-visible` outline must itself be unlayered (see `.field:focus-visible`).

**Animation conventions**
- An inline script in `layout.tsx` adds `.js` to `<html>`. Every entrance or reveal style is gated on `.js …`, so content stays visible without JS.
- Page-load intros are pure CSS keyframes (`.intro`, `.intro-word`, `.intro-card`, …), staggered with the `--d` custom property (`style={{"--d": "300ms"}}`). They run before hydration, so `Hero` remains a server component.
- Scroll reveals use `components/Reveal.tsx` / `lib/useInView.ts`, an IntersectionObserver that toggles `.is-visible` (delay via `--reveal-delay`).
- Heavy sections avoid React re-renders per frame: `StatusQuoStory`, `Orchestration` and `OutcomeDashboard` drive animation through rAF loops or beat timers that write to refs/DOM, gated by IntersectionObserver.
- Animate `transform`/`opacity` only. The `prefers-reduced-motion` block at the end of `globals.css` zeroes durations and delays and hides decorative loops. New looping decorations need adding there.
- Known Chromium pitfall: SVG `pathLength` + `stroke-dasharray` combined with `vector-effect: non-scaling-stroke` draws only part of the path. Drop `vectorEffect`, or use a `clip-path` wipe instead.
- Grid columns that hold wide content need `minmax(0,1fr)` (e.g. `grid-cols-1`) to avoid mobile horizontal overflow.

**Navigation**
- `lib/site.ts` holds `DEMO_HREF` (`/book-demo`) and `NAV_LINKS`. Nav hrefs are root-relative hashes (`/#product`, `/#how-it-works`, `/#why`) so they work from any route. Use `next/link` for them.
- Section ids on the landing page are what those links target. `#top` exists on both pages because the footer's "Back to top" links to it.

**Demo-request flow (`/book-demo`)**
- `lib/demoRequest.ts` is the single shared contract: option lists, the `DemoRequest` type, `validateDemoRequest()` and the `DemoSubmitResponse` union. It is deliberately import-free so it runs in the browser, in the route handler, and under `node --test`.
- `components/demo/DemoForm.tsx` (client) validates with that same function. `submitDemoRequest()` in that file is the only network call.
- `app/api/demo-request/route.ts` re-validates, then forwards to `process.env.DEMO_REQUEST_WEBHOOK_URL`, with an optional `DEMO_REQUEST_WEBHOOK_SECRET` sent as a Bearer token. Both are server-only; see `.env.example`.
  - Webhook not set: returns 503 `not_configured`.
  - Invalid input: 422 with field errors.
  - Webhook failure: 502.
- The success UI must only appear on a genuine `{ ok: true }`.
- `app/book-demo/page.tsx` is `force-dynamic` so its "delivery not connected" setup note reflects the runtime env.

## Content rules

These come from the original product brief:
- No invented testimonials, customer logos, metrics or integrations, and no certification claims.
- Dashboard and product figures must stay labelled as illustrative or demo data.
- Integrations beyond LinkedIn and email are shown as "Planned".
- No fake booking or calendar availability.
