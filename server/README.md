# dtr-api — Cloudflare Worker scaffold

Optional backend for DTR Tool. The existing SPA is **untouched**: it still builds,
prints, and exports entirely in the browser. Nothing here is called by the app yet.

Stack: **Cloudflare Workers + Hono + D1 + Better Auth** (native D1 support, no Kysely).

## Layout

```
server/
  wrangler.jsonc         Worker + D1 binding + local vars
  migrations/
    0001_better_auth.sql  Better Auth tables (generated)
    0002_domain.sql       schools, employees, holidays, leave, DTR, audit log
  src/
    index.ts             Hono app: CORS, /health, /api/auth/*, /api/me
    auth.ts              Better Auth instance (cached per D1 binding)
    middleware/session.ts  requireSession guard
  scripts/auth-schema.ts  Node-only config used to regenerate auth SQL
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

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | Liveness + D1 `SELECT 1` |
| `*` | `/api/auth/*` | Better Auth (sign-up, sign-in, session, sign-out) |
| `GET` | `/api/me` | Requires a session; returns `{ user, session }` |

Domain routes (employees, leaves, holidays, DTR periods) are **not built yet** —
the schema is ready, the API comes with the next slice.

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
