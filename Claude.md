# Flowdeck — SmolBusiness admin panel

Internal admin panel for SmolBusiness only (the old task/calendar/project features were removed in SMOL-419). Next.js 15 App Router, React 19, Tailwind 4, Mongoose 9, Zod 4.

## Layout

- `src/app/(smol)/smol/*` — every admin page. `/` redirects to `/smol`; marketing lands on `/smol/stores`.
- `src/app/api/smol/*` — SmolBusiness data. `src/app/api/admins/*` — admin accounts. `src/app/api/auth/*` — login, logout, forgot/reset/change password.
- `src/server/smol.ts` — reads (`listSmol`, `getSmolDoc`, `smolMeta`, `smolIntel`) and the role gate `requireAdmin`. `src/server/smol-admin.ts` — the only writes to the SmolBusiness DB. `src/server/admins.ts` — invite / role change / remove.
- `src/lib/smol-config.ts` — client-safe collection definitions, `ADMIN_ROLES`, and what marketing may see (`MARKETING_STORE_FIELDS`, `visibleCollection`, `canReadCollection`).
- `src/models/User.ts` — the only Flowdeck model. Flowdeck's own DB is `FlowDeck`; SmolBusiness is a separate connection (`src/lib/smol-db.ts`).

## Rules

- **Every `/api/smol` and `/api/admins` route calls `requireAdmin()`**; actions, exports, intel and analytics call `requireAdmin("superadmin")`. Superadmin-only pages call `requireSuperadminPage()`. Hiding a button is never the control.
- **Marketing never gets buyer, order or billing data.** Store reads for marketing are projected to `MARKETING_STORE_FIELDS` server-side; `related` is `null`. `npm test` asserts this.
- **Access changes bump `sessionEpoch`** so they take effect at once. No role = login refused.
- **Seller, order, OTP-limit, feature and email-budget controls are backend calls**, not Mongo writes: the superadmin proxy `/api/smol/admin/[...path]` (allowlist `ADMIN_API_PATH`) forwards to `smolBusiness-backend` `/api/internal/admin/*` with `SMOL_ADMIN_API_SECRET` and the admin's email as `by`, because the backend owns sessions, credit lots, stock and storefront cache purges. Only announcements (create/edit/publish), resolve flags, seller notes/tags (`sellernotes`, one doc per store, read by both roles) and the hard delete write the SmolBusiness DB directly.
- Subscription history and MRR (`src/lib/smol-subscriptions.ts`) are rebuilt from subscription billing orders + the backend's `subscriptionevents`; `npm test` covers it.
- Route handlers: wrap in `try/catch` + `handleError`, validate with `parseBody`/`parseQuery`, return `ok()`/`fail()`.
- Edge middleware only checks the cookie signature; real auth is server-side.

## Commands

`npm run dev | build | typecheck | lint | test | indexes | seed:superadmin -- <email> "<name>"`
