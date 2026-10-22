# Flowdeck — Project Memory & Architecture Guide

## Overview
Flowdeck is a calendar-first task manager designed to unify development work, personal tasks, projects, and social content scheduling on a single timeline with lightweight team collaboration.

Core workflow answers three questions on sight:
1. **What am I supposed to do?** — Dashboard daily briefing, Today view, and Inbox for unscheduled items.
2. **When am I supposed to do it?** — Day, Week, 15-day (agenda), and Month interactive calendar views.
3. **What is my team working on?** — Real-time presence indicators, active task markers, activity feeds, and shared projects.

---

## Tech Stack & Tooling
- **Framework**: Next.js 15 (App Router, Server Components + Route Handlers)
- **UI & Styling**: React 19, Tailwind CSS v4 (`@tailwindcss/postcss`), Radix UI primitives, Lucide React icons, Sonner (toast notifications), Recharts (analytics)
- **Database & ODM**: MongoDB with Mongoose 9. Runtime uses `autoIndex: false` for rapid cold starts. Indexes are managed via `npm run indexes` (`scripts/indexes.ts`).
- **Authentication**: Email/password with `bcryptjs` (cost 12). Sessions are HS256 JWTs (`jose`) stored in `httpOnly`, `sameSite=lax`, `secure` cookies (`flowdeck_session`, 30-day expiry).
- **Session Revocation**: `sessionEpoch` in `User` model is embedded in JWTs and revalidated on each request (`getCurrentUser`). Password change/reset increments epoch, instantly invalidating all issued cookies.
- **Validation**: Zod 4 for all request bodies and query parameters (`src/lib/validation.ts`).
- **Timezone & Recurrence**: `date-fns` and `date-fns-tz`. Wall-clock timezone arithmetic in `src/lib/tz.ts`. On-the-fly recurrence expansion via `expandOccurrences()` in `src/lib/recurrence.ts`.
- **PWA & Offline**: Web manifest (`manifest.webmanifest`), service worker (`public/sw.js`), network-first with cache fallback, Web Push notifications with VAPID keys.

---

## Architecture & Layering Rules

```
src/
├── app/
│   ├── (app)/               # Authenticated pages (calendar, dashboard, tasks, projects, etc.)
│   ├── api/                 # HTTP Route handlers
│   ├── login|register|...   # Public authentication pages
│   └── layout.tsx           # Root layout: ThemeProvider, Toaster, SW register
├── components/
│   ├── ui/                  # Radix + Tailwind primitive components
│   ├── layout/              # Shell, sidebar, topbar, command palette, PWA prompts
│   ├── calendar/            # Time grid, month grid, agenda list, drag/resize mechanics
│   ├── tasks/               # Quick-add modal, task detail panel, task lists, inbox
│   ├── dashboard/           # Daily briefing, schedule timeline, stats
│   ├── projects/            # Project cards, milestones, roadmap timeline
│   ├── content/             # Pipeline Kanban board for social media content
│   ├── team/                # Members, roles, presence list
│   └── analytics/           # Charts, productivity metrics, weekly review
├── lib/
│   ├── api.ts               # ok(), fail(), handleError(), parseBody(), parseQuery()
│   ├── auth.ts              # Password hashing, JWT issue/verify, requireUser(), getCurrentUser()
│   ├── db.ts                # Cached Mongoose connection
│   ├── recurrence.ts        # Recurrence rule expansion and description
│   ├── tz.ts                # Timezone-safe wall-clock calculations
│   ├── validation.ts        # Central Zod validation schemas
│   ├── rate-limit.ts        # In-memory sliding window rate limiter
│   └── client/
│       ├── api.ts           # Client-side fetch wrapper
│       ├── datetime.ts      # Client datetime input helpers
│       └── store.tsx        # AppContext (workspaces, projects, tags, members, useTasks hook)
├── models/                  # Mongoose models and interfaces
│   ├── User.ts              # User identity, presence, notification prefs, sessionEpoch
│   ├── Workspace.ts         # Workspace, WorkspaceMember, Invite
│   ├── Project.ts           # Project metadata, milestones
│   ├── Task.ts              # Task, TaskOccurrence (recurrence overrides)
│   ├── Social.ts            # Comment, Activity, Notification, PushSubscription, Attachment
│   └── Tag.ts               # Workspace labels and colors
├── server/                  # Business logic, authorization, queries, mutations
│   ├── authz.ts             # Workspace roles, task visibility checks
│   ├── tasks.ts             # Calendar item projection, recurrence merging
│   ├── projects.ts          # Project stats, milestone updates
│   ├── notifications.ts     # In-app and push notification delivery, deduplication
│   ├── reminders.ts         # User reminder sweep (starting, due, overdue)
│   ├── users.ts             # User search and presence
│   └── activity.ts          # Audit logging with edit-coalescing
└── middleware.ts            # Edge route gate (cookie signature check only)
```

