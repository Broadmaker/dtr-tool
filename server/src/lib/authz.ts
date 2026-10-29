import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import type { AppEnv } from "../middleware/session"

export const ALL_ROLES = ["ao"] as const

export type SchoolRole = (typeof ALL_ROLES)[number]
export type EffectiveRole = SchoolRole | "system_admin"

export const ADMIN_ROLES: readonly EffectiveRole[] = ["system_admin"]
export const APPROVER_ROLES: readonly EffectiveRole[] = ["ao", "system_admin"]
export const WRITE_ROLES: readonly EffectiveRole[] = ["ao", "system_admin"]

export type Membership = {
  schoolId: string
  role: EffectiveRole
}

type MemberRow = {
  schoolId: string
  role: SchoolRole
  status: string
}

export async function isSystemAdmin(c: Context<AppEnv>): Promise<boolean> {
  const userId = c.get("authSession").user.id
  const row = await c.env.DB.prepare(
    `SELECT 1 AS ok FROM system_admins WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ ok: number }>()
  return row !== null
}

export async function assertSystemAdmin(c: Context<AppEnv>): Promise<void> {
  if (!(await isSystemAdmin(c))) {
    throw new HTTPException(403, { message: "Super admin access required" })
  }
}

export async function requireSchool(
  c: Context<AppEnv>,
  roles: readonly EffectiveRole[] = [...ALL_ROLES, "system_admin"],
): Promise<Membership> {
  const schoolId = c.req.param("schoolId")
  const userId = c.get("authSession").user.id

  if (!schoolId) {
    throw new HTTPException(404, { message: "School not found" })
  }

  if (await isSystemAdmin(c)) {
    const school = await c.env.DB.prepare(`SELECT 1 AS ok FROM schools WHERE id = ?`)
      .bind(schoolId)
      .first<{ ok: number }>()
    if (!school) {
      throw new HTTPException(404, { message: "School not found" })
    }
    if (!roles.includes("system_admin")) {
      throw new HTTPException(403, { message: "Forbidden" })
    }
    return { schoolId, role: "system_admin" }
  }

  const row = await c.env.DB.prepare(
    `SELECT school_id AS schoolId, role, status
     FROM school_members
     WHERE school_id = ? AND user_id = ?`,
  )
    .bind(schoolId, userId)
    .first<MemberRow>()

  if (!row) {
    throw new HTTPException(404, { message: "School not found" })
  }

  if (row.status === "pending") {
    throw new HTTPException(403, { message: "Your school access is pending approval" })
  }
  if (row.status === "rejected") {
    throw new HTTPException(403, { message: "Your school access request was declined" })
  }
  if (row.status === "suspended") {
    throw new HTTPException(403, { message: "Your school access is suspended" })
  }

  if (!roles.includes(row.role)) {
    throw new HTTPException(403, { message: "Forbidden" })
  }

  return { schoolId: row.schoolId, role: row.role }
}
