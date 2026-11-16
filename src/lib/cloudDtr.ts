import type { CloudDtrDay, CloudDtrPeriod, CloudEmployee } from './api'
import type { ParseResult } from './parser'
import type { EmployeeInfo, HolidayEntry, LeaveEntry } from './types'

export type LocalCloudDtr = {
  parsed: ParseResult
  fileName: string
  holidays: HolidayEntry[]
  leaves: Record<string, LeaveEntry[]>
  empInfos: Record<string, Partial<EmployeeInfo>>
}

/** Rebuild the local editor model from structured cloud records. */
export function cloudDtrToLocal(
  period: CloudDtrPeriod,
  employee: CloudEmployee,
  days: CloudDtrDay[],
): LocalCloudDtr {
  const name = period.employeeName
  const dayMap = Object.fromEntries(
    days.map((day) => [
      day.workDate,
      {
        amIn: day.amIn ?? '',
        amOut: day.amOut ?? '',
        pmIn: day.pmIn ?? '',
        pmOut: day.pmOut ?? '',
        corrected: day.source !== 'import',
      },
    ]),
  )

  const holidays: HolidayEntry[] = days
    .filter((day) => day.dayType === 'holiday')
    .map((day) => ({
      date: day.workDate,
      description: day.remarks?.trim() || 'Holiday',
      type: 'Regular',
    }))
  const leaveDays: LeaveEntry[] = days
    .filter((day) => day.dayType === 'leave')
    .map((day) => ({
      date: day.workDate,
      leaveType: day.remarks?.trim() || 'Leave',
    }))
  const rows = days.map((day) => [
    name,
    day.workDate,
    day.amIn ?? '',
    day.amOut ?? '',
    day.pmIn ?? '',
    day.pmOut ?? '',
  ])

  return {
    parsed: {
      punches: [],
      employees: [{ name, employeeNo: employee.employeeNo ?? undefined, days: dayMap }],
      sheetName: 'Cloud DTR',
      warnings: [],
      preview: {
        sheetName: 'Cloud DTR',
        headers: ['Employee', 'Date', 'AM-IN', 'AM-OUT', 'PM-IN', 'PM-OUT'],
        rows,
        totalRows: rows.length,
      },
    },
    fileName: `Cloud DTR - ${name} - ${String(period.month).padStart(2, '0')}-${period.year}`,
    holidays,
    leaves: leaveDays.length ? { [name]: leaveDays } : {},
    empInfos: {
      [name]: {
        name,
        position: employee.position ?? '',
      },
    },
  }
}
