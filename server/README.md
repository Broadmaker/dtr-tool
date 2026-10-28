# dtr-api — Cloudflare Worker scaffold

Optional backend for DTR Tool. The SPA still builds, prints, and exports entirely
in the browser; the cloud workspace is opt-in and only syncs data the user saves.

Stack: **Cloudflare Workers + Hono + D1 + Better Auth** (native D1 support, no Kysely).

## Layout

```
server/
  wrangler.jsonc         Worker + D1 binding + local vars
  migrations/
    0001_better_auth.sql  Better Auth tables (generated)
    0002_domain.sql       schools, employees, holidays, leave, DTR, audit log
    0003_seed_leave_types.sql  global CSC leave types
    0004_system_admin.sql     system admins + membership approval status
    0005_import_zamboanga_sibugay_schools.sql  official 507-school catalog
    0006_official_travels.sql  official travel records
  src/
    index.ts             Hono app: CORS, /health, /api/auth/*, /api/me
    auth.ts              Better Auth instance (cached per D1 binding)
    middleware/session.ts  requireSession guard
    routes/              schools, onboarding, admin, employees, holidays, leave, travels, DTR
  scripts/auth-schema.ts  Node-only config used to regenerate auth SQL
  scripts/grant-admin.mjs grant a registered account the system-admin role
```

## First-time setup

```powershell
cd server
pnpm install
Copy-Item .dev.vars.example .dev.vars   # then fill BETTER_AUTH_SECRET
pnpm exec wrangler d1 create dtr-db
```

Copy the returned `database_id` into `server/wrangler.jsonc` (replaces
`REPLACE_WITH_D1_DATABASE_ID`), then:

```powershell
pnpm db:migrate:local
pnpm dev
```

The API runs on `http://localhost:8787`. `.dev.vars` overrides the production
`BETTER_AUTH_URL` / `APP_ORIGIN` values in `wrangler.jsonc` for local dev. The
existing frontend still runs from the repo root with `pnpm dev`
(`http://localhost:5173`).

Generate a secret with:

```powershell
openssl rand -base64 32
```

## Tests

```powershell
pnpm test        # vitest run (Workers runtime + local D1)
pnpm test:watch
```

Tests run inside `workerd` via `@cloudflare/vitest-plugin` and use the D1 binding
from `wrangler.jsonc`. `test/apply-migrations.ts` applies `migrations/*.sql`
before the suite, so the schema always matches production. Auth is exercised
through real Better Auth sign-up cookies; tests reset their tables per case.

Current coverage lives in `test/admin.test.ts` (system-admin auth, membership
filters/pagination, approval audit trail, activity filters). Add route suites
beside it as more areas get tests.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | Liveness + D1 `SELECT 1` |
| `*` | `/api/auth/*` | Better Auth (sign-up, sign-in, session, sign-out) |
| `GET` | `/api/me` | Requires a session; returns `{ user, session, isSystemAdmin }` |
| `GET` | `/api/schools/catalog` | Official school list for AO onboarding |
| `GET` | `/api/onboarding/memberships` | Current user's school memberships and statuses |
| `POST` | `/api/onboarding/join` | Request AO access to `{ schoolId }` |
| `GET/PATCH` | `/api/admin/memberships` | System admin: list (filter by `status`, `role`, `schoolId`, `q`; `limit`/`offset`) and approve/decline/suspend AOs |
| `GET` | `/api/admin/schools` | System admin: all schools with member/employee counts |

Everything below requires an active membership for `:schoolId`, unless the caller
is a system admin. Non-members get `404` so school IDs do not leak.

| Area | Routes |
|---|---|
| Schools | `GET/POST /api/schools`, `GET/PATCH /api/schools/:schoolId` (create is system-admin only) |
| Members | `GET/POST /api/schools/:schoolId/members`, `PATCH/DELETE .../members/:memberId` |
| Employees | `GET/POST /api/schools/:schoolId/employees`, `GET/PATCH/DELETE .../:employeeId` |
| Holidays | `GET/POST /api/schools/:schoolId/holidays`, `PATCH/DELETE .../:holidayId` |
| Leave types | `GET/POST .../leave-types`, `PATCH/DELETE .../leave-types/:leaveTypeId` |
| Leave credits | `GET/PUT .../employees/:employeeId/leave-credits?year=2026` |
| Leave apps | `GET/POST .../leave-applications`, `GET/PATCH .../leave-applications/:id` |
| Official travels | `GET/POST .../travels`, `PATCH/DELETE .../travels/:travelId` |
| DTR periods | `GET/POST .../dtr-periods`, `GET/PATCH/DELETE .../dtr-periods/:periodId` |
| DTR days | `GET/PUT .../dtr-periods/:periodId/days`, `DELETE .../days/:workDate` |
| Audit | `GET .../audit-log?limit=50` (owner/admin/ao) |

