import { describe, expect, it } from 'vitest'
import { cloudDtrToLocal } from './cloudDtr'
import type { CloudDtrDay, CloudDtrPeriod, CloudEmployee } from './api'

const period: CloudDtrPeriod = {
  id: 'p-1', schoolId: 's-1', employeeId: 'e-1', employeeName: 'Ana Cruz',
  year: 2026, month: 3, status: 'approved', lockedAt: null,
  reviewedById: 'u-1', reviewedByName: 'AO One', reviewedAt: 1,
  approvedById: 'u-1', approvedByName: 'AO One', approvedAt: 2,
}

const employee: CloudEmployee = {
  id: 'e-1', schoolId: 's-1', employeeNo: '1001', firstName: 'Ana',
  middleName: null, lastName: 'Cruz', suffix: null, position: 'Teacher I',
  isActive: true,
}

function day(input: Partial<CloudDtrDay> & Pick<CloudDtrDay, 'workDate'>): CloudDtrDay {
  const { workDate, ...rest } = input
  return {
    id: workDate, periodId: 'p-1', workDate,
    amIn: null, amOut: null, pmIn: null, pmOut: null,
    dayType: 'work', remarks: null, source: 'import',
    leaveApplicationId: null, createdAt: 1, updatedAt: 1,
    ...rest,
  }
}

describe('cloud DTR reconstruction', () => {
  it('restores attendance, roster information, holidays, and leave markings', () => {
    const result = cloudDtrToLocal(period, employee, [
      day({ workDate: '2026-03-02', amIn: '08:00', pmOut: '17:00' }),
      day({ workDate: '2026-03-03', dayType: 'holiday', remarks: 'Araw ng Dabaw' }),
      day({ workDate: '2026-03-04', dayType: 'leave', remarks: 'VL', source: 'correction' }),
    ])

    expect(result.parsed.employees[0]).toMatchObject({
      name: 'Ana Cruz',
      employeeNo: '1001',
      days: {
        '2026-03-02': { amIn: '08:00', pmOut: '17:00', corrected: false },
        '2026-03-04': { corrected: true },
      },
    })
    expect(result.holidays).toEqual([
      { date: '2026-03-03', description: 'Araw ng Dabaw', type: 'Regular' },
    ])
    expect(result.leaves['Ana Cruz']).toEqual([{ date: '2026-03-04', leaveType: 'VL' }])
    expect(result.empInfos['Ana Cruz']).toMatchObject({ position: 'Teacher I' })
  })
})
