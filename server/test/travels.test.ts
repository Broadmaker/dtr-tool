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
  resetDomainData,
  signUp,
  type SignedInUser,
} from './helpers'

type Travel = {
  id: string
  schoolId: string
  employeeId: string
  employeeName: string
  referenceNo: string | null
  destination: string
  purpose: string | null
  startDate: string
  endDate: string
  days: number
  status: string
  remarks: string | null
}

type TravelList = { travels: Travel[] }

async function insertTravel(
  id: string,
  schoolId: string,
  employeeId: string,
  destination: string,
  startDate: string,
  endDate: string,
  status = 'planned',
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO official_travels
       (id, school_id, employee_id, destination, start_date, end_date, days, status)
     VALUES (?, ?, ?, ?, ?, ?, 2, ?)`,
  )
    .bind(id, schoolId, employeeId, destination, startDate, endDate, status)
    .run()
}

describe('official travels', () => {
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

    await insertTravel('t-1', 's-1', 'e-1', 'Cebu City', '2026-05-01', '2026-05-02')
    await insertTravel(
      't-2',
      's-1',
      'e-1',
      'Davao City',
      '2026-06-01',
      '2026-06-02',
      'approved',
    )
    await insertTravel('t-s2', 's-2', 'e-2', 'Manila', '2026-06-15', '2026-06-16')
  })

  it('requires a session and membership', async () => {
    expect((await api('/api/schools/s-1/travels')).status).toBe(401)
    expect((await get('/api/schools/s-1/travels', outsider.cookie)).status).toBe(404)
    expect((await get('/api/schools/s-1/travels', ao.cookie)).status).toBe(200)
  })

  it('lists school travels in reverse date order', async () => {
    const body = await (
      await get('/api/schools/s-1/travels', ao.cookie)
    ).json<TravelList>()

    expect(body.travels.map((travel) => travel.id)).toEqual(['t-2', 't-1'])
    expect(body.travels[0]).toMatchObject({
      employeeId: 'e-1',
      employeeName: 'Ana Cruz',
      destination: 'Davao City',
      status: 'approved',
    })
  })

  it('filters by year, employee, and status', async () => {
    const byStatus = await (
      await get('/api/schools/s-1/travels?status=planned', ao.cookie)
    ).json<TravelList>()
    expect(byStatus.travels.map((travel) => travel.id)).toEqual(['t-1'])

    const byYear = await (
      await get('/api/schools/s-1/travels?year=2026', ao.cookie)
    ).json<TravelList>()
    expect(byYear.travels.map((travel) => travel.id)).toEqual(['t-2', 't-1'])

    const byEmployee = await (
      await get('/api/schools/s-1/travels?employeeId=e-1&status=approved', ao.cookie)
    ).json<TravelList>()
    expect(byEmployee.travels.map((travel) => travel.id)).toEqual(['t-2'])
  })

  it('creates travels with a default status', async () => {
    const response = await post('/api/schools/s-1/travels', ao.cookie, {
      employeeId: 'e-1',
      referenceNo: '  OT-2026-01  ',
      destination: '  Baguio City  ',
      purpose: 'Training',
      startDate: '2026-07-01',
      endDate: '2026-07-03',
      days: 3,
    })
    expect(response.status).toBe(201)

    const body = await response.json<{ travel: Travel }>()
    expect(body.travel).toMatchObject({
      employeeId: 'e-1',
      referenceNo: 'OT-2026-01',
      destination: 'Baguio City',
      status: 'planned',
      days: 3,
    })

    const backwards = await post('/api/schools/s-1/travels', ao.cookie, {
      employeeId: 'e-1',
      destination: 'Nowhere',
      startDate: '2026-07-05',
      endDate: '2026-07-04',
      days: 1,
    })
    expect(backwards.status).toBe(400)

    const foreignEmployee = await post('/api/schools/s-1/travels', ao.cookie, {
      employeeId: 'e-2',
      destination: 'Nowhere',
      startDate: '2026-07-04',
      endDate: '2026-07-05',
      days: 1,
    })
    expect(foreignEmployee.status).toBe(404)
  })

  it('updates and deletes travels', async () => {
    const updated = await patch('/api/schools/s-1/travels/t-1', ao.cookie, {
      destination: 'Cebu City (rescheduled)',
      status: 'completed',
    })
    expect(updated.status).toBe(200)
    expect((await updated.json<{ travel: Travel }>()).travel).toMatchObject({
      id: 't-1',
      destination: 'Cebu City (rescheduled)',
      status: 'completed',
    })

    expect(
      (
        await patch('/api/schools/s-1/travels/t-1', ao.cookie, {
          employeeId: 'e-2',
        })
      ).status,
    ).toBe(404)

    const removed = await del('/api/schools/s-1/travels/t-1', ao.cookie)
    expect(removed.status).toBe(200)
    expect(
      await env.DB.prepare(`SELECT 1 AS ok FROM official_travels WHERE id = 't-1'`).first(),
    ).toBeNull()
  })

  it('isolates travels across schools', async () => {
    const body = await (
      await get('/api/schools/s-1/travels', ao.cookie)
    ).json<TravelList>()
    expect(body.travels.map((travel) => travel.id)).not.toContain('t-s2')

    expect(
      (await patch('/api/schools/s-1/travels/t-s2', ao.cookie, { status: 'approved' }))
        .status,
    ).toBe(404)
    expect((await del('/api/schools/s-1/travels/t-s2', ao.cookie)).status).toBe(404)
  })

  it('lets a super admin manage any school', async () => {
    const body = await (
      await get('/api/schools/s-2/travels', systemAdmin.cookie)
    ).json<TravelList>()
    expect(body.travels.map((travel) => travel.id)).toEqual(['t-s2'])

    const updated = await patch('/api/schools/s-2/travels/t-s2', systemAdmin.cookie, {
      status: 'approved',
    })
    expect(updated.status).toBe(200)
  })
})
