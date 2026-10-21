import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { audit } from "../lib/audit"
import { APPROVER_ROLES, requireSchool, WRITE_ROLES } from "../lib/authz"
import {
  conflict,
  dateString,
  isUniqueViolation,
  nullableTime,
  readJson,
  readQuery,
} from "../lib/http"
import { requireSession, type AppEnv } from "../middleware/session"
import { fetchEmployee } from "./employees"

const dtr = new Hono<AppEnv>()

dtr.use("*", requireSession)

const PERIOD_STATUSES = ["draft", "reviewed", "approved", "locked"] as const

type PeriodStatus = (typeof PERIOD_STATUSES)[number]

const ALLOWED_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  draft: ["reviewed", "approved"],
  reviewed: ["draft", "approved"],
  approved: ["reviewed", "locked"],
  locked: [],
}

const PERIOD_SELECT = `
  SELECT p.id,
         p.school_id AS schoolId,
         p.employee_id AS employeeId,
         (e.first_name || ' ' || e.last_name) AS employeeName,
         p.year, p.month, p.status,
         p.locked_at AS lockedAt,
         p.created_at AS createdAt,
         p.updated_at AS updatedAt
  FROM dtr_periods p
  JOIN employees e ON e.id = p.employee_id
`

type PeriodRow = {
  id: string
  schoolId: string
  employeeId: string
  employeeName: string
  year: number
  month: number
  status: PeriodStatus
  lockedAt: number | null
  createdAt: number
  updatedAt: number
}

const periodInput = z.object({
  employeeId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

const periodsQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  employeeId: z.string().optional(),
  status: z.enum(PERIOD_STATUSES).optional(),
})

dtr.get("/dtr-periods", async (c) => {
  const membership = await requireSchool(c)
  const query = readQuery(c, periodsQuery)

  let sql = `${PERIOD_SELECT} WHERE p.school_id = ?`
  const binds: (string | number)[] = [membership.schoolId]

  if (query.year) {
    sql += " AND p.year = ?"
    binds.push(query.year)
  }
  if (query.month) {
    sql += " AND p.month = ?"
    binds.push(query.month)
  }
  if (query.employeeId) {
    sql += " AND p.employee_id = ?"
    binds.push(query.employeeId)
  }
  if (query.status) {
    sql += " AND p.status = ?"
    binds.push(query.status)
  }

  sql += " ORDER BY p.year DESC, p.month DESC, e.last_name COLLATE NOCASE"

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<PeriodRow>()

  return c.json({ periods: results })
})

