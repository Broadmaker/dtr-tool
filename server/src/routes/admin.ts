import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { audit } from "../lib/audit"
import { assertSystemAdmin } from "../lib/authz"
import { readJson, readQuery } from "../lib/http"
import { requireSession, type AppEnv } from "../middleware/session"

const admin = new Hono<AppEnv>()

admin.use("*", requireSession)
admin.use("*", async (c, next) => {
  await assertSystemAdmin(c)
  await next()
})

const MEMBERSHIP_SELECT = `
  SELECT m.id,
         m.user_id AS userId,
         u.name,
         u.email,
         m.school_id AS schoolId,
         s.name AS schoolName,
         s.school_code AS schoolCode,
         m.role,
         m.status,
         m.created_at AS createdAt
  FROM school_members m
  JOIN user u ON u.id = m.user_id
  JOIN schools s ON s.id = m.school_id
`

type AdminMembership = {
  id: string
  userId: string
  name: string
  email: string
  schoolId: string
  schoolName: string
  schoolCode: string | null
  role: string
  status: string
  createdAt: number
}

type AdminOverview = {
  schools: number
  activeMembers: number
  pendingRequests: number
  activeEmployees: number
  pendingLeave: number
  dtrDraft: number
  dtrReviewed: number
  dtrApproved: number
  dtrLocked: number
  auditEvents: number
  auditRecent: number
}

const ACTIVITY_SELECT = `
  SELECT a.id,
         a.school_id AS schoolId,
         s.name AS schoolName,
         a.actor_user_id AS actorUserId,
         u.name AS actorName,
         u.email AS actorEmail,
         a.action,
         a.entity_type AS entityType,
         a.entity_id AS entityId,
         a.meta_json AS metaJson,
         a.created_at AS createdAt
  FROM audit_log a
  LEFT JOIN schools s ON s.id = a.school_id
  LEFT JOIN user u ON u.id = a.actor_user_id
`

type AdminActivityRow = {
  id: string
  schoolId: string
  schoolName: string | null
  actorUserId: string
  actorName: string | null
  actorEmail: string | null
  action: string
  entityType: string
  entityId: string | null
  metaJson: string | null
  createdAt: number
}

function parseActivity(rows: AdminActivityRow[]) {
  return rows.map(({ metaJson, ...row }) => ({
    ...row,
    meta: metaJson ? JSON.parse(metaJson) : null,
  }))
}

type AdminSchoolRow = {
  id: string
  name: string
  schoolCode: string | null
  division: string | null
  region: string | null
  createdAt: number
  updatedAt: number
  memberCount: number
  pendingCount: number
  employeeCount: number
  dtrPendingCount: number
  leavePendingCount: number
}

type AdminSchoolDetailRow = AdminSchoolRow & {
  dtrDraft: number
  dtrReviewed: number
  dtrApproved: number
  dtrLocked: number
}

type AdminSchoolMember = {
  id: string
  userId: string
  name: string
  email: string
  role: string
  status: string
  createdAt: number
}

const membershipQuery = z.object({
  status: z
    .enum(["pending", "active", "rejected", "suspended"])
    .optional(),
})

