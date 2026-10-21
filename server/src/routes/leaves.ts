import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { audit } from "../lib/audit"
import { APPROVER_ROLES, requireSchool, WRITE_ROLES } from "../lib/authz"
import {
  conflict,
  dateString,
  isUniqueViolation,
  readJson,
  readQuery,
} from "../lib/http"
import { requireSession, type AppEnv } from "../middleware/session"
import { fetchEmployee } from "./employees"

const leaves = new Hono<AppEnv>()

leaves.use("*", requireSession)

const LEAVE_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
] as const

type LeaveStatus = (typeof LEAVE_STATUSES)[number]

const ALL_WRITE_OR_APPROVER = ["owner", "admin", "ao", "encoder"] as const

const ALLOWED_TRANSITIONS: Record<LeaveStatus, LeaveStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["approved", "rejected", "cancelled", "draft"],
  approved: ["cancelled"],
  rejected: ["draft"],
  cancelled: ["draft"],
}

/* ── Leave types ─────────────────────────────────────────────────────── */

const leaveTypeInput = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  requiresCredits: z.boolean().optional(),
})

type LeaveTypeRow = {
  id: string
  schoolId: string | null
  code: string
  name: string
  requiresCredits: number
  createdAt: number
}

leaves.get("/leave-types", async (c) => {
  const membership = await requireSchool(c)
  const { results } = await c.env.DB.prepare(
    `SELECT id, school_id AS schoolId, code, name,
            requires_credits AS requiresCredits, created_at AS createdAt
     FROM leave_types
     WHERE school_id IS NULL OR school_id = ?
     ORDER BY code COLLATE NOCASE`,
  )
    .bind(membership.schoolId)
    .all<LeaveTypeRow>()

  return c.json({
    leaveTypes: results.map((row) => ({
      ...row,
      requiresCredits: row.requiresCredits === 1,
    })),
  })
})

