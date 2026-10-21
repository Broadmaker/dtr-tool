import type { Context } from "hono"
import type { AppEnv } from "../middleware/session"

export type AuditInput = {
  action: string
  entityType: string
  entityId?: string | null
  meta?: unknown
}

export async function audit(
  c: Context<AppEnv>,
  schoolId: string,
  input: AuditInput,
): Promise<void> {
  await c.env.DB.prepare(
    `INSERT INTO audit_log
       (id, school_id, actor_user_id, action, entity_type, entity_id, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      schoolId,
      c.get("authSession").user.id,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.meta === undefined ? null : JSON.stringify(input.meta),
    )
    .run()
}
