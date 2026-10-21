import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { audit } from "../lib/audit"
import { requireSchool, WRITE_ROLES } from "../lib/authz"
import { dateString, readJson, readQuery } from "../lib/http"
import { requireSession, type AppEnv } from "../middleware/session"
import { fetchEmployee } from "./employees"

const travels = new Hono<AppEnv>()

travels.use("*", requireSession)

const TRAVEL_STATUSES = ["planned", "approved", "completed", "cancelled"] as const

type TravelStatus = (typeof TRAVEL_STATUSES)[number]

const travelInput = z.object({
  employeeId: z.string().min(1),
  referenceNo: z.string().trim().max(80).nullable().optional(),
  destination: z.string().trim().min(1).max(200),
  purpose: z.string().trim().max(500).nullable().optional(),
  startDate: dateString,
  endDate: dateString,
  days: z.number().positive().max(366),
  status: z.enum(TRAVEL_STATUSES).optional(),
  remarks: z.string().trim().max(1000).nullable().optional(),
})

const travelPatch = travelInput.partial()

const travelQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  employeeId: z.string().optional(),
  status: z.enum(TRAVEL_STATUSES).optional(),
})

type TravelRow = {
  id: string
  schoolId: string
  employeeId: string
  employeeName: string
  referenceNo: string | null
  destination: string
  purpose: string | null
  startDate: string
  endDate: string
  days: number
  status: TravelStatus
  remarks: string | null
  createdAt: number
  updatedAt: number
}

const TRAVEL_SELECT = `
  SELECT t.id,
         t.school_id AS schoolId,
         t.employee_id AS employeeId,
         (e.first_name || ' ' || e.last_name) AS employeeName,
         t.reference_no AS referenceNo,
         t.destination,
         t.purpose,
         t.start_date AS startDate,
         t.end_date AS endDate,
         t.days,
         t.status,
         t.remarks,
         t.created_at AS createdAt,
         t.updated_at AS updatedAt
  FROM official_travels t
  JOIN employees e ON e.id = t.employee_id
`

travels.get("/", async (c) => {
  const membership = await requireSchool(c)
  const query = readQuery(c, travelQuery)

  let sql = `${TRAVEL_SELECT} WHERE t.school_id = ?`
  const binds: (string | number)[] = [membership.schoolId]

  if (query.employeeId) {
    sql += " AND t.employee_id = ?"
    binds.push(query.employeeId)
  }
  if (query.status) {
    sql += " AND t.status = ?"
    binds.push(query.status)
  }
  if (query.year) {
    sql += " AND substr(t.start_date, 1, 4) = ?"
    binds.push(String(query.year))
  }

  sql += " ORDER BY t.start_date DESC, t.created_at DESC"

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<TravelRow>()

  return c.json({ travels: results })
})

travels.post("/", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const body = await readJson(c, travelInput)

  await fetchEmployee(c, membership.schoolId, body.employeeId)

  if (body.endDate < body.startDate) {
    throw new HTTPException(400, { message: "endDate is before startDate" })
  }

  const id = crypto.randomUUID()
  const status = body.status ?? "planned"

  await c.env.DB.prepare(
    `INSERT INTO official_travels
       (id, school_id, employee_id, reference_no, destination, purpose,
        start_date, end_date, days, status, remarks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      membership.schoolId,
      body.employeeId,
      body.referenceNo ?? null,
      body.destination,
      body.purpose ?? null,
      body.startDate,
      body.endDate,
      body.days,
      status,
      body.remarks ?? null,
    )
    .run()

  await audit(c, membership.schoolId, {
    action: "official_travel.create",
    entityType: "official_travel",
    entityId: id,
    meta: {
      employeeId: body.employeeId,
      destination: body.destination,
      startDate: body.startDate,
      days: body.days,
    },
  })

  const travel = await fetchTravel(c, membership.schoolId, id)
  return c.json({ travel }, 201)
})

travels.patch("/:travelId", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const body = await readJson(c, travelPatch)
  const travelId = c.req.param("travelId")
  const current = await fetchTravel(c, membership.schoolId, travelId)

  if (body.employeeId) {
    await fetchEmployee(c, membership.schoolId, body.employeeId)
  }

  const next = {
    employeeId: body.employeeId ?? current.employeeId,
    referenceNo: body.referenceNo === undefined ? current.referenceNo : body.referenceNo,
    destination: body.destination ?? current.destination,
    purpose: body.purpose === undefined ? current.purpose : body.purpose,
    startDate: body.startDate ?? current.startDate,
    endDate: body.endDate ?? current.endDate,
    days: body.days ?? current.days,
    status: body.status ?? current.status,
    remarks: body.remarks === undefined ? current.remarks : body.remarks,
  }

  if (next.endDate < next.startDate) {
    throw new HTTPException(400, { message: "endDate is before startDate" })
  }

  await c.env.DB.prepare(
    `UPDATE official_travels
     SET employee_id = ?, reference_no = ?, destination = ?, purpose = ?,
         start_date = ?, end_date = ?, days = ?, status = ?, remarks = ?,
         updated_at = unixepoch()
     WHERE id = ? AND school_id = ?`,
  )
    .bind(
      next.employeeId,
      next.referenceNo,
      next.destination,
      next.purpose,
      next.startDate,
      next.endDate,
      next.days,
      next.status,
      next.remarks,
      travelId,
      membership.schoolId,
    )
    .run()

  await audit(c, membership.schoolId, {
    action: "official_travel.update",
    entityType: "official_travel",
    entityId: travelId,
    meta: { from: current.status, to: next.status },
  })

  const travel = await fetchTravel(c, membership.schoolId, travelId)
  return c.json({ travel })
})

travels.delete("/:travelId", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const travelId = c.req.param("travelId")
  const travel = await fetchTravel(c, membership.schoolId, travelId)

  await c.env.DB.prepare(
    `DELETE FROM official_travels WHERE id = ? AND school_id = ?`,
  )
    .bind(travelId, membership.schoolId)
    .run()

  await audit(c, membership.schoolId, {
    action: "official_travel.delete",
    entityType: "official_travel",
    entityId: travelId,
    meta: { destination: travel.destination, startDate: travel.startDate },
  })

  return c.json({ ok: true })
})

async function fetchTravel(
  c: { env: AppEnv["Bindings"] },
  schoolId: string,
  travelId: string,
): Promise<TravelRow> {
  const row = await c.env.DB.prepare(
    `${TRAVEL_SELECT} WHERE t.id = ? AND t.school_id = ?`,
  )
    .bind(travelId, schoolId)
    .first<TravelRow>()

  if (!row) {
    throw new HTTPException(404, { message: "Official travel not found" })
  }

  return row
}

export default travels
