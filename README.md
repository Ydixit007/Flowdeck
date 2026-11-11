# Flowdeck — SmolBusiness admin panel

Internal admin panel for SmolBusiness. Reads the SmolBusiness database directly (sellers, orders, billing, platform data) and keeps its own small database of admin accounts.

## Quick start

```bash
npm install
cp .env.example .env.local      # set MONGODB_URI, AUTH_SECRET, SMOL_MONGODB_URI, SMOL_DB_NAME
npm run indexes                 # once per database
npm run seed:superadmin -- you@example.com "Your Name"   # prints a set-password link
npm run dev                     # http://localhost:3000
```

## Access

There is no public sign-up. Every account carries a `role`; no role means no access.

| Role | Can do |
|---|---|
| `superadmin` | Everything: every page, admin action, export, and managing admins at **Admins** (`/smol/admins`). |
| `marketing` | Read-only seller contact details: Sellers list and seller page (store, domain, email, phone, Instagram, plan, joined). No buyer, order or billing data. |

- A superadmin invites an admin from **Admins**. No email is sent: the panel shows a 7-day link that lets the invitee set a password.
- Changing a role or removing access bumps the user's `sessionEpoch`, so it applies on their next request.
- Roles are enforced in every `/api/smol/*` and `/api/admins/*` route (`requireAdmin` in `src/server/smol.ts`), not only in the UI. What marketing may see is `visibleCollection` / `canReadCollection` in `src/lib/smol-config.ts`.

## Scripts

```bash
npm run dev | build | start
npm run typecheck
npm run lint
npm test                  # unit tests (node:test via tsx)
npm run indexes           # sync User indexes after a schema change
npm run seed:superadmin -- <email> "<name>"
```

## Auth

Email + password (bcrypt). Sessions are HS256 JWTs in an httpOnly cookie, 30 days. `sessionEpoch` is embedded in the token and checked on every request; password change/reset and role changes bump it. Forgot-password has no mail transport: the link is logged server-side.
