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
| `/dashboard`      | Workspace home: metrics, to-do list, live campaigns, sending caps        |
| `/dashboard/inbox` | Unified inbox across channels, with a reply composer                   |
| `/dashboard/leads` | Lead table with search, facets and sorting                             |
| `/dashboard/campaigns` | Campaign list with live/paused toggles                             |
| `/dashboard/workflows` | Workflow library, and the builder at `/workflows/[id]`             |
| `/dashboard/integrations` | Connect LinkedIn, email domains and mailboxes; roadmap providers |
| `/dashboard/analytics` | Trend, channel breakdown and funnel                                |
| `/dashboard/settings`  | Account, workspace, channel caps and team                          |
| `/api/demo-request` | Validates and forwards demo requests to a webhook                     |
| `/api/login`, `/api/logout` | Prototype session cookie endpoints                            |
| `/api/*`          | Workspace data: see "Data and API" below                                 |

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

## Data and API

The app has no database yet, but it is wired as though it does.

Every page and route handler talks to **one interface**, `Repository` in `lib/data/repository.ts`,
obtained from `getRepository()` in `lib/data/index.ts`. Today that returns `MemoryRepository`,
backed by the demo seed in `lib/data/seed.ts`.

**Adding a database** means writing one class and changing one line:

```ts
// lib/data/index.ts
export function getRepository(): Repository {
  if (!instance) {
    instance = process.env.DATABASE_URL ? new PrismaRepository() : new MemoryRepository();
  }
  return instance;
}
```

No page, component or endpoint changes, because none of them import a concrete store. The shared
filter/sort/paginate rules in `lib/data/query.ts` are pure and unit-tested, so both
implementations behave the same.

### Endpoints

All require a session cookie and answer `401` without one. Errors are always
`{ error: { code, message } }` — `404` for a missing row, `422` for invalid input.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/me` | Signed-in user and workspace |
| GET | `/api/workspace` | Org, plan, seats, members, channel caps |
| GET | `/api/overview?range=7d\|30d\|90d` | Everything the home screen shows |
| GET | `/api/tasks?kind=all\|reply\|call\|review` | Open to-dos |
| POST | `/api/tasks/:id/complete` | Mark a to-do handled |
| GET | `/api/campaigns?q=&status=&type=&channel=` | Campaign list with totals |
| GET / PATCH | `/api/campaigns/:id` | Read one; `{ status }` pauses or resumes |
| GET | `/api/leads?q=&stage=&ownerId=&campaignId=&sort=&dir=&page=&pageSize=` | Paged leads |
| GET | `/api/leads/:id` | One lead |
| GET | `/api/threads?filter=to-reply\|all&q=` | Inbox list |
| GET | `/api/threads/:id` | Thread with messages |
| POST | `/api/threads/:id/messages` | `{ channel, body }` sends a reply |
| GET | `/api/analytics?range=&channels=linkedin,email` | Metrics, trend, channels, funnel |

Server components read the repository directly; client components use the typed client in
`lib/api.ts`.

## Project structure

```
app/                  Routes, layout, global styles (design tokens in globals.css)
  api/                Route handlers: demo-request, login, logout
components/           Landing sections, navbar/footer, demo/ and auth/ forms
  app/                Workspace shell, screens and glass UI primitives
lib/
  data/               Domain types, Repository interface, in-memory store, seed, query helpers
  api.ts              Typed browser client for /api
  http.ts             Shared route-handler helpers (auth, JSON, errors, param parsing)
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
