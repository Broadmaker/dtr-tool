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

type Employee = {
  id: string
  schoolId: string
  employeeNo: string | null
  firstName: string
  lastName: string
  position: string | null
  isActive: boolean
}

type EmployeeList = { employees: Employee[] }

describe('employees', () => {
  let systemAdmin: SignedInUser
  let ao: SignedInUser
  let outsider: SignedInUser

  beforeAll(async () => {
    systemAdmin = await signUp('Super Admin', 'sysadmin@example.com')
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

    await insertEmployee('e-1', 's-1', 'Ana', 'Cruz', {
      employeeNo: 'EMP_1',
      position: 'Teacher I',
    })
    await insertEmployee('e-2', 's-1', 'Ben', 'Reyes', {
      employeeNo: 'EMPX1',
      isActive: false,
    })
    await insertEmployee('e-3', 's-2', 'Cara', 'Lim', { employeeNo: 'EMP_1' })
  })

  it('requires a session and school membership', async () => {
    expect((await api('/api/schools/s-1/employees')).status).toBe(401)
    expect(
      (await get('/api/schools/s-1/employees', outsider.cookie)).status,
    ).toBe(404)
    expect((await get('/api/schools/s-1/employees', ao.cookie)).status).toBe(200)
  })

  it('lists active employees in name order by default', async () => {
    const body = await (
      await get('/api/schools/s-1/employees', ao.cookie)
    ).json<EmployeeList>()

    expect(body.employees.map((employee) => employee.id)).toEqual(['e-1'])
    expect(body.employees[0]).toMatchObject({
      firstName: 'Ana',
      lastName: 'Cruz',
      employeeNo: 'EMP_1',
      isActive: true,
    })
  })

  it('can include inactive employees', async () => {
    const body = await (
      await get('/api/schools/s-1/employees?includeInactive=true', ao.cookie)
    ).json<EmployeeList>()

    expect(body.employees.map((employee) => employee.id)).toEqual(['e-1', 'e-2'])
    expect(body.employees[1]?.isActive).toBe(false)
  })

  it('searches by name and employee number with literal wildcards', async () => {
    const byName = await (
      await get('/api/schools/s-1/employees?search=an', ao.cookie)
    ).json<EmployeeList>()
    expect(byName.employees.map((employee) => employee.id)).toEqual(['e-1'])

    const byLastName = await (
      await get('/api/schools/s-1/employees?search=Cruz', ao.cookie)
    ).json<EmployeeList>()
    expect(byLastName.employees.map((employee) => employee.id)).toEqual(['e-1'])

    const byNumber = await (
      await get(
        '/api/schools/s-1/employees?search=EMPX&includeInactive=true',
        ao.cookie,
      )
    ).json<EmployeeList>()
    expect(byNumber.employees.map((employee) => employee.id)).toEqual(['e-2'])

    const underscore = await (
      await get('/api/schools/s-1/employees?search=EMP_', ao.cookie)
    ).json<EmployeeList>()
    expect(underscore.employees.map((employee) => employee.id)).toEqual(['e-1'])

    const wildcard = await (
      await get('/api/schools/s-1/employees?search=%25', ao.cookie)
    ).json<EmployeeList>()
    expect(wildcard.employees).toEqual([])
  })

  it('creates employees and records an audit event', async () => {
    const response = await post('/api/schools/s-1/employees', ao.cookie, {
      employeeNo: '  EMP-9  ',
      firstName: '  Dana  ',
      lastName: 'Santos',
      position: 'Head Teacher',
    })
    expect(response.status).toBe(201)

    const body = await response.json<{ employee: Employee }>()
    expect(body.employee).toMatchObject({
      employeeNo: 'EMP-9',
      firstName: 'Dana',
      lastName: 'Santos',
      isActive: true,
    })

    const audit = await env.DB.prepare(
      `SELECT action FROM audit_log WHERE entity_id = ?`,
    )
      .bind(body.employee.id)
      .first<{ action: string }>()
    expect(audit?.action).toBe('employee.create')

    const duplicate = await post('/api/schools/s-1/employees', ao.cookie, {
      employeeNo: 'EMP_1',
      firstName: 'Eve',
      lastName: 'Torres',
    })
    expect(duplicate.status).toBe(409)

    const invalid = await post('/api/schools/s-1/employees', ao.cookie, {
      firstName: 'No Last Name',
    })
    expect(invalid.status).toBe(400)
  })

  it('lets a super admin write to any school', async () => {
    const response = await post('/api/schools/s-2/employees', systemAdmin.cookie, {
      firstName: 'Admin',
      lastName: 'Added',
    })
    expect(response.status).toBe(201)
  })

  it('updates employees and toggles activation', async () => {
    const response = await patch('/api/schools/s-1/employees/e-1', ao.cookie, {
      position: 'Master Teacher',
      isActive: false,
    })
    expect(response.status).toBe(200)

    const body = await response.json<{ employee: Employee }>()
    expect(body.employee).toMatchObject({
      position: 'Master Teacher',
      isActive: false,
    })

    const read = await get('/api/schools/s-1/employees/e-1', ao.cookie)
    expect((await read.json<{ employee: Employee }>()).employee.isActive).toBe(false)

    expect(
      (await patch('/api/schools/s-1/employees/e-3', ao.cookie, { position: 'X' }))
        .status,
    ).toBe(404)
  })

  it('deactivates instead of deleting', async () => {
    const response = await del('/api/schools/s-1/employees/e-1', ao.cookie)
    expect(response.status).toBe(200)

    const row = await env.DB.prepare(
      `SELECT is_active AS isActive FROM employees WHERE id = 'e-1'`,
    ).first<{ isActive: number }>()
    expect(row?.isActive).toBe(0)

    const again = await del('/api/schools/s-1/employees/e-1', ao.cookie)
    expect(await again.json()).toEqual({ ok: true, deactivated: true })
    expect((await del('/api/schools/s-1/employees/e-3', ao.cookie)).status).toBe(404)
  })

  it('isolates tenants', async () => {
    const body = await (
      await get('/api/schools/s-1/employees', ao.cookie)
    ).json<EmployeeList>()
    expect(body.employees.map((employee) => employee.id)).not.toContain('e-3')

    expect((await get('/api/schools/s-1/employees/e-3', ao.cookie)).status).toBe(404)
  })
})
