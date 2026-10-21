import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { audit } from "../lib/audit"
import { conflict, readJson } from "../lib/http"
import { requireSession, type AppEnv } from "../middleware/session"

const onboarding = new Hono<AppEnv>()

onboarding.use("*", requireSession)

type MembershipRow = {
  id: string
  schoolId: string
  schoolName: string
  schoolCode: string | null
  role: string
  status: string
  createdAt: number
}

const MEMBERSHIP_SELECT = `
  SELECT m.id,
         m.school_id AS schoolId,
         s.name AS schoolName,
         s.school_code AS schoolCode,
         m.role,
         m.status,
         m.created_at AS createdAt
  FROM school_members m
  JOIN schools s ON s.id = m.school_id
`

onboarding.get("/memberships", async (c) => {
  const userId = c.get("authSession").user.id
  const { results } = await c.env.DB.prepare(
    `${MEMBERSHIP_SELECT}
     WHERE m.user_id = ?
     ORDER BY s.name COLLATE NOCASE`,
  )
    .bind(userId)
    .all<MembershipRow>()

  return c.json({ memberships: results })
})

const joinInput = z.object({
  schoolId: z.string().trim().min(1),
})

onboarding.post("/join", async (c) => {
  const userId = c.get("authSession").user.id
  const body = await readJson(c, joinInput)

  const school = await c.env.DB.prepare(
    `SELECT id, name FROM schools WHERE id = ?`,
  )
    .bind(body.schoolId)
    .first<{ id: string; name: string }>()

  if (!school) {
    throw new HTTPException(404, { message: "School not found" })
  }

  const existing = await c.env.DB.prepare(
    `SELECT id, role, status FROM school_members
     WHERE school_id = ? AND user_id = ?`,
  )
    .bind(body.schoolId, userId)
    .first<{ id: string; role: string; status: string }>()

  let membershipId = existing?.id

  if (existing) {
    if (existing.status === "active") {
      throw conflict("You already have access to this school")
    }
    if (existing.status === "pending") {
      throw conflict("Your request for this school is already pending")
    }

    await c.env.DB.prepare(
      `UPDATE school_members
       SET status = 'pending', created_at = unixepoch()
       WHERE id = ?`,
    )
      .bind(existing.id)
      .run()
  } else {
    membershipId = crypto.randomUUID()
    await c.env.DB.prepare(
      `INSERT INTO school_members (id, school_id, user_id, role, status)
       VALUES (?, ?, ?, 'ao', 'pending')`,
    )
      .bind(membershipId, body.schoolId, userId)
      .run()
  }

  await audit(c, body.schoolId, {
    action: "membership.request",
    entityType: "school_member",
    entityId: membershipId,
    meta: { role: existing?.role ?? "ao" },
  })

  const membership = await c.env.DB.prepare(
    `${MEMBERSHIP_SELECT} WHERE m.id = ?`,
  )
    .bind(membershipId)
    .first<MembershipRow>()

  return c.json({ membership }, 201)
})

export default onboarding
