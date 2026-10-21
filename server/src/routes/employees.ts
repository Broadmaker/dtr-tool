import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { audit } from "../lib/audit"
import { requireSchool, WRITE_ROLES } from "../lib/authz"
import { conflict, isUniqueViolation, readJson } from "../lib/http"
import { requireSession, type AppEnv } from "../middleware/session"

const employees = new Hono<AppEnv>()

employees.use("*", requireSession)

const employeeInput = z.object({
  employeeNo: z.string().trim().max(50).nullable().optional(),
  firstName: z.string().trim().min(1).max(120),
  middleName: z.string().trim().max(120).nullable().optional(),
  lastName: z.string().trim().min(1).max(120),
  suffix: z.string().trim().max(20).nullable().optional(),
  position: z.string().trim().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
})

type EmployeeRow = {
  id: string
  schoolId: string
  employeeNo: string | null
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  position: string | null
  isActive: number
  createdAt: number
  updatedAt: number
}

const EMPLOYEE_COLUMNS = `
  e.id,
  e.school_id AS schoolId,
  e.employee_no AS employeeNo,
  e.first_name AS firstName,
  e.middle_name AS middleName,
  e.last_name AS lastName,
  e.suffix,
  e.position,
  e.is_active AS isActive,
  e.created_at AS createdAt,
  e.updated_at AS updatedAt
`

function serialize(row: EmployeeRow) {
  return { ...row, isActive: row.isActive === 1 }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

employees.get("/", async (c) => {
  const membership = await requireSchool(c)
  const search = c.req.query("search")?.trim()
  const includeInactive = c.req.query("includeInactive") === "true"

  let sql = `SELECT ${EMPLOYEE_COLUMNS} FROM employees e WHERE e.school_id = ?`
  const binds: (string | number)[] = [membership.schoolId]

  if (!includeInactive) {
    sql += " AND e.is_active = 1"
  }

  if (search) {
    sql +=
      " AND (e.first_name LIKE ? ESCAPE '\\' OR e.last_name LIKE ? ESCAPE '\\' OR e.employee_no LIKE ? ESCAPE '\\')"
    const like = `%${escapeLike(search)}%`
    binds.push(like, like, like)
  }

  sql += " ORDER BY e.last_name COLLATE NOCASE, e.first_name COLLATE NOCASE"

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<EmployeeRow>()

  return c.json({ employees: results.map(serialize) })
})

employees.post("/", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const body = await readJson(c, employeeInput)
  const id = crypto.randomUUID()

  try {
    await c.env.DB.prepare(
      `INSERT INTO employees
         (id, school_id, employee_no, first_name, middle_name, last_name, suffix, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        membership.schoolId,
        body.employeeNo ?? null,
        body.firstName,
        body.middleName ?? null,
        body.lastName,
        body.suffix ?? null,
        body.position ?? null,
      )
      .run()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That employee number is already in use")
    }
    throw error
  }

  await audit(c, membership.schoolId, {
    action: "employee.create",
    entityType: "employee",
    entityId: id,
    meta: { name: `${body.firstName} ${body.lastName}` },
  })

  const created = await fetchEmployee(c, membership.schoolId, id)
  return c.json({ employee: serialize(created) }, 201)
})

employees.get("/:employeeId", async (c) => {
  const membership = await requireSchool(c)
  const employee = await fetchEmployee(
    c,
    membership.schoolId,
    c.req.param("employeeId"),
  )
  return c.json({ employee: serialize(employee) })
})

employees.patch("/:employeeId", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const body = await readJson(c, employeeInput.partial())
  const employeeId = c.req.param("employeeId")

  const current = await fetchEmployee(c, membership.schoolId, employeeId)

  const next = {
    employeeNo:
      body.employeeNo === undefined ? current.employeeNo : body.employeeNo,
    firstName: body.firstName ?? current.firstName,
    middleName:
      body.middleName === undefined ? current.middleName : body.middleName,
    lastName: body.lastName ?? current.lastName,
    suffix: body.suffix === undefined ? current.suffix : body.suffix,
    position: body.position === undefined ? current.position : body.position,
    isActive:
      body.isActive === undefined
        ? current.isActive
        : body.isActive
          ? 1
          : 0,
  }

  try {
    await c.env.DB.prepare(
      `UPDATE employees
       SET employee_no = ?, first_name = ?, middle_name = ?, last_name = ?,
           suffix = ?, position = ?, is_active = ?, updated_at = unixepoch()
       WHERE id = ? AND school_id = ?`,
    )
      .bind(
        next.employeeNo,
        next.firstName,
        next.middleName,
        next.lastName,
        next.suffix,
        next.position,
        next.isActive,
        employeeId,
        membership.schoolId,
      )
      .run()
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That employee number is already in use")
    }
    throw error
  }

  await audit(c, membership.schoolId, {
    action: "employee.update",
    entityType: "employee",
    entityId: employeeId,
    meta: next,
  })

  const updated = await fetchEmployee(c, membership.schoolId, employeeId)
  return c.json({ employee: serialize(updated) })
})

employees.delete("/:employeeId", async (c) => {
  const membership = await requireSchool(c, WRITE_ROLES)
  const employeeId = c.req.param("employeeId")

  const employee = await fetchEmployee(c, membership.schoolId, employeeId)

  if (!employee.isActive) {
    return c.json({ ok: true, deactivated: true })
  }

  await c.env.DB.prepare(
    `UPDATE employees SET is_active = 0, updated_at = unixepoch()
     WHERE id = ? AND school_id = ?`,
  )
    .bind(employeeId, membership.schoolId)
    .run()

  await audit(c, membership.schoolId, {
    action: "employee.deactivate",
    entityType: "employee",
    entityId: employeeId,
    meta: { name: `${employee.firstName} ${employee.lastName}` },
  })

  return c.json({ ok: true, deactivated: true })
})

async function fetchEmployee(
  c: { env: AppEnv["Bindings"] },
  schoolId: string,
  employeeId: string,
): Promise<EmployeeRow> {
  const row = await c.env.DB.prepare(
    `SELECT ${EMPLOYEE_COLUMNS} FROM employees e
     WHERE e.id = ? AND e.school_id = ?`,
  )
    .bind(employeeId, schoolId)
    .first<EmployeeRow>()

  if (!row) {
    throw new HTTPException(404, { message: "Employee not found" })
  }

  return row
}

export { fetchEmployee }
export default employees
