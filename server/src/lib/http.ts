import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"

export async function readJson<S extends z.ZodType>(
  c: Context,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" })
  }
  return parse(schema, raw)
}

export function readQuery<S extends z.ZodType>(
  c: Context,
  schema: S,
): z.output<S> {
  return parse(schema, c.req.query())
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".")
        return path ? `${path}: ${issue.message}` : issue.message
      })
      .join("; ")
    throw new HTTPException(400, { message })
  }
  return result.data
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
  )
}

export function conflict(message = "Already exists"): HTTPException {
  return new HTTPException(409, { message })
}

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

export const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24-hour)")

export const nullableTime = timeString.nullable()
