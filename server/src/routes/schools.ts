import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { audit } from "../lib/audit"
import {
  ADMIN_ROLES,
  assertSystemAdmin,
  isSystemAdmin,
  requireSchool,
} from "../lib/authz"
import { conflict, isUniqueViolation, readJson } from "../lib/http"
import { requireSession, type AppEnv } from "../middleware/session"

const schools = new Hono<AppEnv>()

schools.use("*", requireSession)

const schoolInput = z.object({
  name: z.string().trim().min(1).max(200),
  schoolCode: z.string().trim().max(50).nullable().optional(),
  division: z.string().trim().max(200).nullable().optional(),
  region: z.string().trim().max(200).nullable().optional(),
})

type SchoolRow = {
  id: string
  name: string
  schoolCode: string | null
  division: string | null
  region: string | null
  createdAt: number
  updatedAt: number
}

const SCHOOL_COLUMNS = `
  s.id, s.name,
  s.school_code AS schoolCode,
  s.division, s.region,
  s.created_at AS createdAt,
  s.updated_at AS updatedAt
`

schools.get("/", async (c) => {
  if (await isSystemAdmin(c)) {
    const { results } = await c.env.DB.prepare(
      `SELECT ${SCHOOL_COLUMNS}, 'system_admin' AS role
       FROM schools s
       ORDER BY s.name COLLATE NOCASE`,
    ).all<SchoolRow & { role: string }>()

    return c.json({ schools: results })
  }

  const userId = c.get("authSession").user.id
  const { results } = await c.env.DB.prepare(
    `SELECT ${SCHOOL_COLUMNS}, m.role
     FROM schools s
     JOIN school_members m ON m.school_id = s.id
     WHERE m.user_id = ? AND m.status = 'active'
     ORDER BY s.name COLLATE NOCASE`,
  )
    .bind(userId)
    .all<SchoolRow & { role: string }>()

  return c.json({ schools: results })
})

schools.get("/catalog", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name,
            school_code AS schoolCode,
            division, region
     FROM schools
     ORDER BY name COLLATE NOCASE`,
  ).all<{
    id: string
    name: string
    schoolCode: string | null
    division: string | null
    region: string | null
  }>()

  return c.json({ schools: results })
})

schools.post("/", async (c) => {
  await assertSystemAdmin(c)
  const body = await readJson(c, schoolInput)
  const id = crypto.randomUUID()

  try {
    await c.env.DB.prepare(
      `INSERT INTO schools (id, name, school_code, division, region)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        body.name,
        body.schoolCode ?? null,
        body.division ?? null,
        body.region ?? null,
      )
      .run()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That school code is already in use")
    }
    throw error
  }

  await audit(c, id, {
    action: "school.create",
    entityType: "school",
    entityId: id,
    meta: { name: body.name },
  })

  return c.json(
    {
      school: {
        id,
        name: body.name,
        schoolCode: body.schoolCode ?? null,
        division: body.division ?? null,
        region: body.region ?? null,
        role: "system_admin",
      },
    },
    201,
  )
})

schools.get("/:schoolId", async (c) => {
  const membership = await requireSchool(c)
  const school = await c.env.DB.prepare(
    `SELECT ${SCHOOL_COLUMNS} FROM schools s WHERE s.id = ?`,
  )
    .bind(membership.schoolId)
    .first<SchoolRow>()

  if (!school) {
    throw new HTTPException(404, { message: "School not found" })
  }

  return c.json({ school: { ...school, role: membership.role } })
})

schools.patch("/:schoolId", async (c) => {
  const membership = await requireSchool(c, ADMIN_ROLES)
  const body = await readJson(c, schoolInput.partial())

  const current = await c.env.DB.prepare(
    `SELECT ${SCHOOL_COLUMNS} FROM schools s WHERE s.id = ?`,
  )
    .bind(membership.schoolId)
    .first<SchoolRow>()

  if (!current) {
    throw new HTTPException(404, { message: "School not found" })
  }

  const next = {
    name: body.name ?? current.name,
    schoolCode:
      body.schoolCode === undefined ? current.schoolCode : body.schoolCode,
    division: body.division === undefined ? current.division : body.division,
    region: body.region === undefined ? current.region : body.region,
  }

  try {
    await c.env.DB.prepare(
      `UPDATE schools
       SET name = ?, school_code = ?, division = ?, region = ?,
           updated_at = unixepoch()
       WHERE id = ?`,
    )
      .bind(
        next.name,
        next.schoolCode,
        next.division,
        next.region,
        membership.schoolId,
      )
      .run()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That school code is already in use")
    }
    throw error
  }

  await audit(c, membership.schoolId, {
    action: "school.update",
    entityType: "school",
    entityId: membership.schoolId,
    meta: next,
  })

  return c.json({ school: { ...current, ...next, role: membership.role } })
})

