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

type Holiday = {
  id: string
  schoolId: string | null
  holidayDate: string
  name: string
  type: string
}

type HolidayList = { holidays: Holiday[] }

async function insertHoliday(
  id: string,
  schoolId: string | null,
  holidayDate: string,
  name: string,
  type = 'regular',
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO holidays (id, school_id, holiday_date, name, type)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, schoolId, holidayDate, name, type)
    .run()
}

describe('holidays', () => {
  let systemAdmin: SignedInUser
  let ao: SignedInUser
  let viewer: SignedInUser
  let outsider: SignedInUser

  beforeAll(async () => {
    systemAdmin = await signUp('System Admin', 'sysadmin@example.com')
    ao = await signUp('AO One', 'ao@example.com')
    viewer = await signUp('Viewer One', 'viewer@example.com')
    outsider = await signUp('Outsider One', 'outsider@example.com')
  })

  beforeEach(async () => {
    await resetDomainData()
    await makeSystemAdmin(systemAdmin.id)

    await insertSchool('s-1', 'Alpha High School', '100001')
    await insertSchool('s-2', 'Beta Elementary', '100002')

    await insertMember('m-ao', 's-1', ao.id, 'ao')
    await insertMember('m-viewer', 's-1', viewer.id, 'viewer')
    await insertMember('m-outsider', 's-2', outsider.id, 'ao')

    await insertHoliday('h-global', null, '2026-01-01', "New Year's Day")
    await insertHoliday('h-1', 's-1', '2026-04-09', 'Araw ng Kagitingan')
    await insertHoliday('h-2', 's-1', '2026-06-12', 'Independence Day', 'special')
    await insertHoliday('h-3', 's-2', '2026-04-09', 'Other School Day', 'local')
    await insertHoliday('h-2025', 's-1', '2025-12-25', 'Christmas Day')
  })

  it('requires a session and school membership', async () => {
    expect((await api('/api/schools/s-1/holidays')).status).toBe(401)
    expect((await get('/api/schools/s-1/holidays', outsider.cookie)).status).toBe(404)
    expect((await get('/api/schools/s-1/holidays', viewer.cookie)).status).toBe(200)
  })

  it('lists school holidays plus global ones', async () => {
    const body = await (
      await get('/api/schools/s-1/holidays', viewer.cookie)
    ).json<HolidayList>()

    expect(body.holidays.map((holiday) => holiday.id)).toEqual([
      'h-2025',
      'h-global',
      'h-1',
      'h-2',
    ])
    expect(body.holidays.find((holiday) => holiday.id === 'h-global')?.schoolId).toBeNull()
  })

  it('filters by year', async () => {
    const body = await (
      await get('/api/schools/s-1/holidays?year=2026', viewer.cookie)
    ).json<HolidayList>()

    expect(body.holidays.map((holiday) => holiday.id)).toEqual([
      'h-global',
      'h-1',
      'h-2',
    ])
  })

  it('creates holidays for the school', async () => {
    const response = await post('/api/schools/s-1/holidays', ao.cookie, {
      holidayDate: '2026-08-21',
      name: 'Ninoy Aquino Day',
      type: 'special',
    })
    expect(response.status).toBe(201)

    const body = await response.json<{ holiday: Holiday }>()
    expect(body.holiday).toMatchObject({
      schoolId: 's-1',
      holidayDate: '2026-08-21',
      name: 'Ninoy Aquino Day',
      type: 'special',
    })

    const duplicate = await post('/api/schools/s-1/holidays', ao.cookie, {
      holidayDate: '2026-08-21',
      name: 'Ninoy Aquino Day',
      type: 'special',
    })
    expect(duplicate.status).toBe(409)

    const invalidDate = await post('/api/schools/s-1/holidays', ao.cookie, {
      holidayDate: '08/21/2026',
      name: 'Bad Date',
      type: 'regular',
    })
    expect(invalidDate.status).toBe(400)
  })

  it('blocks viewers from writing', async () => {
    const response = await post('/api/schools/s-1/holidays', viewer.cookie, {
      holidayDate: '2026-08-21',
      name: 'Blocked',
      type: 'regular',
    })
    expect(response.status).toBe(403)
  })

  it('updates school holidays but not global or foreign ones', async () => {
    const updated = await patch('/api/schools/s-1/holidays/h-1', ao.cookie, {
      name: 'Day of Valor',
      type: 'special',
    })
    expect(updated.status).toBe(200)
    expect((await updated.json<{ holiday: Holiday }>()).holiday).toMatchObject({
      id: 'h-1',
      name: 'Day of Valor',
      type: 'special',
    })

    expect(
      (await patch('/api/schools/s-1/holidays/h-global', ao.cookie, { name: 'X' }))
        .status,
    ).toBe(404)
    expect(
      (await patch('/api/schools/s-1/holidays/h-3', ao.cookie, { name: 'X' })).status,
    ).toBe(404)
  })

  it('deletes school holidays but not global or foreign ones', async () => {
    expect(
      (await del('/api/schools/s-1/holidays/h-global', ao.cookie)).status,
    ).toBe(404)
    expect((await del('/api/schools/s-1/holidays/h-3', ao.cookie)).status).toBe(404)

    const removed = await del('/api/schools/s-1/holidays/h-2', ao.cookie)
    expect(removed.status).toBe(200)
    expect(
      await env.DB.prepare(`SELECT 1 AS ok FROM holidays WHERE id = 'h-2'`).first(),
    ).toBeNull()
  })

  it('lets a system admin manage any school', async () => {
    const body = await (
      await get('/api/schools/s-2/holidays', systemAdmin.cookie)
    ).json<HolidayList>()
    expect(body.holidays.map((holiday) => holiday.id)).toEqual(['h-global', 'h-3'])

    const created = await post('/api/schools/s-2/holidays', systemAdmin.cookie, {
      holidayDate: '2026-09-01',
      name: 'Admin Added',
      type: 'local',
    })
    expect(created.status).toBe(201)
  })
})
