import { env, SELF } from 'cloudflare:test'
import { expect } from 'vitest'

export const ORIGIN = 'http://example.com'
export const PASSWORD = 'password123'

export type SignedInUser = { id: string; cookie: string }

function cookieHeader(response: Response): string {
  const setCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie') ?? '']

  return setCookies
    .map((value) => value.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ')
}

export async function signUp(
  name: string,
  email = `user-${crypto.randomUUID()}@example.com`,
): Promise<SignedInUser> {
  const response = await SELF.fetch(`${ORIGIN}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ name, email, password: PASSWORD }),
  })

  expect(response.status).toBe(200)
  const body = await response.json<{ user: { id: string } }>()
  return { id: body.user.id, cookie: cookieHeader(response) }
}

export async function makeSystemAdmin(userId: string): Promise<void> {
  await env.DB.prepare(`INSERT INTO system_admins (user_id) VALUES (?)`)
    .bind(userId)
    .run()
}

export async function insertUser(
  id: string,
  name: string,
  email: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
     VALUES (?, ?, ?, 1, ?, ?)`,
  )
    .bind(id, name, email, new Date().toISOString(), new Date().toISOString())
    .run()
}

export async function insertSchool(
  id: string,
  name: string,
  code: string | null = null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO schools (id, name, school_code) VALUES (?, ?, ?)`,
  )
    .bind(id, name, code)
    .run()
}

export async function insertMember(
  id: string,
  schoolId: string,
  userId: string,
  role: string,
  status = 'active',
  createdAt = 0,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO school_members (id, school_id, user_id, role, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, schoolId, userId, role, status, createdAt)
    .run()
}

export async function insertEmployee(
  id: string,
  schoolId: string,
  firstName: string,
  lastName: string,
  options: {
    employeeNo?: string | null
    position?: string | null
    isActive?: boolean
  } = {},
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO employees
       (id, school_id, employee_no, first_name, last_name, position, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      schoolId,
      options.employeeNo ?? null,
      firstName,
      lastName,
      options.position ?? null,
      options.isActive === false ? 0 : 1,
    )
    .run()
}

type RequestOptions = {
  method?: string
  cookie?: string
  body?: unknown
}

export function api(
  path: string,
  { method = 'GET', cookie, body }: RequestOptions = {},
): Promise<Response> {
  const headers: Record<string, string> = {}
  if (cookie) headers.Cookie = cookie
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  return SELF.fetch(`${ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function get(path: string, cookie: string): Promise<Response> {
  return api(path, { cookie })
}

export function post(
  path: string,
  cookie: string,
  body: unknown,
): Promise<Response> {
  return api(path, { method: 'POST', cookie, body })
}

export function patch(
  path: string,
  cookie: string,
  body: unknown,
): Promise<Response> {
  return api(path, { method: 'PATCH', cookie, body })
}

export function put(
  path: string,
  cookie: string,
  body: unknown,
): Promise<Response> {
  return api(path, { method: 'PUT', cookie, body })
}

export function del(path: string, cookie: string): Promise<Response> {
  return api(path, { method: 'DELETE', cookie })
}

/**
 * Clears school-owned data but keeps accounts and sessions, so a suite can
 * create its actors once in `beforeAll` and reset the workspace per test.
 */
export async function resetDomainData(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM audit_log`),
    env.DB.prepare(`DELETE FROM system_admins`),
    env.DB.prepare(`DELETE FROM dtr_days`),
    env.DB.prepare(`DELETE FROM dtr_periods`),
    env.DB.prepare(`DELETE FROM leave_credits`),
    env.DB.prepare(`DELETE FROM leave_applications`),
    env.DB.prepare(`DELETE FROM official_travels`),
    env.DB.prepare(`DELETE FROM holidays`),
    env.DB.prepare(`DELETE FROM employees`),
    env.DB.prepare(`DELETE FROM leave_types WHERE school_id IS NOT NULL`),
    env.DB.prepare(`DELETE FROM school_members`),
    env.DB.prepare(`DELETE FROM schools`),
  ])
}

export async function resetDatabase(): Promise<void> {
  await resetDomainData()
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM session`),
    env.DB.prepare(`DELETE FROM account`),
    env.DB.prepare(`DELETE FROM verification`),
    env.DB.prepare(`DELETE FROM user`),
  ])
}
