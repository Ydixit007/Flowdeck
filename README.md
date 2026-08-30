# Flowdeck

**Plan it. Share it. Ship it.**

A calendar-first task manager: development work, personal tasks, projects and social
content on one timeline, with lightweight team collaboration. Tasks are the entity;
the calendar is how you work with them.

Flowdeck answers three questions on sight:

1. **What am I supposed to do?** — Today view, daily briefing, inbox
2. **When am I supposed to do it?** — Day / Week / 15-day / Month calendar
3. **What is my team working on?** — presence, activity feed, shared projects

---

## Quick start

```bash
# 1. Dependencies
npm install

# 2. Environment
cp .env.example .env.local
#    then set AUTH_SECRET (see below) and, if you want push, the VAPID keys

# 3. MongoDB (see "MongoDB setup" if you do not have one running)
mongod --dbpath ~/data/db          # or: brew services start mongodb-community

# 4. Build indexes (required once per database)
npm run indexes

# 5. Run
npm run dev                        # http://localhost:3000
```

Register an account at `/register` on first run; the first account creates its
own workspace.

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | yes | Connection string, e.g. `mongodb://localhost:27017/flowdeck` |
| `AUTH_SECRET` | yes | Signs session JWTs. Generate: `openssl rand -base64 48` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | for push | Public VAPID key, exposed to the browser |
| `VAPID_PRIVATE_KEY` | for push | Private VAPID key, server only |
| `VAPID_SUBJECT` | for push | `mailto:you@example.com` |

Never commit `.env.local`. It is gitignored; `.env.example` is the template.

Changing `AUTH_SECRET` invalidates every existing session.

---

## MongoDB setup

Any MongoDB 6+ works — local, Docker or Atlas.

```bash
# Local (Ubuntu/Debian)
sudo apt install mongodb-org && sudo systemctl start mongod

# Local (macOS)
brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community

# Docker
docker run -d --name flowdeck-mongo -p 27017:27017 mongo:7
```

Then point `MONGODB_URI` at it. Indexes are declared on the schemas and created
automatically on first connection.

**Transactions:** a standalone `mongod` does not support multi-document
transactions. Flowdeck detects this and falls back to sequential writes for the
one place it matters (registration creating a user + workspace + membership).
For production, use a replica set or Atlas so that write is atomic:

```bash
mongod --replSet rs0 --dbpath ~/data/db
mongosh --eval 'rs.initiate()'
# MONGODB_URI=mongodb://localhost:27017/flowdeck?replicaSet=rs0
```

---

## Push notification setup

```bash
npx web-push generate-vapid-keys
```

Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the private key in
`VAPID_PRIVATE_KEY`, and an email in `VAPID_SUBJECT`. Restart the dev server.

Permission is requested **contextually** — the opt-in appears inside the
notifications panel, not on first page load. Without VAPID keys the app runs
normally and simply falls back to in-app notifications.

---

## PWA setup

Everything is already wired:

- `public/manifest.webmanifest` — name, icons, shortcuts, theme colours
- `public/sw.js` — offline shell, cached API reads, push handling
- `src/components/layout/sw-register.tsx` — registers the worker after hydration
- Install prompt appears when the browser offers one

Service workers require **HTTPS or localhost**. In development, use
`http://localhost:3000` — not a LAN IP — or the worker will not register.

Offline behaviour: the app shell and recently fetched API responses are cached
(network-first, cache fallback), so the last data you looked at stays readable. A
banner appears when the connection drops. Writes need connectivity; task edits use
optimistic UI and roll back with a toast if the request fails.

---

## Scripts

```bash
npm run dev         # development server
npm run build       # production build
npm start           # serve the production build
npm run typecheck   # tsc --noEmit (strict)
npm run lint        # eslint
npm run test        # unit tests (recurrence + natural-language parser)
npm run indexes     # build MongoDB indexes (after a schema change, or on a new database)
```

---

## Architecture