Role rules: `system_admin` sees and manages every school; `owner`/`admin` manage
schools and members; `ao`/`encoder` edit employees, holidays, leave, travels, and DTR; only
`owner`/`admin`/`ao`/`system_admin` approve or lock. `viewer` is read-only. New
AO memberships start as `pending` until a system admin approves them. Every
mutation writes to `audit_log`.

Notes:

- Employee `DELETE` is a soft deactivate (`isActive: false`); `PATCH { "isActive": true }` reactivates.
- DTR days are upserted in one batch (`PUT`), so a month saves atomically (max 31 rows).
- Locked DTR periods reject day edits and cannot be deleted.
- Approving a leave application recalculates `leave_credits.used` for that leave year.
- `POST /api/schools/:schoolId/members` takes `{ email, role }`; the account must already exist.
- `0003_seed_leave_types.sql` adds global CSC types (VL, SL, SPL, ML, PL, SLPL, STL, EL).
- `0004_system_admin.sql` adds the global admin table and membership `status`.

## System admin bootstrap

The first system admin must register a normal account, then be granted from the
command line. Better Auth email verification is currently disabled, so this is
also why public sign-up cannot self-assign the role.

```powershell
cd server
pnpm admin:grant:local --email you@example.com
# remote
pnpm admin:grant:remote --email you@example.com
```

The system admin stays in the Admin Console to create schools and approve
pending AO requests. School workspaces are opened per school from the school
detail page; the generic workspace is reserved for school members.

## Deploy

```powershell
pnpm exec wrangler d1 migrations apply dtr-db --remote
pnpm exec wrangler secret put BETTER_AUTH_SECRET
# optional Google sign-in
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET

pnpm exec wrangler deploy
```

Production URLs live in `wrangler.jsonc` (`BETTER_AUTH_URL`, `APP_ORIGIN`). Edit
them there when the domain changes; `.dev.vars` supplies the local overrides.
`APP_ORIGIN` accepts a comma-separated list if you have more than one frontend origin.

Current deployment:

- App: `https://dtr-tool.pages.dev`
- API: `https://dtr-api.sanigkram24.workers.dev` (proxied, not called directly)

### Same-origin auth through a Pages Function

`pages.dev` and `workers.dev` are **different sites**, so cookies set by the Worker
would be third-party in the browser. `functions/api/[[path]].ts` proxies every
`/api/*` request from the app to the Worker, so the browser only ever sees
`https://dtr-tool.pages.dev`:

- `BETTER_AUTH_URL` and `APP_ORIGIN` both point at `https://dtr-tool.pages.dev`
- Cookies are first-party; CORS is no longer required for normal app traffic
- OAuth redirects pass through (`redirect: "manual"`)
- The `workers.dev` URL stays enabled only as the proxy target

When you move to a custom domain, point Pages and `BETTER_AUTH_URL` /
`APP_ORIGIN` at it and update `API_ORIGIN` in the proxy. Better still, route
`https://example.com/api/*` straight to the Worker and delete the proxy.

## Regenerating Better Auth SQL

When you add auth plugins/providers, regenerate and re-apply:

```powershell
pnpm auth:generate
pnpm db:migrate:local
```

The CLI runs under Node with an in-memory SQLite database; it cannot read the D1
binding. That is why `scripts/auth-schema.ts` exists separately from `src/auth.ts`.

## Conventions

- Domain tables are `snake_case`; Better Auth tables keep its generated `camelCase`.
- Every tenant-owned row carries `school_id`; all future queries must filter by it.
- IDs are opaque `text` (crypto UUIDs), timestamps are Unix seconds.
- No payroll data. Attendance, leave, approvals, and audit only.
