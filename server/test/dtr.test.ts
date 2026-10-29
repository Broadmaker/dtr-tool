import { env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  api,
  del,
  get,
  insertEmployee,
  insertMember,
  insertSchool,
  makeSystemAdmin,
  patch,
  post,
  put,
  resetDomainData,
  signUp,
  type SignedInUser,
} from './helpers'

type Period = {
  id: string
  schoolId: string
  employeeId: string
  employeeName: string
  year: number
  month: number
  status: string
  lockedAt: number | null
}

type Day = {
  id: string
  periodId: string
  workDate: string
  amIn: string | null
  amOut: string | null
  pmIn: string | null
  pmOut: string | null
  dayType: string
  remarks: string | null
  source: string
}

describe('DTR periods and days', () => {
  let systemAdmin: SignedInUser
  let ao: SignedInUser
  let outsider: SignedInUser

  beforeAll(async () => {
    systemAdmin = await signUp('System Admin', 'sysadmin@example.com')
    ao = await signUp('AO One', 'ao@example.com')
    outsider = await signUp('Outsider One', 'outsider@example.com')
  })

  beforeEach(async () => {
    await resetDomainData()
    await makeSystemAdmin(systemAdmin.id)

    await insertSchool('s-1', 'Alpha High School', '100001')
    await insertSchool('s-2', 'Beta Elementary', '100002')

    await insertMember('m-ao', 's-1', ao.id, 'ao')
    await insertMember('m-outsider', 's-2', outsider.id, 'ao')

    await insertEmployee('e-1', 's-1', 'Ana', 'Cruz')
    await insertEmployee('e-2', 's-2', 'Cara', 'Lim')
  })

  async function createPeriod(
    cookie: string,
    year = 2026,
    month = 3,
  ): Promise<Period> {
    const response = await post('/api/schools/s-1/dtr-periods', cookie, {
      employeeId: 'e-1',
      year,
      month,
    })
    expect(response.status).toBe(201)
    return (await response.json<{ period: Period }>()).period
  }

  it('requires a session and membership', async () => {
    expect((await api('/api/schools/s-1/dtr-periods')).status).toBe(401)
    expect(
      (await get('/api/schools/s-1/dtr-periods', outsider.cookie)).status,
    ).toBe(404)
    expect((await get('/api/schools/s-1/dtr-periods', ao.cookie)).status).toBe(200)
  })

  it('creates periods for school employees only', async () => {
    const period = await createPeriod(ao.cookie)
    expect(period).toMatchObject({
      schoolId: 's-1',
      employeeId: 'e-1',
      employeeName: 'Ana Cruz',
      year: 2026,
      month: 3,
      status: 'draft',
    })

    const duplicate = await post('/api/schools/s-1/dtr-periods', ao.cookie, {
      employeeId: 'e-1',
      year: 2026,
      month: 3,
    })
    expect(duplicate.status).toBe(409)

    const foreignEmployee = await post('/api/schools/s-1/dtr-periods', ao.cookie, {
      employeeId: 'e-2',
      year: 2026,
      month: 3,
    })
    expect(foreignEmployee.status).toBe(404)

    const invalidMonth = await post('/api/schools/s-1/dtr-periods', ao.cookie, {
      employeeId: 'e-1',
      year: 2026,
      month: 13,
    })
    expect(invalidMonth.status).toBe(400)
  })

  it('filters periods by year, month, employee, and status', async () => {
    await createPeriod(ao.cookie, 2026, 3)
    const april = await createPeriod(ao.cookie, 2026, 4)
    await patch(`/api/schools/s-1/dtr-periods/${april.id}`, ao.cookie, {
      status: 'reviewed',
    })
    await createPeriod(ao.cookie, 2025, 3)

    const byYear = await (
      await get('/api/schools/s-1/dtr-periods?year=2026', ao.cookie)
    ).json<{ periods: Period[] }>()
    expect(byYear.periods.map((period) => period.month)).toEqual([4, 3])

    const byMonth = await (
      await get('/api/schools/s-1/dtr-periods?year=2026&month=3', ao.cookie)
    ).json<{ periods: Period[] }>()
    expect(byMonth.periods).toHaveLength(1)
    expect(byMonth.periods[0]?.month).toBe(3)

    const byStatus = await (
      await get('/api/schools/s-1/dtr-periods?status=reviewed', ao.cookie)
    ).json<{ periods: Period[] }>()
    expect(byStatus.periods.map((period) => period.id)).toEqual([april.id])

    const byEmployee = await (
      await get('/api/schools/s-1/dtr-periods?employeeId=e-1&year=2025', ao.cookie)
    ).json<{ periods: Period[] }>()
    expect(byEmployee.periods).toHaveLength(1)
  })

  it('enforces period transitions', async () => {
    const period = await createPeriod(ao.cookie)
    const path = `/api/schools/s-1/dtr-periods/${period.id}`

    const reviewed = await patch(path, ao.cookie, { status: 'reviewed' })
    expect(reviewed.status).toBe(200)

    const approved = await patch(path, ao.cookie, { status: 'approved' })
    expect(approved.status).toBe(200)

    const locked = await patch(path, ao.cookie, { status: 'locked' })
    expect(locked.status).toBe(200)
    expect((await locked.json<{ period: Period }>()).period.lockedAt).not.toBeNull()

    const illegal = await patch(path, ao.cookie, { status: 'reviewed' })
    expect(illegal.status).toBe(409)
  })

  it('deletes only draft periods', async () => {
    const draft = await createPeriod(ao.cookie, 2026, 3)
    const reviewed = await createPeriod(ao.cookie, 2026, 4)
    await patch(`/api/schools/s-1/dtr-periods/${reviewed.id}`, ao.cookie, {
      status: 'reviewed',
    })

    expect(
      (await del(`/api/schools/s-1/dtr-periods/${reviewed.id}`, ao.cookie)).status,
    ).toBe(409)

    expect((await del(`/api/schools/s-1/dtr-periods/${draft.id}`, ao.cookie)).status).toBe(
      200,
    )
    expect(
      await env.DB.prepare(`SELECT 1 AS ok FROM dtr_periods WHERE id = ?`)
        .bind(draft.id)
        .first(),
    ).toBeNull()
  })

  it('upserts days within the period month', async () => {
    const period = await createPeriod(ao.cookie)
    const path = `/api/schools/s-1/dtr-periods/${period.id}/days`

    const first = await put(path, ao.cookie, {
      days: [
        {
          workDate: '2026-03-03',
          amIn: '08:00',
          amOut: '12:00',
          pmIn: '13:00',
          pmOut: '17:00',
        },
        {
          workDate: '2026-03-02',
          amIn: '08:05',
          amOut: '12:00',
          pmIn: '13:00',
          pmOut: '17:00',
          remarks: 'Late',
          source: 'manual',
        },
      ],
    })
    expect(first.status).toBe(200)

    const days = (await first.json<{ days: Day[] }>()).days
    expect(days.map((day) => day.workDate)).toEqual(['2026-03-02', '2026-03-03'])
    expect(days[0]).toMatchObject({ amIn: '08:05', remarks: 'Late', source: 'manual' })

    const updated = await put(path, ao.cookie, {
      days: [{ workDate: '2026-03-02', amIn: '08:15', source: 'correction' }],
    })
    const updatedDays = (await updated.json<{ days: Day[] }>()).days
    expect(updatedDays).toHaveLength(2)
    expect(updatedDays[0]).toMatchObject({ amIn: '08:15', source: 'correction' })

    const outsideMonth = await put(path, ao.cookie, {
      days: [{ workDate: '2026-04-01', amIn: '08:00' }],
    })
    expect(outsideMonth.status).toBe(400)

    const badTime = await put(path, ao.cookie, {
      days: [{ workDate: '2026-03-04', amIn: '8am' }],
    })
    expect(badTime.status).toBe(400)
  })

  it('blocks day changes on locked periods', async () => {
    const period = await createPeriod(ao.cookie)
    const periodPath = `/api/schools/s-1/dtr-periods/${period.id}`
    const daysPath = `${periodPath}/days`

    await put(daysPath, ao.cookie, {
      days: [{ workDate: '2026-03-02', amIn: '08:00' }],
    })

    await patch(periodPath, ao.cookie, { status: 'approved' })
    await patch(periodPath, ao.cookie, { status: 'locked' })

    expect(
      (
        await put(daysPath, ao.cookie, {
          days: [{ workDate: '2026-03-02', amIn: '09:00' }],
        })
      ).status,
    ).toBe(409)
    expect(
      (await del(`${daysPath}/2026-03-02`, ao.cookie)).status,
    ).toBe(409)
  })

  it('reads and deletes days', async () => {
    const period = await createPeriod(ao.cookie)
    const daysPath = `/api/schools/s-1/dtr-periods/${period.id}/days`

    await put(daysPath, ao.cookie, {
      days: [{ workDate: '2026-03-02', amIn: '08:00' }],
    })

    const read = await get(daysPath, ao.cookie)
    expect(read.status).toBe(200)
    expect((await read.json<{ days: Day[] }>()).days).toHaveLength(1)

    const removed = await del(`${daysPath}/2026-03-02`, ao.cookie)
    expect(removed.status).toBe(200)

    const empty = await get(daysPath, ao.cookie)
    expect((await empty.json<{ days: Day[] }>()).days).toEqual([])
  })

  it('isolates periods across schools', async () => {
    await env.DB.prepare(
      `INSERT INTO dtr_periods (id, school_id, employee_id, year, month)
       VALUES ('p-s2', 's-2', 'e-2', 2026, 3)`,
    ).run()

    expect(
      (await get('/api/schools/s-1/dtr-periods/p-s2', ao.cookie)).status,
    ).toBe(404)
    expect(
      (await patch('/api/schools/s-1/dtr-periods/p-s2', ao.cookie, { status: 'reviewed' }))
        .status,
    ).toBe(404)
    expect(
      (await del('/api/schools/s-1/dtr-periods/p-s2', ao.cookie)).status,
    ).toBe(404)
    expect(
      (await get('/api/schools/s-1/dtr-periods/p-s2/days', ao.cookie)).status,
    ).toBe(404)

    const list = await (
      await get('/api/schools/s-1/dtr-periods', ao.cookie)
    ).json<{ periods: Period[] }>()
    expect(list.periods.map((period) => period.id)).not.toContain('p-s2')
  })

  it('lets a super admin manage any school', async () => {
    const created = await post('/api/schools/s-2/dtr-periods', systemAdmin.cookie, {
      employeeId: 'e-2',
      year: 2026,
      month: 5,
    })
    expect(created.status).toBe(201)

    const period = (await created.json<{ period: Period }>()).period
    const approved = await patch(
      `/api/schools/s-2/dtr-periods/${period.id}`,
      systemAdmin.cookie,
      { status: 'approved' },
    )
    expect(approved.status).toBe(200)
  })
})
