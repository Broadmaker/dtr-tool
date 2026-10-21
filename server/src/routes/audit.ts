import { Hono } from "hono"
import { z } from "zod"
import { APPROVER_ROLES, requireSchool } from "../lib/authz"
import { readQuery } from "../lib/http"
import { requireSession, type AppEnv } from "../middleware/session"

const auditLog = new Hono<AppEnv>()

auditLog.use("*", requireSession)

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().optional(),
})

type AuditRow = {
  id: string
  actorUserId: string
  actorName: string | null
  action: string
  entityType: string
  entityId: string | null
  metaJson: string | null
  createdAt: number
}

auditLog.get("/:schoolId/audit-log", async (c) => {
  const membership = await requireSchool(c, APPROVER_ROLES)
  const query = readQuery(c, listQuery)

  let sql = `SELECT a.id,
                    a.actor_user_id AS actorUserId,
                    u.name AS actorName,
                    a.action,
                    a.entity_type AS entityType,
                    a.entity_id AS entityId,
                    a.meta_json AS metaJson,
                    a.created_at AS createdAt
             FROM audit_log a
             LEFT JOIN user u ON u.id = a.actor_user_id
             WHERE a.school_id = ?`
  const binds: (string | number)[] = [membership.schoolId]

  if (query.before) {
    sql += " AND a.created_at < ?"
    binds.push(query.before)
  }

  sql += " ORDER BY a.created_at DESC LIMIT ?"
  binds.push(query.limit)

  const { results } = await c.env.DB.prepare(sql)
    .bind(...binds)
    .all<AuditRow>()

  return c.json({
    entries: results.map((row) => ({
      ...row,
      meta: row.metaJson ? JSON.parse(row.metaJson) : null,
      metaJson: undefined,
    })),
  })
})

export default auditLog