```
src/
├─ app/
│  ├─ (app)/               Authenticated pages; layout resolves the session once
│  ├─ api/                 Route handlers — the entire HTTP surface
│  ├─ login|register|…     Public auth pages
│  └─ layout.tsx           Theme provider, toaster, service-worker registration
├─ components/
│  ├─ ui/                  Primitives (Radix + Tailwind)
│  ├─ layout/              Shell: sidebar, topbar, command palette, PWA prompts
│  ├─ calendar/            Time grid (drag/resize), month grid, agenda, range math
│  ├─ tasks/               Quick-add, detail panel, list, inbox, filters
│  ├─ projects|content|team|analytics|settings/
├─ lib/
│  ├─ auth.ts              Password hashing, session issue/verify
│  ├─ db.ts                Cached Mongoose connection
│  ├─ recurrence.ts        Rule → occurrence expansion (tested)
│  ├─ nlp.ts               Natural-language task parsing (tested)
│  ├─ tz.ts                Timezone-safe wall-clock arithmetic
│  ├─ validation.ts        Zod schemas for every request body
│  ├─ api.ts               Consistent response/error envelope
│  ├─ rate-limit.ts        Fixed-window limiter for auth endpoints
│  └─ client/              Fetch wrapper, app context, optimistic task hook
├─ models/                 Mongoose schemas
├─ server/                 Business logic: authz, tasks, notifications, reminders
└─ middleware.ts           Edge route gate (signature only)
```

**Layering rule:** UI components never query the database. Pages and route handlers
call `server/*` services; those own authorization and persistence. Business logic is
testable without React.

### Data flow for the calendar

1. The client asks for a window: `GET /api/tasks?workspaceId=…&from=…&to=…`
2. The route applies the visibility filter (server-side) and loads candidate tasks
3. `buildCalendarItems` expands recurring series for that window and merges stored
   per-occurrence overrides
4. The client renders items; a drag issues an optimistic patch that rolls back on
   failure

---

## Database models

| Model | Purpose | Key indexes |
| --- | --- | --- |
| `User` | Identity, timezone, notification preferences, presence | `username`, `email` (unique), `lastSeenAt` |
| `Workspace` | Top-level container | `slug` (unique), `ownerId` |
| `WorkspaceMember` | Membership + role (OWNER/ADMIN/MEMBER/VIEWER) | `(workspaceId, userId)` unique, `userId` |
| `Invite` | Pending email invites | `token` unique, `workspaceId` |
| `Project` | Groups tasks; holds milestones | `(workspaceId, status)`, `memberIds`, `ownerId` |
| `Task` | The central entity, including recurrence rule, subtasks, content and dev metadata | `(workspaceId, startAt)`, `(workspaceId, dueAt)`, `(workspaceId, status)`, `(workspaceId, projectId, status)`, `(assigneeId, startAt)`, text index on title/description |
| `TaskOccurrence` | **Exceptions only** for recurring tasks | `(taskId, occurrenceStart)` unique |
| `Comment` | Task discussion with `@mentions` | `(taskId, createdAt)`, text index |
| `Tag` | Workspace-scoped labels with colours | `(workspaceId, name)` unique |
| `Activity` | Audit feed | `(workspaceId, createdAt)`, `(projectId, createdAt)` |
| `Notification` | In-app inbox | `(userId, readAt, createdAt)` |
| `PushSubscription` | Web Push endpoints per device | `endpoint` unique, `userId` |
| `Attachment` | Files on tasks | `taskId` |

### Recurrence design

A recurring task is **one document**. The rule (`freq`, `interval`, `byWeekday`,
`byMonthDay`, `byMonth`, `until`, `count`) is stored on the task, and occurrences
are generated on read for the requested window.

`TaskOccurrence` rows exist only when a single date **diverges** from the series:
completed, rescheduled, retitled or skipped. A daily task running for a year is one
task document plus however many exceptions the user actually made.

Edits carry a scope:

