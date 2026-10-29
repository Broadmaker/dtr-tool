import { env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  api,
  get,
  insertMember,
  insertSchool,
  post,
  resetDomainData,
  signUp,
  type SignedInUser,
} from './helpers'

type Membership = {
  id: string
  schoolId: string
  schoolName: string
  schoolCode: string | null
  role: string
  status: string
}

describe('onboarding', () => {
  let applicant: SignedInUser
  let activeMember: SignedInUser
  let rejectedMember: SignedInUser

  beforeAll(async () => {
    applicant = await signUp('Applicant One', 'applicant@example.com')
    activeMember = await signUp('Active One', 'active@example.com')
    rejectedMember = await signUp('Rejected One', 'rejected@example.com')
  })

  beforeEach(async () => {
    await resetDomainData()

    await insertSchool('s-1', 'Alpha High School', '100001')
    await insertSchool('s-2', 'Beta Elementary', '100002')

    await insertMember('m-active', 's-1', activeMember.id, 'ao')
    await insertMember('m-rejected', 's-2', rejectedMember.id, 'encoder', 'rejected')
  })

  it('requires a session', async () => {
    expect((await api('/api/onboarding/memberships')).status).toBe(401)
    expect((await api('/api/onboarding/join', { method: 'POST', body: {} })).status).toBe(
      401,
    )
  })

  it('lists the caller memberships only', async () => {
    const body = await (
      await get('/api/onboarding/memberships', activeMember.cookie)
    ).json<{ memberships: Membership[] }>()

    expect(body.memberships).toHaveLength(1)
    expect(body.memberships[0]).toMatchObject({
      schoolId: 's-1',
      schoolName: 'Alpha High School',
      schoolCode: '100001',
      role: 'ao',
      status: 'active',
    })

    const empty = await (
      await get('/api/onboarding/memberships', applicant.cookie)
    ).json<{ memberships: Membership[] }>()
    expect(empty.memberships).toEqual([])
  })

  it('requests access to a school', async () => {
    const response = await post('/api/onboarding/join', applicant.cookie, {
      schoolId: 's-1',
    })
    expect(response.status).toBe(201)

    const body = await response.json<{ membership: Membership }>()
    expect(body.membership).toMatchObject({
      schoolId: 's-1',
      role: 'ao',
      status: 'pending',
    })

    const audit = await env.DB.prepare(
      `SELECT action FROM audit_log WHERE entity_id = ?`,
    )
      .bind(body.membership.id)
      .first<{ action: string }>()
    expect(audit?.action).toBe('membership.request')
  })

  it('rejects unknown schools', async () => {
    const response = await post('/api/onboarding/join', applicant.cookie, {
      schoolId: 'missing',
    })
    expect(response.status).toBe(404)
  })

  it('does not duplicate pending or active memberships', async () => {
    await post('/api/onboarding/join', applicant.cookie, { schoolId: 's-1' })

    const pendingAgain = await post('/api/onboarding/join', applicant.cookie, {
      schoolId: 's-1',
    })
    expect(pendingAgain.status).toBe(409)

    const activeAgain = await post('/api/onboarding/join', activeMember.cookie, {
      schoolId: 's-1',
    })
    expect(activeAgain.status).toBe(409)
  })

  it('lets a rejected request be filed again', async () => {
    const response = await post('/api/onboarding/join', rejectedMember.cookie, {
      schoolId: 's-2',
    })
    expect(response.status).toBe(201)

    const body = await response.json<{ membership: Membership }>()
    expect(body.membership).toMatchObject({
      id: 'm-rejected',
      role: 'encoder',
      status: 'pending',
    })

    const row = await env.DB.prepare(
      `SELECT status FROM school_members WHERE id = 'm-rejected'`,
    ).first<{ status: string }>()
    expect(row?.status).toBe('pending')
  })
})