const memberInput = z.object({
  email: z.string().trim().email(),
  role: z.enum(["admin", "ao", "encoder", "viewer"]),
})

type MemberRow = {
  id: string
  userId: string
  name: string
  email: string
  role: string
  createdAt: number
}

schools.get("/:schoolId/members", async (c) => {
  const membership = await requireSchool(c)
  const { results } = await c.env.DB.prepare(
    `SELECT m.id,
            m.user_id AS userId,
            u.name, u.email,
            m.role,
            m.created_at AS createdAt
     FROM school_members m
     JOIN user u ON u.id = m.user_id
     WHERE m.school_id = ? AND m.status = 'active'
     ORDER BY m.role, u.name COLLATE NOCASE`,
  )
    .bind(membership.schoolId)
    .all<MemberRow>()

  return c.json({ members: results })
})

schools.post("/:schoolId/members", async (c) => {
  const membership = await requireSchool(c, ADMIN_ROLES)
  const body = await readJson(c, memberInput)

  const user = await c.env.DB.prepare(
    `SELECT id, name, email FROM user WHERE lower(email) = lower(?)`,
  )
    .bind(body.email)
    .first<{ id: string; name: string; email: string }>()

  if (!user) {
    throw new HTTPException(404, {
      message: "No account uses that email address",
    })
  }

  const id = crypto.randomUUID()

  try {
    await c.env.DB.prepare(
      `INSERT INTO school_members (id, school_id, user_id, role, status)
       VALUES (?, ?, ?, ?, 'active')`,
    )
      .bind(id, membership.schoolId, user.id, body.role)
      .run()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That person is already a member")
    }
    throw error
  }

  await audit(c, membership.schoolId, {
    action: "member.add",
    entityType: "school_member",
    entityId: id,
    meta: { email: user.email, role: body.role },
  })

  return c.json(
    {
      member: {
        id,
        userId: user.id,
        name: user.name,
        email: user.email,
        role: body.role,
      },
    },
    201,
  )
})

const memberPatch = z.object({
  role: z.enum(["admin", "ao", "encoder", "viewer"]),
})

schools.patch("/:schoolId/members/:memberId", async (c) => {
  const membership = await requireSchool(c, ADMIN_ROLES)
  const body = await readJson(c, memberPatch)
  const memberId = c.req.param("memberId")

  const target = await c.env.DB.prepare(
    `SELECT id, user_id AS userId, role FROM school_members
     WHERE id = ? AND school_id = ?`,
  )
    .bind(memberId, membership.schoolId)
    .first<{ id: string; userId: string; role: string }>()

  if (!target) {
    throw new HTTPException(404, { message: "Member not found" })
  }

  if (target.role === "owner") {
    throw new HTTPException(403, { message: "The owner role cannot be changed" })
  }

  await c.env.DB.prepare(
    `UPDATE school_members SET role = ? WHERE id = ?`,
  )
    .bind(body.role, memberId)
    .run()

  await audit(c, membership.schoolId, {
    action: "member.update",
    entityType: "school_member",
    entityId: memberId,
    meta: { from: target.role, to: body.role },
  })

  return c.json({ member: { id: memberId, userId: target.userId, role: body.role } })
})

schools.delete("/:schoolId/members/:memberId", async (c) => {
  const membership = await requireSchool(c, ADMIN_ROLES)
  const memberId = c.req.param("memberId")

  const target = await c.env.DB.prepare(
    `SELECT id, user_id AS userId, role FROM school_members
     WHERE id = ? AND school_id = ?`,
  )
    .bind(memberId, membership.schoolId)
    .first<{ id: string; userId: string; role: string }>()

  if (!target) {
    throw new HTTPException(404, { message: "Member not found" })
  }

  if (target.role === "owner") {
    throw new HTTPException(403, { message: "The owner cannot be removed" })
  }

  await c.env.DB.prepare(`DELETE FROM school_members WHERE id = ?`)
    .bind(memberId)
    .run()

  await audit(c, membership.schoolId, {
    action: "member.remove",
    entityType: "school_member",
    entityId: memberId,
    meta: { userId: target.userId, role: target.role },
  })

  return c.json({ ok: true })
})

export default schools
