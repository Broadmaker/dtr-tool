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

type LeaveType = {
  id: string
  schoolId: string | null
  code: string
  name: string
  requiresCredits: boolean
}

type LeaveApplication = {
  id: string
  employeeId: string
  employeeName: string
  leaveTypeId: string
  leaveCode: string
  status: string
  startDate: string
  endDate: string
  days: number
  remarks: string | null
  filedAt: number | null
}

type Credit = {
  leaveTypeId: string
  code: string
  year: number
  earned: number
  used: number
}

describe('leave management', () => {
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

    await env.DB.prepare(
      `INSERT INTO leave_types (id, school_id, code, name, requires_credits)
       VALUES ('lt-s2', 's-2', 'S2', 'Other School Leave', 1)`,
    ).run()
  })

  async function createApplication(
    cookie: string,
    overrides: Partial<{
      employeeId: string
      leaveTypeId: string
      startDate: string
      endDate: string
      days: number
      status: string
      remarks: string
    }> = {},
  ): Promise<LeaveApplication> {
    const response = await post('/api/schools/s-1/leave-applications', cookie, {
      employeeId: 'e-1',
      leaveTypeId: 'lt-global-vl',
      startDate: '2026-03-02',
      endDate: '2026-03-03',
      days: 2,
      ...overrides,
    })
    expect(response.status).toBe(201)
    return (await response.json<{ application: LeaveApplication }>()).application
  }

  it('requires a session and membership', async () => {
    expect((await api('/api/schools/s-1/leave-types')).status).toBe(401)
    expect(
      (await get('/api/schools/s-1/leave-types', outsider.cookie)).status,
    ).toBe(404)
    expect((await get('/api/schools/s-1/leave-types', ao.cookie)).status).toBe(200)
  })

  it('lists global and school leave types', async () => {
    const created = await post('/api/schools/s-1/leave-types', ao.cookie, {
      code: 'ww',
      name: 'Wellness Leave',
      requiresCredits: false,
    })
    expect(created.status).toBe(201)
    expect(
      (await created.json<{ leaveType: LeaveType }>()).leaveType,
    ).toMatchObject({ code: 'WW', schoolId: 's-1', requiresCredits: false })

    const body = await (
      await get('/api/schools/s-1/leave-types', ao.cookie)
    ).json<{ leaveTypes: LeaveType[] }>()

    const codes = body.leaveTypes.map((type) => type.code)
    expect(codes).toContain('VL')
    expect(codes).toContain('SL')
    expect(codes).toContain('WW')
    expect(codes).not.toContain('S2')
  })

  it('rejects duplicate school leave type codes', async () => {
    const first = await post('/api/schools/s-1/leave-types', ao.cookie, {
      code: 'CT',
      name: 'Custom Type',
    })
    expect(first.status).toBe(201)

    const second = await post('/api/schools/s-1/leave-types', ao.cookie, {
      code: 'ct',
      name: 'Another Custom Type',
    })
    expect(second.status).toBe(409)
  })

  it('edits school leave types but never global ones', async () => {
    const created = await post('/api/schools/s-1/leave-types', ao.cookie, {
      code: 'CT',
      name: 'Custom Type',
    })
    const leaveType = (await created.json<{ leaveType: LeaveType }>()).leaveType

    const updated = await patch(
      `/api/schools/s-1/leave-types/${leaveType.id}`,
      ao.cookie,
      { name: 'Renamed Type', requiresCredits: false },
    )
    expect(updated.status).toBe(200)
    expect(
      (await updated.json<{ leaveType: LeaveType }>()).leaveType,
    ).toMatchObject({ name: 'Renamed Type', requiresCredits: false })

    expect(
      (
        await patch('/api/schools/s-1/leave-types/lt-global-vl', ao.cookie, {
          name: 'Hacked',
        })
      ).status,
    ).toBe(404)
    expect(
      (await del('/api/schools/s-1/leave-types/lt-global-vl', ao.cookie)).status,
    ).toBe(404)
  })

  it('cannot delete a leave type that is still in use', async () => {
    const created = await post('/api/schools/s-1/leave-types', ao.cookie, {
      code: 'CT',
      name: 'Custom Type',
    })
    const leaveType = (await created.json<{ leaveType: LeaveType }>()).leaveType
    await createApplication(ao.cookie, { leaveTypeId: leaveType.id })

    const response = await del(
      `/api/schools/s-1/leave-types/${leaveType.id}`,
      ao.cookie,
    )
    expect(response.status).toBe(409)
  })

  it('stores and updates leave credits', async () => {
    const saved = await put('/api/schools/s-1/employees/e-1/leave-credits', ao.cookie, {
      year: 2026,
      entries: [
        { leaveTypeId: 'lt-global-vl', earned: 15, used: 0 },
        { leaveTypeId: 'lt-global-sl', earned: 15, used: 2 },
      ],
    })
    expect(saved.status).toBe(200)

    const credits = (await saved.json<{ credits: Credit[] }>()).credits
    expect(credits).toHaveLength(2)
    expect(credits.find((credit) => credit.code === 'VL')).toMatchObject({
      year: 2026,
      earned: 15,
      used: 0,
    })

    await put('/api/schools/s-1/employees/e-1/leave-credits', ao.cookie, {
      year: 2026,
      entries: [{ leaveTypeId: 'lt-global-vl', earned: 20, used: 1 }],
    })

    const reread = await get(
      '/api/schools/s-1/employees/e-1/leave-credits?year=2026',
      ao.cookie,
    )
    const rereadCredits = (await reread.json<{ credits: Credit[] }>()).credits
    expect(rereadCredits.find((credit) => credit.code === 'VL')).toMatchObject({
      earned: 20,
      used: 1,
    })
  })

  it('validates leave credit requests', async () => {
    expect(
      (
        await put('/api/schools/s-1/employees/e-1/leave-credits', ao.cookie, {
          year: 2026,
          entries: [{ leaveTypeId: 'lt-s2', earned: 1, used: 0 }],
        })
      ).status,
    ).toBe(404)

    expect(
      (
        await put('/api/schools/s-1/employees/e-2/leave-credits', ao.cookie, {
          year: 2026,
          entries: [],
        })
      ).status,
    ).toBe(404)

    expect(
      (await get('/api/schools/s-1/employees/e-1/leave-credits', ao.cookie))
        .status,
    ).toBe(400)
  })

  it('creates draft and submitted applications', async () => {
    const draft = await createApplication(ao.cookie)
    expect(draft).toMatchObject({
      employeeId: 'e-1',
      leaveCode: 'VL',
      status: 'draft',
      filedAt: null,
    })

    const submitted = await createApplication(ao.cookie, {
      status: 'submitted',
      remarks: 'Family trip',
    })
    expect(submitted.status).toBe('submitted')
    expect(submitted.filedAt).not.toBeNull()
    expect(submitted.remarks).toBe('Family trip')

    const backwards = await post('/api/schools/s-1/leave-applications', ao.cookie, {
      employeeId: 'e-1',
      leaveTypeId: 'lt-global-vl',
      startDate: '2026-03-05',
      endDate: '2026-03-04',
      days: 1,
    })
    expect(backwards.status).toBe(400)

    const foreignEmployee = await post(
      '/api/schools/s-1/leave-applications',
      ao.cookie,
      {
        employeeId: 'e-2',
        leaveTypeId: 'lt-global-vl',
        startDate: '2026-03-05',
        endDate: '2026-03-05',
        days: 1,
      },
    )
    expect(foreignEmployee.status).toBe(404)

    const foreignType = await post('/api/schools/s-1/leave-applications', ao.cookie, {
      employeeId: 'e-1',
      leaveTypeId: 'lt-s2',
      startDate: '2026-03-05',
      endDate: '2026-03-05',
      days: 1,
    })
    expect(foreignType.status).toBe(404)
  })

  it('enforces the status machine', async () => {
    const application = await createApplication(ao.cookie, { status: 'submitted' })
    const path = `/api/schools/s-1/leave-applications/${application.id}`

    const approved = await patch(path, ao.cookie, { status: 'approved' })
    expect(approved.status).toBe(200)
    const approvedBody = (await approved.json<{ application: LeaveApplication }>())
      .application
    expect(approvedBody.status).toBe('approved')

    const illegal = await patch(path, ao.cookie, { status: 'submitted' })
    expect(illegal.status).toBe(409)

    const cancelled = await patch(path, ao.cookie, { status: 'cancelled' })
    expect(cancelled.status).toBe(200)
    expect(
      (await cancelled.json<{ application: LeaveApplication }>()).application.status,
    ).toBe('cancelled')
  })

  it('syncs used credits when applications are approved and cancelled', async () => {
    await put('/api/schools/s-1/employees/e-1/leave-credits', ao.cookie, {
      year: 2026,
      entries: [{ leaveTypeId: 'lt-global-vl', earned: 15, used: 0 }],
    })

    const application = await createApplication(ao.cookie, {
      status: 'submitted',
      days: 3,
    })
    const path = `/api/schools/s-1/leave-applications/${application.id}`

    await patch(path, ao.cookie, { status: 'approved' })
    let credits = (
      await (
        await get(
          '/api/schools/s-1/employees/e-1/leave-credits?year=2026',
          ao.cookie,
        )
      ).json<{ credits: Credit[] }>()
    ).credits
    expect(credits.find((credit) => credit.code === 'VL')?.used).toBe(3)

    await patch(path, ao.cookie, { status: 'cancelled' })
    credits = (
      await (
        await get(
          '/api/schools/s-1/employees/e-1/leave-credits?year=2026',
          ao.cookie,
        )
      ).json<{ credits: Credit[] }>()
    ).credits
    expect(credits.find((credit) => credit.code === 'VL')?.used).toBe(0)
  })

  it('filters applications by employee, status, and year', async () => {
    const draft = await createApplication(ao.cookie, {
      startDate: '2026-03-02',
      endDate: '2026-03-02',
      days: 1,
    })
    const submitted = await createApplication(ao.cookie, {
      status: 'submitted',
      startDate: '2025-12-01',
      endDate: '2025-12-02',
      days: 2,
    })

    const all = await (
      await get('/api/schools/s-1/leave-applications', ao.cookie)
    ).json<{ applications: LeaveApplication[] }>()
    expect(all.applications.map((application) => application.id).sort()).toEqual(
      [draft.id, submitted.id].sort(),
    )

    const byStatus = await (
      await get('/api/schools/s-1/leave-applications?status=submitted', ao.cookie)
    ).json<{ applications: LeaveApplication[] }>()
    expect(byStatus.applications.map((application) => application.id)).toEqual([
      submitted.id,
    ])

    const byYear = await (
      await get('/api/schools/s-1/leave-applications?year=2026', ao.cookie)
    ).json<{ applications: LeaveApplication[] }>()
    expect(byYear.applications.map((application) => application.id)).toEqual([
      draft.id,
    ])

    const byEmployee = await (
      await get(
        '/api/schools/s-1/leave-applications?employeeId=e-1&year=2025',
        ao.cookie,
      )
    ).json<{ applications: LeaveApplication[] }>()
    expect(byEmployee.applications.map((application) => application.id)).toEqual([
      submitted.id,
    ])
  })

  it('isolates applications across schools', async () => {
    await env.DB.prepare(
      `INSERT INTO leave_applications
         (id, employee_id, leave_type_id, start_date, end_date, days, status)
       VALUES ('la-s2', 'e-2', 'lt-global-vl', '2026-04-01', '2026-04-02', 2, 'draft')`,
    ).run()

    expect(
      (await get('/api/schools/s-1/leave-applications/la-s2', ao.cookie)).status,
    ).toBe(404)

    const list = await (
      await get('/api/schools/s-1/leave-applications', ao.cookie)
    ).json<{ applications: LeaveApplication[] }>()
    expect(list.applications.map((application) => application.id)).not.toContain(
      'la-s2',
    )

    expect(
      (
        await patch('/api/schools/s-1/leave-applications/la-s2', ao.cookie, {
          remarks: 'nope',
        })
      ).status,
    ).toBe(404)
  })
})
