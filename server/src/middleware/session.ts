import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import { createAuth, type AuthSession } from "../auth"
import type { Bindings } from "../env"

export type AppEnv = {
  Bindings: Bindings
  Variables: {
    authSession: AuthSession
  }
}

export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const auth = createAuth(c.env)
  const result = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!result) {
    throw new HTTPException(401, { message: "Unauthorized" })
  }

  c.set("authSession", result)
  await next()
})
