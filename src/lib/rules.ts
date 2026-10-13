import { daysInMonth, toISODate, toMinutes, weekdayOf } from './dateUtils';
import { classifyDay, lateForDay, parseOfficialHours, requiredMinutes } from './schedule';
import type { DayEntry, HolidayEntry, LeaveEntry, ResolvedDay, ValidationIssue } from './types';
import { emptyDay } from './types';

export function undertimeForDay(d: ResolvedDay, scheduleStr?: string): { h: number; m: number; total: number } {
  if (d.kind === 'weekend' || d.kind === 'holiday' || d.kind === 'leave') return { h: 0, m: 0, total: 0 };
  const required = requiredMinutes(parseOfficialHours(scheduleStr ?? ''));
  if (!d.hasPunch) return { h: Math.floor(required / 60), m: required % 60, total: required };
  const amIn = toMinutes(d.entry.amIn);
  const amOut = toMinutes(d.entry.amOut);
  const pmIn = toMinutes(d.entry.pmIn);
  const pmOut = toMinutes(d.entry.pmOut);
  let amWorked = 0;
  let pmWorked = 0;
  if (!Number.isNaN(amIn) && !Number.isNaN(amOut) && amOut > amIn) amWorked = amOut - amIn;
  if (!Number.isNaN(pmIn) && !Number.isNaN(pmOut) && pmOut > pmIn) pmWorked = pmOut - pmIn;
  const worked = amWorked + pmWorked;
  const under = Math.max(0, required - worked);
  return { h: Math.floor(under / 60), m: under % 60, total: under };
}

export function totalUndertime(days: ResolvedDay[], scheduleStr?: string): { h: number; m: number; total: number } {
  let total = 0;
  for (const d of days) total += undertimeForDay(d, scheduleStr).total;
  return { h: Math.floor(total / 60), m: total % 60, total };
}

/** Late arrival vs the printed schedule (AM-IN + PM-IN). Zero for weekend/holiday/leave. */
export function lateForResolvedDay(d: ResolvedDay, scheduleStr?: string): { h: number; m: number; total: number } {
  if (d.kind === 'weekend' || d.kind === 'holiday' || d.kind === 'leave' || !d.hasPunch) {
    return { h: 0, m: 0, total: 0 };
  }
  const late = lateForDay(d.entry, scheduleStr);
  return { h: Math.floor(late.total / 60), m: late.total % 60, total: late.total };
}

/** Full / half-day / absent / incomplete classification against the schedule. */
export function attendanceForResolvedDay(d: ResolvedDay, scheduleStr?: string) {
  if (d.kind === 'weekend' || d.kind === 'holiday' || d.kind === 'leave' || !d.hasPunch) {
    return classifyDay({ amIn: '', amOut: '', pmIn: '', pmOut: '' }, scheduleStr);
  }
  return classifyDay(d.entry, scheduleStr);
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

export function validateDays(days: ResolvedDay[], scheduleStr?: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const d of days) {
    const attendance = d.hasPunch && d.kind !== 'holiday' && d.kind !== 'leave'
      ? classifyDay(d.entry, scheduleStr).status
      : null;
    if (d.incomplete && d.kind !== 'holiday' && d.kind !== 'leave' && attendance !== 'half-am' && attendance !== 'half-pm') {
      issues.push({ level: 'warning', date: d.date, message: `Incomplete punches on ${d.date}` });
    }
    if (attendance === 'half-am' || attendance === 'half-pm') {
      issues.push({
        level: 'info',
        date: d.date,
        message: `Half-day (${attendance === 'half-am' ? 'AM' : 'PM'} only) on ${d.date}`,
      });
    }
    if (d.kind === 'empty') {
      issues.push({ level: 'info', date: d.date, message: `No punches on ${d.date}` });
    }
    if (d.hasPunch && d.kind === 'weekend') {
      issues.push({ level: 'warning', date: d.date, message: `Weekend punch on ${d.date} — verify if overtime` });
    }
    if (d.hasPunch && d.kind === 'holiday') {
      issues.push({ level: 'warning', date: d.date, message: `Holiday punch on ${d.date} — verify if required` });
    }
    if (d.hasPunch && d.kind === 'leave') {
      issues.push({ level: 'warning', date: d.date, message: `Punch on leave day ${d.date} — leave may need review` });
    }
    // Time-order sanity: OUT before IN is almost always a data/entry error.
    const amIn = toMinutes(d.entry.amIn);
    const amOut = toMinutes(d.entry.amOut);
    const pmIn = toMinutes(d.entry.pmIn);
    const pmOut = toMinutes(d.entry.pmOut);
    if (!Number.isNaN(amIn) && !Number.isNaN(amOut) && amOut < amIn) {
      issues.push({ level: 'warning', date: d.date, message: `AM OUT before AM IN on ${d.date}` });
    }
    if (!Number.isNaN(pmIn) && !Number.isNaN(pmOut) && pmOut < pmIn) {
      issues.push({ level: 'warning', date: d.date, message: `PM OUT before PM IN on ${d.date}` });
    }
    // Overnight heuristic: the 4-slot model assumes same-day shifts. Very
    // early arrivals or very late departures may belong to an adjacent day.
    if (d.hasPunch && d.kind !== 'holiday' && d.kind !== 'leave') {
      const early = !Number.isNaN(amIn) && amIn < 4 * 60;
      const late = !Number.isNaN(pmOut) && pmOut >= 22 * 60;
      if (early || late) {
        issues.push({
          level: 'info',
          date: d.date,
          message: `Possible overnight shift on ${d.date} — verify the punches belong to this day`,
        });
      }
    }
  }
  return issues;
}
