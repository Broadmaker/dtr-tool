import { Hono } from "hono"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { createAuth } from "./auth"
import type { Bindings } from "./env"
import { requireSession, type AppEnv } from "./middleware/session"

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

app.get("/api/me", requireSession, (c) => {
  const { user, session } = c.get("authSession")
  return c.json({ user, session })
})

app.notFound((c) => c.json({ error: "Not found" }, 404))

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status)
  }

  console.error(error)
  return c.json({ error: "Internal server error" }, 500)
})

export default app