dtr.post("/dtr-periods", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const body = await readJson(c, periodInput)

  await fetchEmployee(c, membership.schoolId, body.employeeId)

  const id = crypto.randomUUID()

  try {
    await c.env.DB.prepare(
      `INSERT INTO dtr_periods (id, school_id, employee_id, year, month)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(id, membership.schoolId, body.employeeId, body.year, body.month)
      .run()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That period already exists for this employee")
    }
    throw error
  }

  await audit(c, membership.schoolId, {
    action: "dtr_period.create",
    entityType: "dtr_period",
    entityId: id,
    meta: { employeeId: body.employeeId, year: body.year, month: body.month },
  })

  const period = await fetchPeriod(c, membership.schoolId, id)
  return c.json({ period }, 201)
})

dtr.get("/dtr-periods/:periodId", async (c) => {
  const membership = await requireSchool(c)
  const period = await fetchPeriod(c, membership.schoolId, c.req.param("periodId"))
  return c.json({ period })
})

const periodPatch = z.object({
  status: z.enum(PERIOD_STATUSES),
})

dtr.patch("/dtr-periods/:periodId", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const body = await readJson(c, periodPatch)
  const periodId = c.req.param("periodId")

  const current = await fetchPeriod(c, membership.schoolId, periodId)

  if (body.status !== current.status) {
    if (body.status === "approved" || body.status === "locked") {
      if (!APPROVER_ROLES.includes(membership.role)) {
        throw new HTTPException(403, {
          message: "Only an approver can approve or lock a period",
        })
      }
    }
    if (!ALLOWED_TRANSITIONS[current.status].includes(body.status)) {
      throw new HTTPException(409, {
        message: `Cannot move a ${current.status} period to ${body.status}`,
      })
    }
  }

  await c.env.DB.prepare(
    `UPDATE dtr_periods
     SET status = ?, locked_at = ?, updated_at = unixepoch()
     WHERE id = ?`,
  )
    .bind(
      body.status,
      body.status === "locked" ? Math.floor(Date.now() / 1000) : null,
      periodId,
    )
    .run()

  await audit(c, membership.schoolId, {
    action: "dtr_period.status",
    entityType: "dtr_period",
    entityId: periodId,
    meta: { from: current.status, to: body.status },
  })

  const period = await fetchPeriod(c, membership.schoolId, periodId)
  return c.json({ period })
})

dtr.delete("/dtr-periods/:periodId", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const periodId = c.req.param("periodId")

  const period = await fetchPeriod(c, membership.schoolId, periodId)

  if (period.status !== "draft") {
    throw new HTTPException(409, {
      message: "Only draft periods can be deleted",
    })
  }

  await c.env.DB.prepare(`DELETE FROM dtr_periods WHERE id = ?`)
    .bind(periodId)
    .run()

  await audit(c, membership.schoolId, {
    action: "dtr_period.delete",
    entityType: "dtr_period",
    entityId: periodId,
    meta: { employeeId: period.employeeId, year: period.year, month: period.month },
  })

  return c.json({ ok: true })
})

const DAY_SELECT = `
  SELECT id,
         period_id AS periodId,
         work_date AS workDate,
         am_in AS amIn, am_out AS amOut,
         pm_in AS pmIn, pm_out AS pmOut,
         day_type AS dayType,
         leave_application_id AS leaveApplicationId,
         remarks, source,
         created_at AS createdAt,
         updated_at AS updatedAt
  FROM dtr_days
`

type DayRow = {
  id: string
  periodId: string
  workDate: string
  amIn: string | null
  amOut: string | null
  pmIn: string | null
  pmOut: string | null
  dayType: string
  leaveApplicationId: string | null
  remarks: string | null
  source: string
  createdAt: number
  updatedAt: number
}

dtr.get("/dtr-periods/:periodId/days", async (c) => {
  const membership = await requireSchool(c)
  const periodId = c.req.param("periodId")

  await fetchPeriod(c, membership.schoolId, periodId)

  const { results } = await c.env.DB.prepare(
    `${DAY_SELECT} WHERE period_id = ? ORDER BY work_date`,
  )
    .bind(periodId)
    .all<DayRow>()

  return c.json({ days: results })
})

const dayInput = z.object({
  workDate: dateString,
  amIn: nullableTime.optional(),
  amOut: nullableTime.optional(),
  pmIn: nullableTime.optional(),
  pmOut: nullableTime.optional(),
  dayType: z.enum(["work", "holiday", "leave", "weekend", "half_day"]).optional(),
  leaveApplicationId: z.string().nullable().optional(),
  remarks: z.string().trim().max(500).nullable().optional(),
  source: z.enum(["import", "manual", "correction"]).optional(),
})

const daysInput = z.object({
  days: z.array(dayInput).max(31),
})

dtr.put("/dtr-periods/:periodId/days", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const period = await fetchPeriod(c, membership.schoolId, c.req.param("periodId"))
  const body = await readJson(c, daysInput)

  if (period.status === "locked") {
    throw new HTTPException(409, { message: "This period is locked" })
  }

  const prefix = `${period.year}-${String(period.month).padStart(2, "0")}`

  for (const day of body.days) {
    if (!day.workDate.startsWith(prefix)) {
      throw new HTTPException(400, {
        message: `${day.workDate} is outside the period month`,
      })
    }
  }

  if (body.days.length > 0) {
    await c.env.DB.batch(
      body.days.map((day) =>
        c.env.DB.prepare(
          `INSERT INTO dtr_days
             (id, period_id, work_date, am_in, am_out, pm_in, pm_out,
              day_type, leave_application_id, remarks, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (period_id, work_date) DO UPDATE SET
             am_in = excluded.am_in,
             am_out = excluded.am_out,
             pm_in = excluded.pm_in,
             pm_out = excluded.pm_out,
             day_type = excluded.day_type,
             leave_application_id = excluded.leave_application_id,
             remarks = excluded.remarks,
             source = excluded.source,
             updated_at = unixepoch()`,
        ).bind(
          crypto.randomUUID(),
          period.id,
          day.workDate,
          day.amIn ?? null,
          day.amOut ?? null,
          day.pmIn ?? null,
          day.pmOut ?? null,
          day.dayType ?? "work",
          day.leaveApplicationId ?? null,
          day.remarks ?? null,
          day.source ?? "import",
        ),
      ),
    )
  }

  await c.env.DB.prepare(
    `UPDATE dtr_periods SET updated_at = unixepoch() WHERE id = ?`,
  )
    .bind(period.id)
    .run()

  await audit(c, membership.schoolId, {
    action: "dtr_days.upsert",
    entityType: "dtr_period",
    entityId: period.id,
    meta: { count: body.days.length },
  })

  const { results } = await c.env.DB.prepare(
    `${DAY_SELECT} WHERE period_id = ? ORDER BY work_date`,
  )
    .bind(period.id)
    .all<DayRow>()

  return c.json({ days: results })
})

dtr.delete("/dtr-periods/:periodId/days/:workDate", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const period = await fetchPeriod(c, membership.schoolId, c.req.param("periodId"))
  const workDate = c.req.param("workDate")

  if (period.status === "locked") {
    throw new HTTPException(409, { message: "This period is locked" })
  }

  await c.env.DB.prepare(
    `DELETE FROM dtr_days WHERE period_id = ? AND work_date = ?`,
  )
    .bind(period.id, workDate)
    .run()

  await audit(c, membership.schoolId, {
    action: "dtr_day.delete",
    entityType: "dtr_period",
    entityId: period.id,
    meta: { workDate },
  })

  return c.json({ ok: true })
})

async function fetchPeriod(
  c: { env: AppEnv["Bindings"] },
  schoolId: string,
  periodId: string,
): Promise<PeriodRow> {
  const row = await c.env.DB.prepare(
    `${PERIOD_SELECT} WHERE p.id = ? AND p.school_id = ?`,
  )
    .bind(periodId, schoolId)
    .first<PeriodRow>()

  if (!row) {
    throw new HTTPException(404, { message: "DTR period not found" })
  }

  return row
}

export default dtr
