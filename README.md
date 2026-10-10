# Flightpath

Marketing site for **Flightpath**, a GTM workflow-orchestration product for SMB sales teams. It orchestrates LinkedIn, email and follow-up into engagement-aware, benchmarked outreach workflows.

**Stack:** Next.js 15 (App Router), React 19, TypeScript 5, Tailwind CSS v4, ESLint 9. The only runtime dependency beyond Next and React is `lucide-react`.

## Getting started

Requires Node.js 22.18 or later.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server                                    |
| `npm run build`     | Production build                              |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm run lint`      | ESLint                                        |
| `npm test`          | Unit tests (Node's built-in test runner)      |

> Don't run `npm run build` while `next dev` is running. Both write to `.next/` and can corrupt it. Stop dev and delete `.next` first.

## Routes

| Route             | Purpose                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| `/`               | Landing page                                                            |
| `/book-demo`      | Demo-request form                                                       |
| `/login`          | Sign in (prototype, see below)                                          |
| `/signup`         | Sign-up form (dummy, creates nothing)                                   |
| `/dashboard`      | Placeholder shown after sign-in; redirects to `/login` without a session |
| `/api/demo-request` | Validates and forwards demo requests to a webhook                     |
| `/api/login`, `/api/logout` | Prototype session cookie endpoints                            |

## Configuration

Copy `.env.example` and set values as needed. All variables are server-only.

| Variable                      | Purpose                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `DEMO_REQUEST_WEBHOOK_URL`    | Where demo requests are delivered. If unset, the API returns 503 and the form says nothing was sent. |
| `DEMO_REQUEST_WEBHOOK_SECRET` | Optional. Sent as `Authorization: Bearer <secret>` to the webhook.                            |
| `AUTH_SESSION_SECRET`         | Optional. Signs the prototype session cookie. Falls back to a dev-only value; set it anywhere that is not local. |

## Authentication status (prototype)

Real authentication is **not built yet**.

- Only one hardcoded account can sign in. Its credentials live in `lib/auth.ts` and are checked on the server only.
- A successful login sets a signed, `httpOnly` session cookie. `/dashboard` verifies it.
- `/signup` validates input but never creates an account, and tells the user so.

Replace `lib/auth.ts` and the two login/logout routes with a real provider and user store before launch.

## Project structure

```
app/                  Routes, layout, global styles (design tokens in globals.css)
  api/                Route handlers: demo-request, login, logout
components/           Landing sections, navbar/footer, demo/ and auth/ forms
lib/
  demoRequest.ts      Shared demo-form contract and validation (import-free)
  auth.ts             Prototype credentials and session cookie (server-only)
  site.ts             Nav links and route constants
tests/                Node test runner tests (demo-request validation)
gtm_mock.html         Standalone design reference, not part of the app
```

## Content rules

- No invented testimonials, customer logos, metrics, integrations or certification claims.
- Dashboard and product figures stay labelled as illustrative.
- Integrations beyond LinkedIn and email are shown as "Planned".
- No fake booking or calendar availability.

See `CLAUDE.md` for deeper architecture and conventions (styling layers, animation rules, testing constraints).