admin.get("/overview", async (c) => {
  const overview = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM schools) AS schools,
       (SELECT COUNT(*) FROM school_members WHERE status = 'active') AS activeMembers,
       (SELECT COUNT(*) FROM school_members WHERE status = 'pending') AS pendingRequests,
       (SELECT COUNT(*) FROM employees WHERE is_active = 1) AS activeEmployees,
       (SELECT COUNT(*) FROM leave_applications WHERE status = 'submitted') AS pendingLeave,
       (SELECT COUNT(*) FROM dtr_periods WHERE status = 'draft') AS dtrDraft,
       (SELECT COUNT(*) FROM dtr_periods WHERE status = 'reviewed') AS dtrReviewed,
       (SELECT COUNT(*) FROM dtr_periods WHERE status = 'approved') AS dtrApproved,
       (SELECT COUNT(*) FROM dtr_periods WHERE status = 'locked') AS dtrLocked,
       (SELECT COUNT(*) FROM audit_log) AS auditEvents,
       (SELECT COUNT(*) FROM audit_log WHERE created_at >= unixepoch() - 604800) AS auditRecent`,
  ).first<AdminOverview>()

  return c.json({
    overview:
      overview ??
      {
        schools: 0,
        activeMembers: 0,
        pendingRequests: 0,
        activeEmployees: 0,
        pendingLeave: 0,
        dtrDraft: 0,
        dtrReviewed: 0,
        dtrApproved: 0,
        dtrLocked: 0,
        auditEvents: 0,
        auditRecent: 0,
      },
  })
})

const activityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().optional(),
})

admin.get("/activity", async (c) => {
  const query = readQuery(c, activityQuery)
  let sql = ACTIVITY_SELECT
  const binds: number[] = []

  if (query.before) {
    sql += ` WHERE a.created_at < ?`
    binds.push(query.before)
  }

  sql += ` ORDER BY a.created_at DESC LIMIT ?`
  binds.push(query.limit)

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<AdminActivityRow>()

  return c.json({ entries: parseActivity(results) })
})

admin.get("/memberships", async (c) => {
  const query = readQuery(c, membershipQuery)
  let sql = MEMBERSHIP_SELECT
  const binds: string[] = []

  if (query.status) {
    sql += ` WHERE m.status = ?`
    binds.push(query.status)
  }

  sql += ` ORDER BY CASE m.status
                      WHEN 'pending' THEN 0
                      WHEN 'active' THEN 1
                      ELSE 2
                    END,
                    m.created_at DESC`

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<AdminMembership>()

  return c.json({ memberships: results })
})

const membershipStatus = z.object({
  status: z.enum(["active", "rejected", "suspended"]),
})

admin.patch("/memberships/:membershipId", async (c) => {
  const body = await readJson(c, membershipStatus)
  const membershipId = c.req.param("membershipId")

  const target = await c.env.DB.prepare(
    `${MEMBERSHIP_SELECT} WHERE m.id = ?`,
  )
    .bind(membershipId)
    .first<AdminMembership>()

  if (!target) {
    throw new HTTPException(404, { message: "Membership not found" })
  }

  await c.env.DB.prepare(
    `UPDATE school_members SET status = ? WHERE id = ?`,
  )
    .bind(body.status, membershipId)
    .run()

  const action =
    body.status === "active"
      ? "membership.approve"
      : body.status === "rejected"
        ? "membership.reject"
        : "membership.suspend"

  await audit(c, target.schoolId, {
    action,
    entityType: "school_member",
    entityId: membershipId,
    meta: {
      userId: target.userId,
      email: target.email,
      from: target.status,
      to: body.status,
    },
  })

  return c.json({
    membership: { ...target, status: body.status },
  })
})

const SCHOOL_SELECT = `
  SELECT s.id, s.name,
         s.school_code AS schoolCode,
         s.division, s.region,
         s.created_at AS createdAt,
         s.updated_at AS updatedAt,
         (SELECT COUNT(*) FROM school_members m
          WHERE m.school_id = s.id AND m.status = 'active') AS memberCount,
         (SELECT COUNT(*) FROM school_members m
          WHERE m.school_id = s.id AND m.status = 'pending') AS pendingCount,
         (SELECT COUNT(*) FROM employees e
          WHERE e.school_id = s.id AND e.is_active = 1) AS employeeCount,
         (SELECT COUNT(*) FROM dtr_periods p
          WHERE p.school_id = s.id AND p.status IN ('draft', 'reviewed')) AS dtrPendingCount,
         (SELECT COUNT(*) FROM leave_applications la
          JOIN employees e ON e.id = la.employee_id
          WHERE e.school_id = s.id AND la.status = 'submitted') AS leavePendingCount
  FROM schools s
`

admin.get("/schools", async (c) => {
  const { results } = await c.env.DB.prepare(
    `${SCHOOL_SELECT} ORDER BY s.name COLLATE NOCASE`,
  ).all<AdminSchoolRow>()

  return c.json({ schools: results })
})

admin.get("/schools/:schoolId", async (c) => {
  const schoolId = c.req.param("schoolId")
  const school = await c.env.DB.prepare(
    `SELECT s.id, s.name,
            s.school_code AS schoolCode,
            s.division, s.region,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt,
            (SELECT COUNT(*) FROM school_members m
             WHERE m.school_id = s.id AND m.status = 'active') AS memberCount,
            (SELECT COUNT(*) FROM school_members m
             WHERE m.school_id = s.id AND m.status = 'pending') AS pendingCount,
            (SELECT COUNT(*) FROM employees e
             WHERE e.school_id = s.id AND e.is_active = 1) AS employeeCount,
            (SELECT COUNT(*) FROM dtr_periods p
             WHERE p.school_id = s.id AND p.status IN ('draft', 'reviewed')) AS dtrPendingCount,
            (SELECT COUNT(*) FROM leave_applications la
             JOIN employees e ON e.id = la.employee_id
             WHERE e.school_id = s.id AND la.status = 'submitted') AS leavePendingCount,
            (SELECT COUNT(*) FROM dtr_periods p
             WHERE p.school_id = s.id AND p.status = 'draft') AS dtrDraft,
            (SELECT COUNT(*) FROM dtr_periods p
             WHERE p.school_id = s.id AND p.status = 'reviewed') AS dtrReviewed,
            (SELECT COUNT(*) FROM dtr_periods p
             WHERE p.school_id = s.id AND p.status = 'approved') AS dtrApproved,
            (SELECT COUNT(*) FROM dtr_periods p
             WHERE p.school_id = s.id AND p.status = 'locked') AS dtrLocked
     FROM schools s
     WHERE s.id = ?`,
  )
    .bind(schoolId)
    .first<AdminSchoolDetailRow>()

  if (!school) {
    throw new HTTPException(404, { message: "School not found" })
  }

  const [membersResult, activityResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT m.id,
              m.user_id AS userId,
              u.name,
              u.email,
              m.role,
              m.status,
              m.created_at AS createdAt
       FROM school_members m
       JOIN user u ON u.id = m.user_id
       WHERE m.school_id = ?
       ORDER BY CASE m.status
                  WHEN 'pending' THEN 0
                  WHEN 'active' THEN 1
                  ELSE 2
                END,
                u.name COLLATE NOCASE`,
    )
      .bind(schoolId)
      .all<AdminSchoolMember>(),
    c.env.DB.prepare(
      `${ACTIVITY_SELECT} WHERE a.school_id = ? ORDER BY a.created_at DESC LIMIT 20`,
    )
      .bind(schoolId)
      .all<AdminActivityRow>(),
  ])

  return c.json({
    school,
    members: membersResult.results,
    activity: parseActivity(activityResult.results),
  })
})

export default admin
