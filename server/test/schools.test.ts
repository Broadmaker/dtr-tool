import { env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  api,
  del,
  get,
  insertMember,
  insertSchool,
  makeSystemAdmin,
  patch,
  post,
  resetDomainData,
  signUp,
  type SignedInUser,
} from './helpers'

const OWNER_EMAIL = 'owner@example.com'
const AO_EMAIL = 'ao@example.com'
const VIEWER_EMAIL = 'viewer@example.com'
const OUTSIDER_EMAIL = 'outsider@example.com'

type SchoolBody = {
  schools: {
    id: string
    name: string
    schoolCode: string | null
    role: string
  }[]
}

describe('schools and members', () => {
  let systemAdmin: SignedInUser
  let owner: SignedInUser
  let ao: SignedInUser
  let viewer: SignedInUser
  let pending: SignedInUser
  let outsider: SignedInUser

  beforeAll(async () => {
    systemAdmin = await signUp('System Admin', 'sysadmin@example.com')
    owner = await signUp('Owner One', OWNER_EMAIL)
    ao = await signUp('AO One', AO_EMAIL)
    viewer = await signUp('Viewer One', VIEWER_EMAIL)
    pending = await signUp('Pending One', 'pending@example.com')
    outsider = await signUp('Outsider One', OUTSIDER_EMAIL)
  })

  beforeEach(async () => {
    await resetDomainData()
    await makeSystemAdmin(systemAdmin.id)

    await insertSchool('s-1', 'Alpha_One High School', '100001')
    await insertSchool('s-2', 'Beta Elementary', '100002')

    await insertMember('m-owner', 's-1', owner.id, 'owner')
    await insertMember('m-ao', 's-1', ao.id, 'ao')
    await insertMember('m-viewer', 's-1', viewer.id, 'viewer')
    await insertMember('m-pending', 's-1', pending.id, 'ao', 'pending')
    await insertMember('m-outsider', 's-2', outsider.id, 'ao')
  })

  it('requires a session', async () => {
    const response = await api('/api/schools')
    expect(response.status).toBe(401)
  })

  it('lists every school for a system admin', async () => {
    const response = await get('/api/schools', systemAdmin.cookie)
    expect(response.status).toBe(200)

    const body = await response.json<SchoolBody>()
    expect(body.schools.map((school) => school.id)).toEqual(['s-1', 's-2'])
    expect(body.schools.every((school) => school.role === 'system_admin')).toBe(true)
  })

  it('lists only active memberships for regular users', async () => {
    const ownerBody = await (
      await get('/api/schools', owner.cookie)
    ).json<SchoolBody>()
    expect(ownerBody.schools.map((school) => school.id)).toEqual(['s-1'])
    expect(ownerBody.schools[0]?.role).toBe('owner')

    const pendingBody = await (
      await get('/api/schools', pending.cookie)
    ).json<SchoolBody>()
    expect(pendingBody.schools).toEqual([])

    const outsiderBody = await (
      await get('/api/schools', outsider.cookie)
    ).json<SchoolBody>()
    expect(outsiderBody.schools.map((school) => school.id)).toEqual(['s-2'])
  })

  it('exposes the full catalog to any signed-in user', async () => {
    const response = await get('/api/schools/catalog', pending.cookie)
    expect(response.status).toBe(200)

    const body = await response.json<SchoolBody>()
    expect(body.schools.map((school) => school.id)).toEqual(['s-1', 's-2'])
    expect(body.schools[0]).toMatchObject({
      name: 'Alpha_One High School',
      schoolCode: '100001',
    })
  })

  it('only lets system admins create schools', async () => {
    const forbidden = await post('/api/schools', ao.cookie, { name: 'Gamma' })
    expect(forbidden.status).toBe(403)

    const created = await post('/api/schools', systemAdmin.cookie, {
      name: '  Gamma National High School  ',
      schoolCode: '100003',
      division: 'Division I',
    })
    expect(created.status).toBe(201)

    const body = await created.json<{ school: { id: string; name: string } }>()
    expect(body.school.name).toBe('Gamma National High School')

    const row = await env.DB.prepare(
      `SELECT school_code AS schoolCode FROM schools WHERE id = ?`,
    )
      .bind(body.school.id)
      .first<{ schoolCode: string }>()
    expect(row?.schoolCode).toBe('100003')

    const audit = await env.DB.prepare(
      `SELECT action FROM audit_log WHERE entity_id = ?`,
    )
      .bind(body.school.id)
      .first<{ action: string }>()
    expect(audit?.action).toBe('school.create')
  })

  it('rejects duplicate school codes', async () => {
    const response = await post('/api/schools', systemAdmin.cookie, {
      name: 'Duplicate Code School',
      schoolCode: '100001',
    })
    expect(response.status).toBe(409)
  })

  it('scopes school reads to membership or system admin', async () => {
    const ownerRead = await get('/api/schools/s-1', owner.cookie)
    expect(ownerRead.status).toBe(200)
    expect((await ownerRead.json<{ school: { role: string } }>()).school.role).toBe(
      'owner',
    )

    const adminRead = await get('/api/schools/s-2', systemAdmin.cookie)
    expect(adminRead.status).toBe(200)
    expect((await adminRead.json<{ school: { role: string } }>()).school.role).toBe(
      'system_admin',
    )

    expect((await get('/api/schools/s-2', owner.cookie)).status).toBe(404)
    expect((await get('/api/schools/s-1', outsider.cookie)).status).toBe(404)
    expect((await get('/api/schools/s-1', pending.cookie)).status).toBe(403)
    expect((await get('/api/schools/missing', systemAdmin.cookie)).status).toBe(404)
  })

  it('lets owners and admins update the school, not AOs or viewers', async () => {
    expect(
      (await patch('/api/schools/s-1', ao.cookie, { name: 'Nope' })).status,
    ).toBe(403)
    expect(
      (await patch('/api/schools/s-1', viewer.cookie, { name: 'Nope' })).status,
    ).toBe(403)

    const updated = await patch('/api/schools/s-1', owner.cookie, {
      name: 'Alpha One NHS',
      division: 'Division II',
    })
    expect(updated.status).toBe(200)
    expect(
      (await updated.json<{ school: { name: string; division: string } }>()).school,
    ).toMatchObject({ name: 'Alpha One NHS', division: 'Division II' })

    const adminUpdated = await patch('/api/schools/s-2', systemAdmin.cookie, {
      region: 'Region IX',
    })
    expect(adminUpdated.status).toBe(200)
  })

  it('rejects a school update that reuses another code', async () => {
    const response = await patch('/api/schools/s-1', owner.cookie, {
      schoolCode: '100002',
    })
    expect(response.status).toBe(409)
  })

  it('lists only active members of a school', async () => {
    const response = await get('/api/schools/s-1/members', viewer.cookie)
    expect(response.status).toBe(200)

    const body = await response.json<{
      members: { id: string; userId: string; email: string; role: string }[]
    }>()
    expect(body.members.map((member) => member.id)).toEqual([
      'm-ao',
      'm-owner',
      'm-viewer',
    ])
    expect(body.members.map((member) => member.email)).toEqual([
      AO_EMAIL,
      OWNER_EMAIL,
      VIEWER_EMAIL,
    ])

    expect((await get('/api/schools/s-1/members', outsider.cookie)).status).toBe(404)
  })

  it('only lets owners and admins manage members', async () => {
    const forbidden = await post('/api/schools/s-1/members', ao.cookie, {
      email: OUTSIDER_EMAIL,
      role: 'viewer',
    })
    expect(forbidden.status).toBe(403)

    const added = await post('/api/schools/s-1/members', owner.cookie, {
      email: OUTSIDER_EMAIL,
      role: 'encoder',
    })
    expect(added.status).toBe(201)
    const addedBody = await added.json<{
      member: { id: string; userId: string; role: string }
    }>()
    expect(addedBody.member).toMatchObject({ userId: outsider.id, role: 'encoder' })

    const duplicate = await post('/api/schools/s-1/members', owner.cookie, {
      email: OUTSIDER_EMAIL,
      role: 'viewer',
    })
    expect(duplicate.status).toBe(409)

    const unknown = await post('/api/schools/s-1/members', owner.cookie, {
      email: 'nobody@example.com',
      role: 'viewer',
    })
    expect(unknown.status).toBe(404)

    const invalidRole = await post('/api/schools/s-1/members', owner.cookie, {
      email: OUTSIDER_EMAIL,
      role: 'owner',
    })
    expect(invalidRole.status).toBe(400)
  })

  it('changes member roles but protects the owner', async () => {
    expect(
      (await patch('/api/schools/s-1/members/m-viewer', ao.cookie, { role: 'ao' }))
        .status,
    ).toBe(403)

    const updated = await patch('/api/schools/s-1/members/m-viewer', owner.cookie, {
      role: 'encoder',
    })
    expect(updated.status).toBe(200)
    expect(
      (await updated.json<{ member: { role: string } }>()).member.role,
    ).toBe('encoder')

    const ownerChange = await patch(
      '/api/schools/s-1/members/m-owner',
      owner.cookie,
      { role: 'admin' },
    )
    expect(ownerChange.status).toBe(403)

    const crossTenant = await patch(
      '/api/schools/s-1/members/m-outsider',
      owner.cookie,
      { role: 'admin' },
    )
    expect(crossTenant.status).toBe(404)
  })

  it('removes members but never the owner', async () => {
    expect(
      (await del('/api/schools/s-1/members/m-viewer', ao.cookie)).status,
    ).toBe(403)

    const removed = await del('/api/schools/s-1/members/m-viewer', owner.cookie)
    expect(removed.status).toBe(200)
    expect(
      await env.DB.prepare(`SELECT 1 AS ok FROM school_members WHERE id = 'm-viewer'`).first(),
    ).toBeNull()

    expect(
      (await del('/api/schools/s-1/members/m-owner', owner.cookie)).status,
    ).toBe(403)
    expect(
      (await del('/api/schools/s-1/members/m-outsider', owner.cookie)).status,
    ).toBe(404)
  })
})
