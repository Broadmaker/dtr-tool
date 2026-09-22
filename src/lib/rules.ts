import { daysInMonth, toISODate, toMinutes, weekdayOf } from './dateUtils';
import type { DayEntry, HolidayEntry, LeaveEntry, ResolvedDay, ValidationIssue } from './types';
import { emptyDay } from './types';

export function undertimeForDay(d: ResolvedDay): { h: number; m: number; total: number } {
  if (d.kind === 'weekend' || d.kind === 'holiday' || d.kind === 'leave') return { h: 0, m: 0, total: 0 };
  if (!d.hasPunch) return { h: 8, m: 0, total: 480 };
  const amIn = toMinutes(d.entry.amIn);
  const amOut = toMinutes(d.entry.amOut);
  const pmIn = toMinutes(d.entry.pmIn);
  const pmOut = toMinutes(d.entry.pmOut);
  let amWorked = 0;
  let pmWorked = 0;
  if (!Number.isNaN(amIn) && !Number.isNaN(amOut) && amOut > amIn) amWorked = amOut - amIn;
  if (!Number.isNaN(pmIn) && !Number.isNaN(pmOut) && pmOut > pmIn) pmWorked = pmOut - pmIn;
  const worked = amWorked + pmWorked;
  const under = Math.max(0, 480 - worked);
  return { h: Math.floor(under / 60), m: under % 60, total: under };
}

export function totalUndertime(days: ResolvedDay[]): { h: number; m: number; total: number } {
  let total = 0;
  for (const d of days) total += undertimeForDay(d).total;
  return { h: Math.floor(total / 60), m: total % 60, total };
}

export function resolveMonth(days: Record<string, DayEntry>, month: number, year: number, holidays: HolidayEntry[], leaves: LeaveEntry[]): ResolvedDay[] {
  const hol = new Map(holidays.map((h) => [h.date, h]));
  const lv = new Map(leaves.map((l) => [l.date, l.leaveType]));
  const n = daysInMonth(month, year);
  const out: ResolvedDay[] = [];
  for (let d = 1; d <= n; d++) {
    const date = toISODate(year, month, d);
    const wd = weekdayOf(date);
    const entry = days[date] ?? emptyDay();
    const h = hol.get(date);
    const lt = lv.get(date);
    const slots = [entry.amIn, entry.amOut, entry.pmIn, entry.pmOut];
    const filled = slots.filter(Boolean).length;
    const hasPunch = filled > 0;
    const incomplete = hasPunch && filled < 4;
    let kind: ResolvedDay['kind'] = 'workday';
    if (h) kind = 'holiday';
    else if (lt) kind = 'leave';
    else if (wd === 0 || wd === 6) kind = 'weekend';
    else if (!hasPunch) kind = 'empty';
    out.push({ date, dayOfMonth: d, weekday: wd, kind, entry, holiday: h, leaveType: lt, hasPunch, incomplete });
  }
  return out;
}

export function validateDays(days: ResolvedDay[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const d of days) {
    if (d.incomplete && d.kind !== 'holiday' && d.kind !== 'leave') {
      issues.push({ level: 'warning', date: d.date, message: `Incomplete punches on ${d.date}` });
    }
    if (d.kind === 'empty') {
      issues.push({ level: 'info', date: d.date, message: `No punches on ${d.date}` });
    }
  }
  return issues;
}
