import { env, SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  get,
  insertMember,
  insertSchool,
  insertUser,
  makeSystemAdmin,
  ORIGIN,
  resetDatabase,
  signUp,
  type SignedInUser,
} from './helpers'

type MembershipBody = {
  memberships: {
    id: string
    name: string
    email: string
    schoolId: string
    schoolName: string
    role: string
    status: string
  }[]
  total: number
  counts: Record<string, number>
}

describe('admin memberships', () => {
  let admin: SignedInUser

  beforeEach(async () => {
    await resetDatabase()
    admin = await signUp('System Admin', `admin-${crypto.randomUUID()}@example.com`)
    await makeSystemAdmin(admin.id)

    await insertUser('u-ana', 'Ana Cruz', 'ana@example.com')
    await insertUser('u-ben', 'Ben Reyes', 'ben@example.com')
    await insertUser('u-cara', 'Cara Lim', 'cara@example.com')
    await insertUser('u-dan', 'Dan Tan', 'dan@example.com')

    await insertSchool('s-1', 'Alpha_One High School', '100001')
    await insertSchool('s-2', 'Beta Elementary', '100002')

    await insertMember('m-1', 's-1', 'u-ana', 'ao', 'pending', 100)
    await insertMember('m-2', 's-1', 'u-ben', 'admin', 'active', 200)
    await insertMember('m-3', 's-2', 'u-cara', 'ao', 'active', 300)
    await insertMember('m-4', 's-2', 'u-dan', 'viewer', 'rejected', 400)
  })

  it('rejects unauthenticated callers', async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/admin/memberships`)
    expect(response.status).toBe(401)
  })

  it('rejects non-system-admins', async () => {
    const user = await signUp('Regular User', `user-${crypto.randomUUID()}@example.com`)
    const response = await get('/api/admin/memberships', user.cookie)
    expect(response.status).toBe(403)
  })

  it('lists every membership with status counts', async () => {
    const response = await get('/api/admin/memberships', admin.cookie)
    expect(response.status).toBe(200)

    const body = await response.json<MembershipBody>()
    expect(body.total).toBe(4)
    expect(body.counts).toEqual({ pending: 1, active: 2, rejected: 1, suspended: 0, all: 4 })
    expect(body.memberships.map((row) => row.id)).toEqual(['m-1', 'm-3', 'm-2', 'm-4'])
  })

  it('filters by status while keeping tab counts', async () => {
    const response = await get('/api/admin/memberships?status=pending', admin.cookie)
    const body = await response.json<MembershipBody>()

    expect(body.total).toBe(1)
    expect(body.memberships.map((row) => row.id)).toEqual(['m-1'])
    expect(body.counts).toEqual({ pending: 1, active: 2, rejected: 1, suspended: 0, all: 4 })
  })

  it('filters by role, school, and search text', async () => {
    const byRole = await get('/api/admin/memberships?role=admin', admin.cookie)
    expect((await byRole.json<MembershipBody>()).memberships.map((row) => row.id)).toEqual(['m-2'])

    const bySchool = await get('/api/admin/memberships?schoolId=s-2', admin.cookie)
    expect((await bySchool.json<MembershipBody>()).memberships.map((row) => row.id)).toEqual([
      'm-3',
      'm-4',
    ])

    const bySearch = await get('/api/admin/memberships?q=cara', admin.cookie)
    expect((await bySearch.json<MembershipBody>()).memberships.map((row) => row.id)).toEqual(['m-3'])

    const byCode = await get('/api/admin/memberships?q=100002', admin.cookie)
    expect((await byCode.json<MembershipBody>()).memberships.map((row) => row.id)).toEqual([
      'm-3',
      'm-4',
    ])
  })

  it('treats LIKE wildcards as literal characters', async () => {
    const literal = await get('/api/admin/memberships?q=Alpha_One', admin.cookie)
    expect((await literal.json<MembershipBody>()).total).toBe(2)

    const wildcard = await get('/api/admin/memberships?q=AlphaXOne', admin.cookie)
    expect((await wildcard.json<MembershipBody>()).total).toBe(0)
  })

  it('paginates with limit and offset', async () => {
    const first = await get('/api/admin/memberships?limit=2&offset=0', admin.cookie)
    const firstBody = await first.json<MembershipBody>()
    expect(firstBody.total).toBe(4)
    expect(firstBody.memberships.map((row) => row.id)).toEqual(['m-1', 'm-3'])

    const second = await get('/api/admin/memberships?limit=2&offset=2', admin.cookie)
    const secondBody = await second.json<MembershipBody>()
    expect(secondBody.total).toBe(4)
    expect(secondBody.memberships.map((row) => row.id)).toEqual(['m-2', 'm-4'])
  })

  it('approves a membership and records an audit event', async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/admin/memberships/m-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie },
      body: JSON.stringify({ status: 'active' }),
    })
    expect(response.status).toBe(200)

    const membership = await env.DB.prepare(
      `SELECT status FROM school_members WHERE id = 'm-1'`,
    ).first<{ status: string }>()
    expect(membership?.status).toBe('active')

    const audit = await env.DB.prepare(
      `SELECT action, entity_type AS entityType FROM audit_log WHERE entity_id = 'm-1'`,
    ).first<{ action: string; entityType: string }>()
    expect(audit).toEqual({ action: 'membership.approve', entityType: 'school_member' })

    const activity = await get(
      '/api/admin/activity?action=membership.approve&schoolId=s-1',
      admin.cookie,
    )
    const activityBody = await activity.json<{
      total: number
      entries: { action: string; entityId: string }[]
    }>()
    expect(activityBody.total).toBe(1)
    expect(activityBody.entries[0]).toMatchObject({
      action: 'membership.approve',
      entityId: 'm-1',
    })
  })

  it('rejects unknown statuses', async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/admin/memberships/m-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie },
      body: JSON.stringify({ status: 'pending' }),
    })
    expect(response.status).toBe(400)
  })
})
