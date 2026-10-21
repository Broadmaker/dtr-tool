import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { audit } from "../lib/audit"
import { requireSchool, WRITE_ROLES } from "../lib/authz"
import {
  conflict,
  dateString,
  isUniqueViolation,
  readJson,
  readQuery,
} from "../lib/http"
import { requireSession, type AppEnv } from "../middleware/session"

const holidays = new Hono<AppEnv>()

holidays.use("*", requireSession)

const holidayInput = z.object({
  holidayDate: dateString,
  name: z.string().trim().min(1).max(200),
  type: z.enum(["regular", "special", "local"]),
})

const listQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

type HolidayRow = {
  id: string
  schoolId: string | null
  holidayDate: string
  name: string
  type: string
  createdAt: number
}

const HOLIDAY_COLUMNS = `
  h.id,
  h.school_id AS schoolId,
  h.holiday_date AS holidayDate,
  h.name,
  h.type,
  h.created_at AS createdAt
`

holidays.get("/", async (c) => {
  const membership = await requireSchool(c)
  const { year } = readQuery(c, listQuery)

  let sql = `SELECT ${HOLIDAY_COLUMNS} FROM holidays h
             WHERE (h.school_id = ? OR h.school_id IS NULL)`
  const binds: (string | number)[] = [membership.schoolId]

  if (year) {
    sql += " AND h.holiday_date >= ? AND h.holiday_date <= ?"
    binds.push(`${year}-01-01`, `${year}-12-31`)
  }

  sql += " ORDER BY h.holiday_date, h.name COLLATE NOCASE"

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<HolidayRow>()

  return c.json({ holidays: results })
})

holidays.post("/", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const body = await readJson(c, holidayInput)
  const id = crypto.randomUUID()

  try {
    await c.env.DB.prepare(
      `INSERT INTO holidays (id, school_id, holiday_date, name, type)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(id, membership.schoolId, body.holidayDate, body.name, body.type)
      .run()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That holiday is already recorded")
    }
    throw error
  }

  await audit(c, membership.schoolId, {
    action: "holiday.create",
    entityType: "holiday",
    entityId: id,
    meta: body,
  })

  return c.json(
    {
      holiday: {
        id,
        schoolId: membership.schoolId,
        ...body,
      },
    },
    201,
  )
})

holidays.patch("/:holidayId", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const body = await readJson(c, holidayInput.partial())
  const holidayId = c.req.param("holidayId")

  const current = await fetchHoliday(c, membership.schoolId, holidayId)

  const next = {
    holidayDate: body.holidayDate ?? current.holidayDate,
    name: body.name ?? current.name,
    type: body.type ?? current.type,
  }

  try {
    await c.env.DB.prepare(
      `UPDATE holidays
       SET holiday_date = ?, name = ?, type = ?
       WHERE id = ? AND school_id = ?`,
    )
      .bind(
        next.holidayDate,
        next.name,
        next.type,
        holidayId,
        membership.schoolId,
      )
      .run()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That holiday is already recorded")
    }
    throw error
  }

  await audit(c, membership.schoolId, {
    action: "holiday.update",
    entityType: "holiday",
    entityId: holidayId,
    meta: next,
  })

  return c.json({ holiday: { ...current, ...next } })
})

holidays.delete("/:holidayId", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const holidayId = c.req.param("holidayId")

  const holiday = await fetchHoliday(c, membership.schoolId, holidayId)

  await c.env.DB.prepare(
    `DELETE FROM holidays WHERE id = ? AND school_id = ?`,
  )
    .bind(holidayId, membership.schoolId)
    .run()

  await audit(c, membership.schoolId, {
    action: "holiday.delete",
    entityType: "holiday",
    entityId: holidayId,
    meta: { holidayDate: holiday.holidayDate, name: holiday.name },
  })

  return c.json({ ok: true })
})

async function fetchHoliday(
  c: { env: AppEnv["Bindings"] },
  schoolId: string,
  holidayId: string,
): Promise<HolidayRow> {
  const row = await c.env.DB.prepare(
    `SELECT ${HOLIDAY_COLUMNS} FROM holidays h
     WHERE h.id = ? AND h.school_id = ?`,
  )
    .bind(holidayId, schoolId)
    .first<HolidayRow>()

  if (!row) {
    throw new HTTPException(404, { message: "Holiday not found" })
  }

  return row
}

export default holidays