- **`OCCURRENCE`** — writes/updates one `TaskOccurrence` override
- **`FUTURE`** — caps the current series with `until`, creates a new series carrying
  the change forward from that date
- **`SERIES`** — updates the task document itself

### Timezone handling

Every instant is stored in UTC. Every task carries the `scheduleTimezone` it was
created in, and occurrence stepping happens on **wall-clock dates in that zone** — so
a 09:00 task stays 09:00 across a DST transition rather than drifting an hour.
Rendering uses the user's configured timezone from their profile, never
`Date.getHours()` on the browser's local zone. `lib/tz.ts` is the only place that
converts between the two, and datetime `<input>` values go through
`lib/client/datetime.ts`.

Deliberate choice: monthly-on-the-31st **skips** short months instead of clamping to
the 28th, so "the 31st" never silently becomes a different day of the month.

---

## Authentication & authorization

**Authentication** — email/password with `bcrypt` (cost 12). No plaintext is ever
stored or logged. Sessions are HS256 JWTs in an `httpOnly`, `sameSite=lax`,
`secure`-in-production cookie, 30-day expiry.

Each user row holds a `sessionEpoch`. It is embedded in the token and revalidated on
every request, so changing or resetting a password invalidates all previously issued
cookies. Password reset tokens are stored **hashed** with a one-hour expiry.

Login and password endpoints are rate limited; account-enumeration is avoided by
returning identical responses for unknown and known emails.

**Authorization** — enforced server-side, always:

- `middleware.ts` only checks the cookie signature — a cheap gate, never the
  authority. It cannot be trusted for resource access and is not used for it.
- Every route handler calls `requireUser()`, then a `server/authz.ts` guard:
  `requireMembership`, `requireProject` or `requireTaskAccess`, with a minimum role.
- Roles are ranked (`VIEWER < MEMBER < ADMIN < OWNER`); writes require `MEMBER`+,
  member management requires `ADMIN`+.
- `taskVisibilityFilter` is applied to every task query, so a `PRIVATE` task is only
  ever returned to its creator or assignee — including through search, presence and
  analytics.
- Assignee and project ids in request bodies are verified to belong to the same
  workspace before being written.
- Notification mutations are scoped to `userId`, so one user cannot read or modify
  another's.

All request bodies and query strings are validated with Zod before use.

---

## Features implemented

**Calendar** — Today, This Week, 15 Days, This Month; previous/next/today/date-picker
navigation; drag to move (including across days), drag the bottom edge to resize,
click an empty slot to create; a live "now" line; optimistic updates. Mobile gets an
agenda representation by default with the grids one tap away.

**Tasks** — full CRUD with status, priority, project, tags, assignee, start/due,
estimated vs actual duration, recurrence, reminders, subtasks with progress,
comments, attachments, dependencies, visibility, activity trail. Quick-add modal plus
natural-language parsing ("Build auth API tomorrow at 10am for 2 hours",
"Post on LinkedIn every Tuesday at 7pm") that asks for clarification instead of
guessing when input is ambiguous. Inline editing throughout the detail panel.

**Recurring tasks** — daily, weekdays, weekly, biweekly, monthly, yearly, custom
weekday sets; edit this occurrence / this and future / whole series.

**Projects** — icon, colour, status, dates, members, milestones; overview with
progress, upcoming, overdue and recent activity; a simple roadmap timeline with
milestone markers (deliberately not a Jira clone). Development metadata on tasks:
branch, PR, issue, repository, technical notes.

**Content calendar** — dedicated pipeline board across IDEA → DRAFT → REVIEW →
APPROVED → SCHEDULED → PUBLISHED, per-platform (Instagram, LinkedIn, X, YouTube,
TikTok, Facebook, Other) and per-type (post, reel, video, story, thread, article,
carousel), with caption and body fields, plus a calendar view of upcoming content.

**Inbox** — capture unscheduled ideas in one keystroke, schedule them later.

