import { betterAuth } from "better-auth"
import type { Bindings } from "./env"

function trustedOrigins(env: Bindings): string[] {
  return env.APP_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function buildAuth(env: Bindings) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: trustedOrigins(env),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : undefined,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
  })
}

export type Auth = ReturnType<typeof buildAuth>

const instances = new WeakMap<D1Database, Auth>()

export function createAuth(env: Bindings): Auth {
  const cached = instances.get(env.DB)
  if (cached) return cached

  const auth = buildAuth(env)
  instances.set(env.DB, auth)
  return auth
}

export type AuthSession = NonNullable<
  Awaited<ReturnType<Auth["api"]["getSession"]>>
>
