// Slot assignment + normalization.
import { toMinutes, toHHMM } from './dateUtils';
import type { DayMap, EmployeeAttendance, RawPunch } from './types';

/** Sorted punches for one day → AM-IN / AM-OUT / PM-IN / PM-OUT. */
export function assignFourSlots(times: string[]): [string, string, string, string] {
  const mins = times.map(toMinutes).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  if (mins.length === 0) return ['', '', '', ''];
  if (mins.length === 1) return [toHHMM(mins[0]), '', '', ''];
  if (mins.length === 2) {
    const [a, b] = mins;
    if (b < 12 * 60) return [toHHMM(a), toHHMM(b), '', ''];
    if (a >= 12 * 60) return ['', '', toHHMM(a), toHHMM(b)];
    return [toHHMM(a), '', '', toHHMM(b)];
  }
  if (mins.length === 3) {
    const [a, b, c] = mins;
    if (c < 12 * 60) return [toHHMM(a), toHHMM(c), '', ''];
    if (a >= 12 * 60) return ['', '', toHHMM(a), toHHMM(c)];
    return [toHHMM(a), toHHMM(b), '', toHHMM(c)];
  }
  const first = mins[0];
  const last = mins[mins.length - 1];
  const middle = mins.slice(1, -1);
  let amOut = middle[0];
  let pmIn = middle[middle.length - 1];
  if (middle.length > 2) {
    let best = 0;
    let bestGap = -1;
    for (let i = 0; i < middle.length - 1; i++) {
      const gap = middle[i + 1] - middle[i];
      if (gap > bestGap) { bestGap = gap; best = i; }
    }
    amOut = middle[best];
    pmIn = middle[best + 1];
  }
  return [toHHMM(first), toHHMM(amOut), toHHMM(pmIn), toHHMM(last)];
}

/** Collapse RawPunch[] into per-employee per-day 4-slot attendance. */
export function normalizePunches(punches: RawPunch[]): EmployeeAttendance[] {
  const byEmp = new Map<string, Map<string, string[]>>();
  for (const p of punches) {
    if (!p.employee || !p.date || !p.time) continue;
    let days = byEmp.get(p.employee);
    if (!days) { days = new Map(); byEmp.set(p.employee, days); }
    let list = days.get(p.date);
    if (!list) { list = []; days.set(p.date, list); }
    list.push(p.time);
  }
  const out: EmployeeAttendance[] = [];
  for (const [name, days] of byEmp) {
    const dayMap: DayMap = {};
    for (const [date, times] of days) {
      const [amIn, amOut, pmIn, pmOut] = assignFourSlots(times);
      dayMap[date] = { amIn, amOut, pmIn, pmOut, corrected: false };
    }
    out.push({ name, days: dayMap });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