**Team** — multi-user workspaces, invites (existing users join instantly, others get a
link), role management, member removal that unassigns rather than deletes work,
comments with `@mentions`, activity feed filterable by project, and lightweight
presence based on heartbeats plus the task a person explicitly marked active.

**Dashboard & reviews** — daily briefing with a real timeline, today's completion
percentage, overdue/upcoming/inbox panels, team strip; a weekly review page with
completed, carried over, time spent, completion rate, most productive projects,
upcoming deadlines and a reflection note; analytics with completion trends,
per-project and per-priority breakdowns and estimate-vs-actual.

**Search & command palette** — `⌘/Ctrl+K` over tasks, projects, users, comments,
content and tags; palette actions (create task, create project, invite, toggle theme,
navigate) and `g`-prefixed navigation shortcuts, `c` to create.

**Theming** — light, dark and system. Dark mode is a separately designed palette, not
an inversion, with calendar contrast and readable task colours checked in both.

**PWA** — installable, offline shell, cached data, push notifications, mobile bottom
navigation.

---

## Testing

```bash
npm run test
```

Covers the two pieces of logic with real edge cases: recurrence expansion (DST
transitions, month-length skips, `count`/`until` limits, far-future windows that must
not walk every past day) and the natural-language parser (dates, durations,
recurrence phrasings, tag/project/priority markers, ambiguity detection).

The API and UI were verified end to end against a live server and database:
auth flows, authorization isolation (private tasks invisible to teammates,
non-members refused), recurrence scope edits, mentions and notifications, the
reminder sweep's idempotency, and every page rendering.

---

## Known limitations

- **No email transport.** Password-reset and invite links are logged and returned in
  development instead of being emailed. Wire an SMTP or API-based provider in
  `api/auth/forgot-password` and `api/workspaces/[id]/invites` for production.
- **Avatars and attachments are stored as data URLs in MongoDB** (1.5 MB and 4 MB
  caps). Fine for a small deployment; move to S3/R2 before files matter.
- **Rate limiting is per-process and in-memory.** Behind multiple instances the
  limits are per-instance. Swap in Redis if you scale horizontally.
- **Presence and notifications poll** (60–90 s) instead of using websockets. Simple
  and cheap; not instant.
- **Standalone MongoDB has no transactions**, so registration falls back to
  sequential writes. Use a replica set in production (see MongoDB setup).
- **Offline is read-mostly.** Cached data stays viewable, but edits made offline are
  not queued for later replay — they fail with a toast and need a connection.
- **The 15-day view uses an agenda layout** rather than 15 hour-columns, which would
  be unreadable at that width.
- **Search uses regex matching**, not MongoDB `$text` scoring. Good for as-you-type
  prefix search on workspace-sized data; revisit at scale.
- **Attachment uploads are wired end to end in the API** but the detail panel exposes
  them read-only — the file picker is not yet in the UI.
- **Task dependencies are stored and enforced on delete** but there is no dependency
  graph visualisation, and nothing blocks completing a task whose dependency is open.

---

## Recommended next steps

1. **Email provider** — the one thing standing between this and a real password-reset
   flow. Resend or Postmark, roughly an afternoon.
2. **Object storage for uploads** — S3/R2 presigned uploads, then drop the data-URL
   fallback and add the file picker to the task panel.
3. **Websockets or SSE** for presence, notifications and collaborative task updates,
   replacing the polling loops.
4. **Offline write queue** — persist failed mutations in IndexedDB and replay on
   reconnect, so the PWA is genuinely useful on a train.
5. **Redis-backed rate limiting and session revocation lists** before running more
   than one instance.
6. **Calendar integrations** — iCal export/subscribe and Google Calendar two-way sync;
   the recurrence model already maps cleanly onto RRULE.
7. **Broader test coverage** — API-level integration tests for the authorization
   matrix and recurrence scope edits, plus a Playwright pass over the calendar
   drag interactions.
8. **Accessibility audit** with a screen reader over the calendar grid, and keyboard
   task moving as an alternative to drag.
