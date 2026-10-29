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

const AO_EMAIL = 'ao@example.com'
const AO2_EMAIL = 'ao2@example.com'
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
  let ao: SignedInUser
  let ao2: SignedInUser
  let pending: SignedInUser
  let outsider: SignedInUser

  beforeAll(async () => {
    systemAdmin = await signUp('Super Admin', 'sysadmin@example.com')
    ao = await signUp('AO One', AO_EMAIL)
    ao2 = await signUp('AO Two', AO2_EMAIL)
    pending = await signUp('Pending One', 'pending@example.com')
    outsider = await signUp('Outsider One', OUTSIDER_EMAIL)
  })

  beforeEach(async () => {
    await resetDomainData()
    await makeSystemAdmin(systemAdmin.id)

    await insertSchool('s-1', 'Alpha_One High School', '100001')
    await insertSchool('s-2', 'Beta Elementary', '100002')

    await insertMember('m-ao', 's-1', ao.id, 'ao')
    await insertMember('m-ao2', 's-1', ao2.id, 'ao')
    await insertMember('m-pending', 's-1', pending.id, 'ao', 'pending')
    await insertMember('m-outsider', 's-2', outsider.id, 'ao')
  })

  it('requires a session', async () => {
    const response = await api('/api/schools')
    expect(response.status).toBe(401)
  })

  it('lists every school for a super admin', async () => {
    const response = await get('/api/schools', systemAdmin.cookie)
    expect(response.status).toBe(200)

    const body = await response.json<SchoolBody>()
    expect(body.schools.map((school) => school.id)).toEqual(['s-1', 's-2'])
    expect(body.schools.every((school) => school.role === 'system_admin')).toBe(true)
  })

  it('lists only active memberships for AOs', async () => {
    const aoBody = await (await get('/api/schools', ao.cookie)).json<SchoolBody>()
    expect(aoBody.schools.map((school) => school.id)).toEqual(['s-1'])
    expect(aoBody.schools[0]?.role).toBe('ao')

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

  it('only lets the super admin create schools', async () => {
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

  it('scopes school reads to membership or super admin', async () => {
    const aoRead = await get('/api/schools/s-1', ao.cookie)
    expect(aoRead.status).toBe(200)
    expect((await aoRead.json<{ school: { role: string } }>()).school.role).toBe('ao')

    const adminRead = await get('/api/schools/s-2', systemAdmin.cookie)
    expect(adminRead.status).toBe(200)
    expect((await adminRead.json<{ school: { role: string } }>()).school.role).toBe(
      'system_admin',
    )

    expect((await get('/api/schools/s-2', ao.cookie)).status).toBe(404)
    expect((await get('/api/schools/s-1', outsider.cookie)).status).toBe(404)
    expect((await get('/api/schools/s-1', pending.cookie)).status).toBe(403)
    expect((await get('/api/schools/missing', systemAdmin.cookie)).status).toBe(404)
  })

  it('only lets the super admin update a school', async () => {
    expect(
      (await patch('/api/schools/s-1', ao.cookie, { name: 'Nope' })).status,
    ).toBe(403)

    const updated = await patch('/api/schools/s-1', systemAdmin.cookie, {
      name: 'Alpha One NHS',
      division: 'Division II',
    })
    expect(updated.status).toBe(200)
    expect(
      (await updated.json<{ school: { name: string; division: string } }>()).school,
    ).toMatchObject({ name: 'Alpha One NHS', division: 'Division II' })
  })

  it('rejects a school update that reuses another code', async () => {
    const response = await patch('/api/schools/s-1', systemAdmin.cookie, {
      schoolCode: '100002',
    })
    expect(response.status).toBe(409)
  })

  it('lists only active members of a school', async () => {
    const response = await get('/api/schools/s-1/members', ao.cookie)
    expect(response.status).toBe(200)

    const body = await response.json<{
      members: { id: string; userId: string; email: string; role: string }[]
    }>()
    expect(body.members.map((member) => member.id)).toEqual(['m-ao', 'm-ao2'])
    expect(body.members.map((member) => member.email)).toEqual([AO_EMAIL, AO2_EMAIL])
    expect(body.members.every((member) => member.role === 'ao')).toBe(true)

    expect((await get('/api/schools/s-1/members', outsider.cookie)).status).toBe(404)
  })

  it('only lets the super admin manage members', async () => {
    const forbidden = await post('/api/schools/s-1/members', ao.cookie, {
      email: OUTSIDER_EMAIL,
    })
    expect(forbidden.status).toBe(403)

    const added = await post('/api/schools/s-1/members', systemAdmin.cookie, {
      email: OUTSIDER_EMAIL,
    })
    expect(added.status).toBe(201)
    const addedBody = await added.json<{
      member: { id: string; userId: string; role: string }
    }>()
    expect(addedBody.member).toMatchObject({ userId: outsider.id, role: 'ao' })

    const duplicate = await post('/api/schools/s-1/members', systemAdmin.cookie, {
      email: OUTSIDER_EMAIL,
    })
    expect(duplicate.status).toBe(409)

    const unknown = await post('/api/schools/s-1/members', systemAdmin.cookie, {
      email: 'nobody@example.com',
    })
    expect(unknown.status).toBe(404)

    const retiredRole = await post('/api/schools/s-1/members', systemAdmin.cookie, {
      email: OUTSIDER_EMAIL,
      role: 'admin',
    })
    expect(retiredRole.status).toBe(400)
  })

  it('only lets the super admin remove members', async () => {
    expect((await del('/api/schools/s-1/members/m-ao2', ao.cookie)).status).toBe(403)

    const removed = await del('/api/schools/s-1/members/m-ao2', systemAdmin.cookie)
    expect(removed.status).toBe(200)
    expect(
      await env.DB.prepare(`SELECT 1 AS ok FROM school_members WHERE id = 'm-ao2'`).first(),
    ).toBeNull()

    expect(
      (await del('/api/schools/s-1/members/m-outsider', systemAdmin.cookie)).status,
    ).toBe(404)
  })
})