### Strict Development Rules:
1. **Never query database from UI components**: Pages and route handlers must delegate data fetching and mutations to `src/server/*` services.
2. **Edge Middleware is a Gate, Not an Authority**: `src/middleware.ts` only verifies JWT signature. All permissions, membership checks, and resource access must be verified server-side via `src/server/authz.ts`.
3. **Route Handlers Pattern**:
   - Always wrap route handler body in `try / catch` with `handleError(error)`.
   - Validate bodies using `await parseBody(req, schema)` and query params using `parseQuery(req, schema)`.
   - Return responses wrapped in `ok(data, status)` or `fail(message, code, status)`.
4. **Authorization Enforcements**:
   - Call `await requireUser()` to ensure authenticated context.
   - Guard workspaces with `await requireMembership(user, workspaceId, minRole)`.
   - Roles rank: `VIEWER (0) < MEMBER (1) < ADMIN (2) < OWNER (3)`. Writes require `MEMBER`+.
   - Always apply `taskVisibilityFilter(user, workspaceIds)` or check `canReadTask(user, task)` to prevent leaking `PRIVATE` tasks.

---

## Data Models & Key Domain Logic

### 1. Recurrence Architecture
- Recurring tasks are stored as **a single `Task` document** with a `recurrence` rule (`freq`, `interval`, `byWeekday`, `byMonthDay`, `byMonth`, `until`, `count`).
- Occurrences are **not pre-generated** in the DB; they are calculated on-demand for requested date windows using `expandOccurrences()`.
- Exceptions/overrides are stored in `TaskOccurrence` (only created when an occurrence diverges: completed, rescheduled, retitled, or skipped).
- Editing recurring tasks supports 3 scopes:
  - `OCCURRENCE`: Updates/creates a `TaskOccurrence` exception.
  - `FUTURE`: Sets `until` on current task series and creates a new series from the target date onwards.
  - `SERIES`: Updates the master `Task` document directly.

### 2. Timezone Stability
- Instants are stored in UTC.
- Master tasks carry `scheduleTimezone`.
- Time-of-day stepping is calculated on wall-clock time in `scheduleTimezone` (using `src/lib/tz.ts`) so tasks do not shift across Daylight Saving Time transitions.
- Monthly recurrence on the 31st skips shorter months instead of clamping to the 28th/30th.

### 3. Client State & Optimistic Updates
- `AppProvider` in `src/lib/client/store.tsx` provides global workspace context (`workspaceId`, `workspaces`, `projects`, `tags`, `members`, `unreadCount`).
- `useTasks()` hook handles fetching calendar items and provides optimistic updates (`mutateItem`, `removeItem`) that automatically revert on server error with a toast.
- `taskVersion` is incremented when tasks change outside the current view to signal automatic refetching.

---

## Common Commands
```bash
npm run dev         # Start Next.js development server (http://localhost:3000)
npm run build       # Build production bundle
npm start           # Run production build
npm run typecheck   # Run TypeScript compiler check (tsc --noEmit)
npm run lint        # Run ESLint check
npm run test        # Run unit tests via tsx (recurrence, validation, diffs, filters)
npm run indexes     # Sync MongoDB indexes (run after model schema modifications)
```

---

## Environment Variables
Defined in `.env.local` (template: `.env.example`):
- `MONGODB_URI`: MongoDB connection string (e.g. `mongodb://localhost:27017/flowdeck`)
- `AUTH_SECRET`: Random 48+ char secret for JWT session signing (`openssl rand -base64 48`)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: Web Push public key
- `VAPID_PRIVATE_KEY`: Web Push private key
- `VAPID_SUBJECT`: `mailto:admin@example.com`
