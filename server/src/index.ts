import { Hono } from "hono"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { createAuth } from "./auth"
import type { Bindings } from "./env"
import { isSystemAdmin } from "./lib/authz"
import { requireSession, type AppEnv } from "./middleware/session"
import admin from "./routes/admin"
import auditLog from "./routes/audit"
import dtr from "./routes/dtr"
import employees from "./routes/employees"
import holidays from "./routes/holidays"
import leaves from "./routes/leaves"
import onboarding from "./routes/onboarding"
import schools from "./routes/schools"
import travels from "./routes/travels"

const app = new Hono<AppEnv>()

function allowedOrigins(env: Bindings): string[] {
  return env.APP_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

app.use("*", (c, next) => {
  const origins = allowedOrigins(c.env)

  return cors({
    origin: (origin) => (origins.includes(origin) ? origin : origins[0]),
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })(c, next)
})

app.get("/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first()
    return c.json({ ok: true, service: "dtr-api", db: "ok" })
  } catch {
    return c.json({ ok: false, service: "dtr-api", db: "unavailable" }, 503)
  }
})

app.all("/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw))

app.get("/api/me", requireSession, async (c) => {
  const { user, session } = c.get("authSession")
  return c.json({ user, session, isSystemAdmin: await isSystemAdmin(c) })
})

app.route("/api/schools", schools)
app.route("/api/schools", auditLog)
app.route("/api/onboarding", onboarding)
app.route("/api/admin", admin)

/*
 * Tenant-scoped collections. Each router reads :schoolId from the path and
 * enforces membership before doing any work.
 */
app.route("/api/schools/:schoolId/employees", employees)
app.route("/api/schools/:schoolId/holidays", holidays)
app.route("/api/schools/:schoolId/travels", travels)
app.route("/api/schools/:schoolId", leaves)
app.route("/api/schools/:schoolId", dtr)

app.notFound((c) => c.json({ error: "Not found" }, 404))

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status)
  }

  console.error(error)
  return c.json({ error: "Internal server error" }, 500)
})

export default app