leaves.post("/leave-types", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const body = await readJson(c, leaveTypeInput)
  const id = crypto.randomUUID()
  const code = body.code.toUpperCase()

  try {
    await c.env.DB.prepare(
      `INSERT INTO leave_types (id, school_id, code, name, requires_credits)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        membership.schoolId,
        code,
        body.name,
        body.requiresCredits === false ? 0 : 1,
      )
      .run()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That leave type code already exists")
    }
    throw error
  }

  await audit(c, membership.schoolId, {
    action: "leave_type.create",
    entityType: "leave_type",
    entityId: id,
    meta: { code, name: body.name },
  })

  return c.json(
    {
      leaveType: {
        id,
        schoolId: membership.schoolId,
        code,
        name: body.name,
        requiresCredits: body.requiresCredits ?? true,
      },
    },
    201,
  )
})

leaves.patch("/leave-types/:leaveTypeId", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const body = await readJson(c, leaveTypeInput.partial())
  const leaveTypeId = c.req.param("leaveTypeId")

  const current = await fetchOwnedLeaveType(c, membership.schoolId, leaveTypeId)

  const next = {
    code: body.code ? body.code.toUpperCase() : current.code,
    name: body.name ?? current.name,
    requiresCredits:
      body.requiresCredits === undefined
        ? current.requiresCredits
        : body.requiresCredits
          ? 1
          : 0,
  }

  try {
    await c.env.DB.prepare(
      `UPDATE leave_types
       SET code = ?, name = ?, requires_credits = ?
       WHERE id = ? AND school_id = ?`,
    )
      .bind(next.code, next.name, next.requiresCredits, leaveTypeId, membership.schoolId)
      .run()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That leave type code already exists")
    }
    throw error
  }

  await audit(c, membership.schoolId, {
    action: "leave_type.update",
    entityType: "leave_type",
    entityId: leaveTypeId,
    meta: next,
  })

  return c.json({
    leaveType: { ...current, ...next, requiresCredits: next.requiresCredits === 1 },
  })
})

leaves.delete("/leave-types/:leaveTypeId", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const leaveTypeId = c.req.param("leaveTypeId")

  await fetchOwnedLeaveType(c, membership.schoolId, leaveTypeId)

  try {
    await c.env.DB.prepare(
      `DELETE FROM leave_types WHERE id = ? AND school_id = ?`,
    )
      .bind(leaveTypeId, membership.schoolId)
      .run()
  } catch {
    throw conflict("This leave type is still in use")
  }

  await audit(c, membership.schoolId, {
    action: "leave_type.delete",
    entityType: "leave_type",
    entityId: leaveTypeId,
  })

  return c.json({ ok: true })
})

/* ── Leave credits ───────────────────────────────────────────────────── */

const creditsQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
})

const creditsInput = z.object({
  year: z.number().int().min(2000).max(2100),
  entries: z
    .array(
      z.object({
        leaveTypeId: z.string().min(1),
        earned: z.number().min(0).max(1000),
        used: z.number().min(0).max(1000),
      }),
    )
    .max(50),
})

leaves.get("/employees/:employeeId/leave-credits", async (c) => {
  const membership = await requireSchool(c)
  const employee = await fetchEmployee(c, membership.schoolId, c.req.param("employeeId"))
  const { year } = readQuery(c, creditsQuery)

  const { results } = await c.env.DB.prepare(
    `SELECT lc.id,
            lc.leave_type_id AS leaveTypeId,
            lt.code, lt.name,
            lc.year,
            lc.earned, lc.used,
            lc.updated_at AS updatedAt
     FROM leave_credits lc
     JOIN leave_types lt ON lt.id = lc.leave_type_id
     WHERE lc.employee_id = ? AND lc.year = ?
     ORDER BY lt.code COLLATE NOCASE`,
  )
    .bind(employee.id, year)
    .all()

  return c.json({ credits: results })
})

leaves.put("/employees/:employeeId/leave-credits", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const employee = await fetchEmployee(c, membership.schoolId, c.req.param("employeeId"))
  const body = await readJson(c, creditsInput)

  for (const entry of body.entries) {
    await assertLeaveType(c, membership.schoolId, entry.leaveTypeId)
  }

  if (body.entries.length > 0) {
    await c.env.DB.batch(
      body.entries.map((entry) =>
        c.env.DB.prepare(
          `INSERT INTO leave_credits
             (id, employee_id, leave_type_id, year, earned, used)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (employee_id, leave_type_id, year)
           DO UPDATE SET earned = excluded.earned, used = excluded.used,
                         updated_at = unixepoch()`,
        ).bind(
          crypto.randomUUID(),
          employee.id,
          entry.leaveTypeId,
          body.year,
          entry.earned,
          entry.used,
        ),
      ),
    )
  }

  await audit(c, membership.schoolId, {
    action: "leave_credits.update",
    entityType: "employee",
    entityId: employee.id,
    meta: { year: body.year, count: body.entries.length },
  })

  const { results } = await c.env.DB.prepare(
    `SELECT lc.id,
            lc.leave_type_id AS leaveTypeId,
            lt.code, lt.name,
            lc.year, lc.earned, lc.used,
            lc.updated_at AS updatedAt
     FROM leave_credits lc
     JOIN leave_types lt ON lt.id = lc.leave_type_id
     WHERE lc.employee_id = ? AND lc.year = ?
     ORDER BY lt.code COLLATE NOCASE`,
  )
    .bind(employee.id, body.year)
    .all()

  return c.json({ credits: results })
})

/* ── Leave applications ──────────────────────────────────────────────── */

const applicationInput = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  startDate: dateString,
  endDate: dateString,
  days: z.number().positive().max(366),
  remarks: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(["draft", "submitted"]).optional(),
})

const applicationPatch = z.object({
  leaveTypeId: z.string().min(1).optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  days: z.number().positive().max(366).optional(),
  remarks: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(LEAVE_STATUSES).optional(),
})

const applicationsQuery = z.object({
  employeeId: z.string().optional(),
  status: z.enum(LEAVE_STATUSES).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

type ApplicationRow = {
  id: string
  employeeId: string
  employeeName: string
  leaveTypeId: string
  leaveCode: string
  leaveName: string
  startDate: string
  endDate: string
  days: number
  status: LeaveStatus
  remarks: string | null
  filedAt: number | null
  decidedAt: number | null
  decidedBy: string | null
  createdAt: number
  updatedAt: number
}

const APPLICATION_SELECT = `
  SELECT la.id,
         la.employee_id AS employeeId,
         (e.first_name || ' ' || e.last_name) AS employeeName,
         la.leave_type_id AS leaveTypeId,
         lt.code AS leaveCode,
         lt.name AS leaveName,
         la.start_date AS startDate,
         la.end_date AS endDate,
         la.days, la.status, la.remarks,
         la.filed_at AS filedAt,
         la.decided_at AS decidedAt,
         la.decided_by AS decidedBy,
         la.created_at AS createdAt,
         la.updated_at AS updatedAt
  FROM leave_applications la
  JOIN employees e ON e.id = la.employee_id
  JOIN leave_types lt ON lt.id = la.leave_type_id
`

leaves.get("/leave-applications", async (c) => {
  const membership = await requireSchool(c)
  const query = readQuery(c, applicationsQuery)

  let sql = `${APPLICATION_SELECT} WHERE e.school_id = ?`
  const binds: (string | number)[] = [membership.schoolId]

  if (query.employeeId) {
    sql += " AND la.employee_id = ?"
    binds.push(query.employeeId)
  }
  if (query.status) {
    sql += " AND la.status = ?"
    binds.push(query.status)
  }
  if (query.year) {
    sql += " AND substr(la.start_date, 1, 4) = ?"
    binds.push(String(query.year))
  }

  sql += " ORDER BY la.start_date DESC, la.created_at DESC"

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<ApplicationRow>()

  return c.json({ applications: results })
})

leaves.post("/leave-applications", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const body = await readJson(c, applicationInput)

  await fetchEmployee(c, membership.schoolId, body.employeeId)
  await assertLeaveType(c, membership.schoolId, body.leaveTypeId)

  if (body.endDate < body.startDate) {
    throw new HTTPException(400, { message: "endDate is before startDate" })
  }

  const id = crypto.randomUUID()
  const status = body.status ?? "draft"

  await c.env.DB.prepare(
    `INSERT INTO leave_applications
       (id, employee_id, leave_type_id, start_date, end_date, days, status, remarks, filed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.employeeId,
      body.leaveTypeId,
      body.startDate,
      body.endDate,
      body.days,
      status,
      body.remarks ?? null,
      status === "submitted" ? Math.floor(Date.now() / 1000) : null,
    )
    .run()

  await audit(c, membership.schoolId, {
    action: "leave_application.create",
    entityType: "leave_application",
    entityId: id,
    meta: { employeeId: body.employeeId, startDate: body.startDate, days: body.days },
  })

  const application = await fetchApplication(c, membership.schoolId, id)
  return c.json({ application }, 201)
})

leaves.get("/leave-applications/:applicationId", async (c) => {
  const membership = await requireSchool(c)
  const application = await fetchApplication(
    c,
    membership.schoolId,
    c.req.param("applicationId"),
  )
  return c.json({ application })
})

leaves.patch("/leave-applications/:applicationId", async (c) => {
  const membership = await requireSchool(c, ALL_WRITE_OR_APPROVER)
  const body = await readJson(c, applicationPatch)
  const applicationId = c.req.param("applicationId")

  const current = await fetchApplication(c, membership.schoolId, applicationId)

  if (body.leaveTypeId) {
    await assertLeaveType(c, membership.schoolId, body.leaveTypeId)
  }

  let status = current.status
  if (body.status && body.status !== current.status) {
    if (body.status === "approved" || body.status === "rejected") {
      if (!APPROVER_ROLES.includes(membership.role)) {
        throw new HTTPException(403, { message: "Only an approver can decide this" })
      }
    }
    if (!ALLOWED_TRANSITIONS[current.status].includes(body.status)) {
      throw new HTTPException(409, {
        message: `Cannot move a ${current.status} application to ${body.status}`,
      })
    }
    status = body.status
  }

  const next = {
    leaveTypeId: body.leaveTypeId ?? current.leaveTypeId,
    startDate: body.startDate ?? current.startDate,
    endDate: body.endDate ?? current.endDate,
    days: body.days ?? current.days,
    remarks: body.remarks === undefined ? current.remarks : body.remarks,
  }

  if (next.endDate < next.startDate) {
    throw new HTTPException(400, { message: "endDate is before startDate" })
  }

  const decision =
    status === "approved" || status === "rejected"
      ? { decidedAt: Math.floor(Date.now() / 1000), decidedBy: c.get("authSession").user.id }
      : { decidedAt: current.decidedAt, decidedBy: current.decidedBy }

  await c.env.DB.prepare(
    `UPDATE leave_applications
     SET leave_type_id = ?, start_date = ?, end_date = ?, days = ?, status = ?,
         remarks = ?, filed_at = ?, decided_at = ?, decided_by = ?,
         updated_at = unixepoch()
     WHERE id = ?`,
  )
    .bind(
      next.leaveTypeId,
      next.startDate,
      next.endDate,
      next.days,
      status,
      next.remarks,
      current.filedAt ?? (status === "submitted" ? Math.floor(Date.now() / 1000) : null),
      decision.decidedAt,
      decision.decidedBy,
      applicationId,
    )
    .run()

  if (current.status === "approved") {
    await syncCredits(c, current.employeeId, current.leaveTypeId, current.startDate.slice(0, 4))
  }
  if (status === "approved") {
    await syncCredits(
      c,
      current.employeeId,
      next.leaveTypeId,
      next.startDate.slice(0, 4),
    )
  }

  await audit(c, membership.schoolId, {
    action: "leave_application.update",
    entityType: "leave_application",
    entityId: applicationId,
    meta: { from: current.status, to: status },
  })

  const application = await fetchApplication(c, membership.schoolId, applicationId)
  return c.json({ application })
})

/* ── Helpers ─────────────────────────────────────────────────────────── */

async function assertLeaveType(
  c: { env: AppEnv["Bindings"] },
  schoolId: string,
  leaveTypeId: string,
): Promise<void> {
  const row = await c.env.DB.prepare(
    `SELECT id FROM leave_types
     WHERE id = ? AND (school_id IS NULL OR school_id = ?)`,
  )
    .bind(leaveTypeId, schoolId)
    .first<{ id: string }>()

  if (!row) {
    throw new HTTPException(404, { message: "Leave type not found" })
  }
}

async function fetchOwnedLeaveType(
  c: { env: AppEnv["Bindings"] },
  schoolId: string,
  leaveTypeId: string,
): Promise<LeaveTypeRow> {
  const row = await c.env.DB.prepare(
    `SELECT id, school_id AS schoolId, code, name,
            requires_credits AS requiresCredits, created_at AS createdAt
     FROM leave_types WHERE id = ? AND school_id = ?`,
  )
    .bind(leaveTypeId, schoolId)
    .first<LeaveTypeRow>()

  if (!row) {
    throw new HTTPException(404, {
      message: "Leave type not found (global types cannot be edited)",
    })
  }

  return row
}

async function fetchApplication(
  c: { env: AppEnv["Bindings"] },
  schoolId: string,
  applicationId: string,
): Promise<ApplicationRow> {
  const row = await c.env.DB.prepare(
    `${APPLICATION_SELECT} WHERE la.id = ? AND e.school_id = ?`,
  )
    .bind(applicationId, schoolId)
    .first<ApplicationRow>()

  if (!row) {
    throw new HTTPException(404, { message: "Leave application not found" })
  }

  return row
}

async function syncCredits(
  c: { env: AppEnv["Bindings"] },
  employeeId: string,
  leaveTypeId: string,
  year: string,
): Promise<void> {
  await c.env.DB.prepare(
    `UPDATE leave_credits
     SET used = (
       SELECT COALESCE(SUM(days), 0) FROM leave_applications
       WHERE employee_id = ? AND leave_type_id = ? AND status = 'approved'
         AND substr(start_date, 1, 4) = ?
     ), updated_at = unixepoch()
     WHERE employee_id = ? AND leave_type_id = ? AND year = ?`,
  )
    .bind(employeeId, leaveTypeId, year, employeeId, leaveTypeId, Number(year))
    .run()
}

export default leaves
